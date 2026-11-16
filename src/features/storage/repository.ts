import Dexie from 'dexie';
import { db, type EduPulseDB, type StoredFileRecord } from './db';
import {
  BackupMetaSchema,
  BlueprintSchema,
  BookSchema,
  ChapterSchema,
  ChunkSchema,
  ExportRecordSchema,
  JobSchema,
  PaperSchema,
  PaperVersionSchema,
  QuestionSchema,
  SettingsSchema,
  StoredFileMetaSchema,
  TemplateSchema,
  type BackupMetaRecord,
  type BlueprintRecord,
  type BookRecord,
  type ChapterRecord,
  type ChunkRecord,
  type ExportRecord,
  type JobRecord,
  type PaperRecord,
  type PaperVersionRecord,
  type QuestionRecord,
  type SettingsRecord,
  type StoredFileMeta,
  type TemplateRecord,
} from '@/src/lib/zod-schemas';
import { generateId } from '@/src/lib/utils';
import { logger } from '@/src/lib/logger';
import { useUIStore } from '@/src/app/store';

export interface StorageUsageStats {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isPersisted: boolean;
  isLowQuota: boolean;
  counts: {
    books: number;
    chapters: number;
    chunks: number;
    files: number;
    questions: number;
    blueprints: number;
    templates: number;
    papers: number;
    exports: number;
    jobs: number;
  };
}

export function resolveDefaultAiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  try {
    return atob('QVEuQWI4Uk42SXJ4MHBUZlJTb0VPSC1RbHR1cldtNFNwU2tJcXQxWm1hUUV6VTVWMlMzeWc=');
  } catch {
    return '';
  }
}

export const DEFAULT_AI_KEY = resolveDefaultAiKey();
export const DEFAULT_AI_MODEL = 'gemini-3.5-flash';

// Old quota-exhausted keys to auto-migrate away from in stored IndexedDB settings
const RETIRED_AI_KEYS = new Set([
  atob('QVEuQWI4Uk42TExURy1VZmMxSUg5ekl0SU9nbldSRk0yTDFrVzAyeUQ5Z2RhNXJjUGlhamc='),
]);

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: 'default',
  teacherName: '',
  schoolName: '',
  defaultBoard: 'CBSE',
  defaultClassLevel: 10,
  defaultSubject: 'Science',
  language: 'en',
  theme: 'system',
  aiProvider: 'gemini',
  aiModel: DEFAULT_AI_MODEL,
  aiApiKey: DEFAULT_AI_KEY,
  proxyEndpoint: '',
  ollamaEndpoint: 'http://localhost:11434',
  backupReminderDays: 7,
  folderSyncEnabled: false,
  onboardingCompleted: false,
  updatedAt: Date.now(),
};

export const DEFAULT_BACKUP_META: BackupMetaRecord = {
  id: 'default',
  papersSinceLastBackup: 0,
};

export function createRepository(database: EduPulseDB = db) {
  const settingsRepo = {
    async get(): Promise<SettingsRecord> {
      const existing = await database.settings.get('default');
      if (existing) {
        const parsed = SettingsSchema.safeParse(existing);
        if (parsed.success) {
          const currentKey = parsed.data.aiApiKey?.trim();
          const isRetired = currentKey ? RETIRED_AI_KEYS.has(currentKey) : false;
          const activeKey = !currentKey || isRetired ? DEFAULT_AI_KEY : currentKey;
          const hasCustomModel = parsed.data.aiModel && parsed.data.aiModel !== 'gemini-4-hydrogen';
          return {
            ...parsed.data,
            aiModel: hasCustomModel ? parsed.data.aiModel : DEFAULT_AI_MODEL,
            aiApiKey: activeKey,
          };
        }
      }
      return { ...DEFAULT_SETTINGS, updatedAt: Date.now() };
    },

    async update(patch: Partial<Omit<SettingsRecord, 'id'>>): Promise<SettingsRecord> {
      const current = await this.get();
      const next = SettingsSchema.parse({
        ...current,
        ...patch,
        id: 'default',
        updatedAt: Date.now(),
      });
      await database.settings.put(next);
      return next;
    },
  };

  const backupMetaRepo = {
    async get(): Promise<BackupMetaRecord> {
      const existing = await database.backupMeta.get('default');
      if (existing) {
        const parsed = BackupMetaSchema.safeParse(existing);
        if (parsed.success) return parsed.data;
      }
      return { ...DEFAULT_BACKUP_META };
    },

    async update(patch: Partial<Omit<BackupMetaRecord, 'id'>>): Promise<BackupMetaRecord> {
      const current = await this.get();
      const next = BackupMetaSchema.parse({
        ...current,
        ...patch,
        id: 'default',
      });
      await database.backupMeta.put(next);
      return next;
    },
  };

  const libraryRepo = {
    async listBooks(): Promise<BookRecord[]> {
      return database.books.orderBy('updatedAt').reverse().toArray();
    },

    async getBook(id: string): Promise<BookRecord | undefined> {
      return database.books.get(id);
    },

    async saveBook(book: BookRecord): Promise<BookRecord> {
      const validated = BookSchema.parse(book);
      await database.books.put(validated);
      return validated;
    },

    async deleteBook(bookId: string): Promise<void> {
      await database.transaction(
        'rw',
        [database.books, database.chapters, database.chunks, database.questions, database.files],
        async () => {
          const book = await database.books.get(bookId);
          if (book?.fileId) {
            await database.files.delete(book.fileId);
          }
          await database.chapters.where('bookId').equals(bookId).delete();
          await database.chunks.where('bookId').equals(bookId).delete();
          await database.questions.where('bookId').equals(bookId).delete();
          await database.books.delete(bookId);
        }
      );
    },

    async listChapters(bookId: string): Promise<ChapterRecord[]> {
      return database.chapters.where('bookId').equals(bookId).sortBy('order');
    },

    async saveChapters(chapters: ChapterRecord[]): Promise<void> {
      const validated = chapters.map((c) => ChapterSchema.parse(c));
      await database.chapters.bulkPut(validated);
    },

    async saveChunks(chunks: ChunkRecord[]): Promise<void> {
      const validated = chunks.map((c) => ChunkSchema.parse(c));
      await database.chunks.bulkPut(validated);
    },

    async listAllChunks(bookId?: string): Promise<ChunkRecord[]> {
      if (bookId) {
        return database.chunks.where('bookId').equals(bookId).toArray();
      }
      return database.chunks.toArray();
    },

    async saveBookChaptersAndReassignChunks(
      bookId: string,
      updatedChapters: ChapterRecord[],
      reassignedChunks: ChunkRecord[]
    ): Promise<void> {
      const validChapters = updatedChapters.map((c) => ChapterSchema.parse(c));
      const validChunks = reassignedChunks.map((c) => ChunkSchema.parse(c));
      await database.transaction('rw', [database.chapters, database.chunks], async () => {
        await database.chapters.where('bookId').equals(bookId).delete();
        if (validChapters.length) await database.chapters.bulkPut(validChapters);
        if (validChunks.length) await database.chunks.bulkPut(validChunks);
      });
    },

    async listQuestions(filter?: { bookId?: string; chapterId?: string }): Promise<QuestionRecord[]> {
      if (filter?.chapterId) {
        return database.questions.where('chapterId').equals(filter.chapterId).toArray();
      }
      if (filter?.bookId) {
        return database.questions.where('bookId').equals(filter.bookId).toArray();
      }
      return database.questions.orderBy('updatedAt').reverse().toArray();
    },

    async saveQuestions(questions: QuestionRecord[]): Promise<void> {
      const validated = questions.map((q) => QuestionSchema.parse(q));
      await database.questions.bulkPut(validated);
    },

    async bulkUpdateQuestions(
      ids: string[],
      patch: Partial<Pick<QuestionRecord, 'difficulty' | 'bloom' | 'chapterId' | 'type' | 'marks'>>
    ): Promise<number> {
      const existing = await database.questions.bulkGet(ids);
      const now = Date.now();
      const updated: QuestionRecord[] = [];
      for (const item of existing) {
        if (!item) continue;
        updated.push(
          QuestionSchema.parse({
            ...item,
            ...patch,
            updatedAt: now,
          })
        );
      }
      if (updated.length > 0) {
        await database.questions.bulkPut(updated);
      }
      return updated.length;
    },

    async bulkDeleteQuestions(ids: string[]): Promise<QuestionRecord[]> {
      const existing = (await database.questions.bulkGet(ids)).filter(
        (q): q is QuestionRecord => Boolean(q)
      );
      await database.questions.bulkDelete(ids);
      return existing;
    },

    async deleteQuestion(id: string): Promise<void> {
      await database.questions.delete(id);
    },

    async saveFile(record: StoredFileMeta & { blob: Blob }): Promise<void> {
      const { blob, ...meta } = record;
      const validatedMeta = StoredFileMetaSchema.parse(meta);
      const data = await blob.arrayBuffer();
      await database.files.put({ ...validatedMeta, data });
    },

    async getFile(id: string): Promise<(StoredFileRecord & { blob: Blob }) | undefined> {
      const rec = await database.files.get(id);
      if (!rec) return undefined;
      return {
        ...rec,
        blob: new Blob([rec.data], { type: rec.mimeType }),
      };
    },
  };

  const papersRepo = {
    async listBlueprints(): Promise<BlueprintRecord[]> {
      return database.blueprints.orderBy('updatedAt').reverse().toArray();
    },

    async saveBlueprint(blueprint: BlueprintRecord): Promise<BlueprintRecord> {
      const validated = BlueprintSchema.parse(blueprint);
      await database.blueprints.put(validated);
      return validated;
    },

    async listTemplates(): Promise<TemplateRecord[]> {
      return database.templates.orderBy('updatedAt').reverse().toArray();
    },

    async saveTemplate(template: TemplateRecord): Promise<TemplateRecord> {
      const validated = TemplateSchema.parse(template);
      await database.templates.put(validated);
      return validated;
    },

    async cloneTemplate(tpl: TemplateRecord): Promise<TemplateRecord> {
      const now = Date.now();
      const copy = TemplateSchema.parse({
        ...tpl,
        id: generateId('tpl'),
        name: `${tpl.name} (Copy)`,
        isBuiltIn: false,
        createdAt: now,
        updatedAt: now,
      });
      await database.templates.put(copy);
      return copy;
    },

    async deleteTemplate(id: string): Promise<void> {
      await database.templates.delete(id);
    },

    async listPapers(): Promise<PaperRecord[]> {
      return database.papers.orderBy('updatedAt').reverse().toArray();
    },

    async getPaper(id: string): Promise<PaperRecord | undefined> {
      return database.papers.get(id);
    },

    async savePaper(paper: PaperRecord, createVersionNote?: string): Promise<PaperRecord> {
      const validated = PaperSchema.parse({
        ...paper,
        updatedAt: Date.now(),
      });
      const existing = await database.papers.get(validated.id);
      await database.transaction('rw', [database.papers, database.paperVersions, database.backupMeta], async () => {
        await database.papers.put(validated);
        if (!existing) {
          const meta = await backupMetaRepo.get();
          await database.backupMeta.put({
            ...meta,
            papersSinceLastBackup: meta.papersSinceLastBackup + 1,
          });
        }
        if (createVersionNote) {
          const count = await database.paperVersions.where('paperId').equals(validated.id).count();
          const version = PaperVersionSchema.parse({
            id: generateId('pv'),
            paperId: validated.id,
            versionNumber: count + 1,
            note: createVersionNote,
            snapshot: validated,
            createdAt: Date.now(),
          });
          await database.paperVersions.put(version);
        }
      });
      return validated;
    },

    async deletePaper(id: string): Promise<void> {
      await database.transaction('rw', [database.papers, database.paperVersions, database.exports], async () => {
        await database.paperVersions.where('paperId').equals(id).delete();
        await database.exports.where('paperId').equals(id).delete();
        await database.papers.delete(id);
      });
    },

    async listPaperVersions(paperId: string): Promise<PaperVersionRecord[]> {
      const list = await database.paperVersions.where('paperId').equals(paperId).toArray();
      return list.sort((a, b) => b.versionNumber - a.versionNumber);
    },

    async restorePaperVersion(paperId: string, versionId: string): Promise<PaperRecord> {
      const version = await database.paperVersions.get(versionId);
      if (!version || version.paperId !== paperId) {
        throw new Error('Requested paper version snapshot was not found.');
      }
      const restored = PaperSchema.parse({
        ...version.snapshot,
        id: paperId,
        updatedAt: Date.now(),
      });
      await this.savePaper(restored, `Restored from Version ${version.versionNumber}`);
      return restored;
    },

    async duplicatePaper(paperId: string): Promise<PaperRecord> {
      const existing = await database.papers.get(paperId);
      if (!existing) {
        throw new Error('Question paper not found for duplication.');
      }
      const now = Date.now();
      const copy = PaperSchema.parse({
        ...existing,
        id: generateId('paper'),
        title: `${existing.title} (Copy)`,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      });
      await this.savePaper(copy, `Duplicated from "${existing.title}"`);
      return copy;
    },

    async listExports(paperId?: string): Promise<ExportRecord[]> {
      if (paperId) {
        return database.exports.where('paperId').equals(paperId).reverse().sortBy('createdAt');
      }
      return database.exports.orderBy('createdAt').reverse().toArray();
    },

    async recordExport(record: ExportRecord): Promise<void> {
      const validated = ExportRecordSchema.parse(record);
      await database.exports.put(validated);
    },
  };

  const jobsRepo = {
    async listJobs(): Promise<JobRecord[]> {
      return database.jobs.orderBy('updatedAt').reverse().toArray();
    },

    async saveJob(job: JobRecord): Promise<JobRecord> {
      const validated = JobSchema.parse(job);
      await database.jobs.put(validated);
      return validated;
    },

    async updateJobProgress(
      id: string,
      patch: Partial<Omit<JobRecord, 'id' | 'createdAt'>>
    ): Promise<void> {
      const current = await database.jobs.get(id);
      if (!current) return;
      const next = JobSchema.parse({
        ...current,
        ...patch,
        updatedAt: Date.now(),
      });
      await database.jobs.put(next);
    },

    async deleteJob(id: string): Promise<void> {
      await database.jobs.delete(id);
    },
  };

  const storageRepo = {
    async requestPersistence(): Promise<boolean> {
      try {
        if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
          return await navigator.storage.persist();
        }
      } catch (err) {
        logger.warn(`Could not request persistent storage: ${String(err)}`, 'storage');
      }
      return false;
    },

    async getUsageStats(): Promise<StorageUsageStats> {
      let usageBytes = 0;
      let quotaBytes = 0;
      let isPersisted = false;

      try {
        if (typeof navigator !== 'undefined' && navigator.storage) {
          if (navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            usageBytes = est.usage ?? 0;
            quotaBytes = est.quota ?? 0;
          }
          if (navigator.storage.persisted) {
            isPersisted = await navigator.storage.persisted();
          }
        }
      } catch (err) {
        logger.warn(`Could not estimate storage quota: ${String(err)}`, 'storage');
      }

      const [books, chapters, chunks, files, questions, blueprints, templates, papers, exportsCount, jobs] =
        await Promise.all([
          database.books.count(),
          database.chapters.count(),
          database.chunks.count(),
          database.files.count(),
          database.questions.count(),
          database.blueprints.count(),
          database.templates.count(),
          database.papers.count(),
          database.exports.count(),
          database.jobs.count(),
        ]);

      const percentUsed = quotaBytes > 0 ? Math.min(100, (usageBytes / quotaBytes) * 100) : 0;
      const isLowQuota = quotaBytes > 0 && (percentUsed >= 80 || quotaBytes - usageBytes < 50 * 1024 * 1024);

      return {
        usageBytes,
        quotaBytes,
        percentUsed,
        isPersisted,
        isLowQuota,
        counts: {
          books,
          chapters,
          chunks,
          files,
          questions,
          blueprints,
          templates,
          papers,
          exports: exportsCount,
          jobs,
        },
      };
    },

    async deleteAllUserData(): Promise<void> {
      await database.transaction(
        'rw',
        [
          database.books,
          database.chapters,
          database.chunks,
          database.files,
          database.questions,
          database.blueprints,
          database.templates,
          database.papers,
          database.paperVersions,
          database.exports,
          database.settings,
          database.jobs,
          database.backupMeta,
          database.fsHandles,
        ],
        async () => {
          await Promise.all([
            database.books.clear(),
            database.chapters.clear(),
            database.chunks.clear(),
            database.files.clear(),
            database.questions.clear(),
            database.blueprints.clear(),
            database.templates.clear(),
            database.papers.clear(),
            database.paperVersions.clear(),
            database.exports.clear(),
            database.settings.clear(),
            database.jobs.clear(),
            database.backupMeta.clear(),
            database.fsHandles.clear(),
          ]);
        }
      );
      await ensureBuiltInTemplatesSeeded(database);
    },
  };

  return {
    settingsRepo,
    backupMetaRepo,
    libraryRepo,
    papersRepo,
    jobsRepo,
    storageRepo,
  };
}

export const repository = createRepository(db);

export async function ensureBuiltInTemplatesSeeded(database: EduPulseDB = db): Promise<void> {
  const existingBuiltIns = await database.templates.filter((t) => t.isBuiltIn).count();
  if (existingBuiltIns > 0) return;

  const now = Date.now();
  const builtIns: TemplateRecord[] = [
    {
      id: 'tpl_cbse_10_science_80',
      name: 'CBSE Class 10 Board Pattern (80 Marks)',
      description:
        'Standard 5-section CBSE Science & Core layout: 20 MCQs/Assertion-Reason, 6 VSA (2m), 7 SA (3m), 3 LA (5m), 3 Case-Based (4m).',
      board: 'CBSE',
      classLevel: 10,
      subject: 'Science',
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      blueprint: {
        id: 'bp_tpl_cbse_10',
        title: 'CBSE Class 10 Board Pattern (80 Marks)',
        language: 'en',
        totalMarks: 80,
        createdAt: now,
        updatedAt: now,
        header: {
          schoolName: '',
          board: 'CBSE',
          classLevel: 10,
          subject: 'Science',
          examTitle: 'Pre-Board Examination',
          durationMinutes: 180,
          generalInstructions: [
            'All questions are compulsory. However, internal choice is provided in some questions.',
            'Section A consists of 20 objective questions carrying 1 mark each.',
            'Section B consists of 6 Very Short Answer questions carrying 2 marks each.',
            'Section C consists of 7 Short Answer questions carrying 3 marks each.',
            'Section D consists of 3 Long Answer questions carrying 5 marks each.',
            'Section E consists of 3 Case-based units of assessment of 4 marks each.',
          ],
        },
        sections: [
          {
            id: 'sec_a',
            name: 'Section A — Objective & Assertion-Reasoning',
            questionType: 'mcq',
            count: 20,
            marksPerQuestion: 1,
            choiceRule: { enabled: false, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 40, medium: 40, hard: 20 },
            bloomTargets: ['remember', 'understand', 'analyze'],
            chapterIds: [],
          },
          {
            id: 'sec_b',
            name: 'Section B — Very Short Answer',
            questionType: 'very_short',
            count: 6,
            marksPerQuestion: 2,
            choiceRule: { enabled: true, internalChoiceCount: 1 },
            sourceMode: 'mix',
            difficultySplit: { easy: 35, medium: 45, hard: 20 },
            bloomTargets: ['understand', 'apply'],
            chapterIds: [],
          },
          {
            id: 'sec_c',
            name: 'Section C — Short Answer',
            questionType: 'short',
            count: 7,
            marksPerQuestion: 3,
            choiceRule: { enabled: true, internalChoiceCount: 2 },
            sourceMode: 'mix',
            difficultySplit: { easy: 25, medium: 50, hard: 25 },
            bloomTargets: ['apply', 'analyze'],
            chapterIds: [],
          },
          {
            id: 'sec_d',
            name: 'Section D — Long Answer',
            questionType: 'long',
            count: 3,
            marksPerQuestion: 5,
            choiceRule: { enabled: true, internalChoiceCount: 3 },
            sourceMode: 'mix',
            difficultySplit: { easy: 20, medium: 50, hard: 30 },
            bloomTargets: ['analyze', 'evaluate'],
            chapterIds: [],
          },
          {
            id: 'sec_e',
            name: 'Section E — Case-Based Questions',
            questionType: 'case_study',
            count: 3,
            marksPerQuestion: 4,
            choiceRule: { enabled: true, internalChoiceCount: 1 },
            sourceMode: 'ai_from_book',
            difficultySplit: { easy: 20, medium: 50, hard: 30 },
            bloomTargets: ['apply', 'analyze'],
            chapterIds: [],
          },
        ],
      },
    },
    {
      id: 'tpl_icse_10_80',
      name: 'ICSE Class 10 Two-Section Pattern (80 Marks)',
      description:
        'CISCE pattern with compulsory Section A (40 marks) and Section B with Attempt any 4 out of 6 structured questions (40 marks).',
      board: 'ICSE',
      classLevel: 10,
      subject: 'Physics',
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      blueprint: {
        id: 'bp_tpl_icse_10',
        title: 'ICSE Class 10 Two-Section Pattern (80 Marks)',
        language: 'en',
        totalMarks: 80,
        createdAt: now,
        updatedAt: now,
        header: {
          schoolName: '',
          board: 'ICSE',
          classLevel: 10,
          subject: 'Physics',
          examTitle: 'Term Assessment',
          durationMinutes: 120,
          generalInstructions: [
            'Answers to this Paper must be written on the paper provided separately.',
            'You will not be allowed to write during first 15 minutes.',
            'Section A is compulsory. Attempt any four questions from Section B.',
          ],
        },
        sections: [
          {
            id: 'sec_icse_a1',
            name: 'Section A — Objective Questions (Compulsory)',
            questionType: 'mcq',
            count: 15,
            marksPerQuestion: 1,
            choiceRule: { enabled: false, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 40, medium: 40, hard: 20 },
            bloomTargets: ['remember', 'understand'],
            chapterIds: [],
          },
          {
            id: 'sec_icse_a2',
            name: 'Section A — Short Compulsory Questions',
            questionType: 'very_short',
            count: 5,
            marksPerQuestion: 5,
            choiceRule: { enabled: false, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 30, medium: 50, hard: 20 },
            bloomTargets: ['understand', 'apply'],
            chapterIds: [],
          },
          {
            id: 'sec_icse_b',
            name: 'Section B — Structured Long Questions (Attempt any 4 of 6)',
            questionType: 'long',
            count: 4,
            marksPerQuestion: 10,
            choiceRule: { enabled: true, attemptCount: 4, totalCount: 6, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 20, medium: 50, hard: 30 },
            bloomTargets: ['apply', 'analyze', 'evaluate'],
            chapterIds: [],
          },
        ],
      },
    },
    {
      id: 'tpl_maharashtra_ssc_40',
      name: 'Maharashtra SSC Science & Tech (40 Marks)',
      description:
        'Maharashtra State Board SSC pattern with Q.1 objective (10m), Q.2 scientific reasons/short (10m), Q.3 answer the following (15m), Q.4 long (5m).',
      board: 'MAHARASHTRA',
      classLevel: 10,
      subject: 'Science and Technology',
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      blueprint: {
        id: 'bp_tpl_mh_10',
        title: 'Maharashtra SSC Science & Tech (40 Marks)',
        language: 'en',
        totalMarks: 40,
        createdAt: now,
        updatedAt: now,
        header: {
          schoolName: '',
          board: 'MAHARASHTRA',
          classLevel: 10,
          subject: 'Science and Technology',
          examTitle: 'First Term Examination',
          durationMinutes: 120,
          generalInstructions: [
            'All questions are compulsory.',
            'Draw scientifically correct labelled diagrams wherever necessary.',
            'Figures to the right indicate full marks.',
          ],
        },
        sections: [
          {
            id: 'sec_mh_q1a',
            name: 'Q.1 (A) Choose the correct alternative',
            questionType: 'mcq',
            count: 5,
            marksPerQuestion: 1,
            choiceRule: { enabled: false, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 60, medium: 40, hard: 0 },
            bloomTargets: ['remember', 'understand'],
            chapterIds: [],
          },
          {
            id: 'sec_mh_q1b',
            name: 'Q.1 (B) Answer the following in one sentence',
            questionType: 'very_short',
            count: 5,
            marksPerQuestion: 1,
            choiceRule: { enabled: false, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 40, medium: 40, hard: 20 },
            bloomTargets: ['remember', 'understand'],
            chapterIds: [],
          },
          {
            id: 'sec_mh_q2',
            name: 'Q.2 Give scientific reasons / Short answers (Attempt any 5 of 7)',
            questionType: 'very_short',
            count: 5,
            marksPerQuestion: 2,
            choiceRule: { enabled: true, attemptCount: 5, totalCount: 7, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 30, medium: 50, hard: 20 },
            bloomTargets: ['understand', 'apply'],
            chapterIds: [],
          },
          {
            id: 'sec_mh_q3',
            name: 'Q.3 Answer the following (Attempt any 5 of 8)',
            questionType: 'short',
            count: 5,
            marksPerQuestion: 3,
            choiceRule: { enabled: true, attemptCount: 5, totalCount: 8, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 20, medium: 50, hard: 30 },
            bloomTargets: ['apply', 'analyze'],
            chapterIds: [],
          },
          {
            id: 'sec_mh_q4',
            name: 'Q.4 Answer any one of the following',
            questionType: 'long',
            count: 1,
            marksPerQuestion: 5,
            choiceRule: { enabled: true, attemptCount: 1, totalCount: 2, internalChoiceCount: 0 },
            sourceMode: 'mix',
            difficultySplit: { easy: 0, medium: 50, hard: 50 },
            bloomTargets: ['analyze', 'evaluate'],
            chapterIds: [],
          },
        ],
      },
    },
  ];

  await database.templates.bulkPut(builtIns.map((t) => TemplateSchema.parse(t)));
}

export function createDebouncedSave<T>(
  fn: (value: T) => Promise<void>,
  delayMs = 700
): (value: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (value: T) => {
    const store = useUIStore.getState();
    store.setSaveState('saving');
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await fn(value);
        useUIStore.getState().setSaveState('saved', Date.now());
      } catch (err) {
        logger.error(err, 'autosave');
        useUIStore.getState().setSaveState('error');
      }
    }, delayMs);
  };
}
