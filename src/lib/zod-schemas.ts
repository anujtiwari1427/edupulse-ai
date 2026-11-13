import { z } from 'zod';

export const BoardSchema = z.enum(['CBSE', 'ICSE', 'MAHARASHTRA', 'OTHER']);
export type BoardType = z.infer<typeof BoardSchema>;

export const LanguageSchema = z.enum(['en', 'hi', 'mr']);
export type LanguageCode = z.infer<typeof LanguageSchema>;

export const QuestionTypeSchema = z.enum([
  'mcq',
  'very_short',
  'short',
  'long',
  'case_study',
  'assertion_reason',
  'fill_blank',
  'true_false',
  'match',
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type DifficultyLevel = z.infer<typeof DifficultySchema>;

export const BloomSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
]);
export type BloomLevel = z.infer<typeof BloomSchema>;

export const QuestionOriginSchema = z.enum(['bank', 'ai', 'manual']);
export type QuestionOrigin = z.infer<typeof QuestionOriginSchema>;

export const PaperStatusSchema = z.enum(['draft', 'finalized', 'archived']);
export type PaperStatus = z.infer<typeof PaperStatusSchema>;

export const JobTypeSchema = z.enum(['ingest', 'ocr', 'parse_bank', 'generate', 'export', 'backup']);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const AIProviderSchema = z.enum(['none', 'gemini', 'openai', 'anthropic', 'proxy']);
export type AIProviderType = z.infer<typeof AIProviderSchema>;

export const BookSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(240),
  board: BoardSchema,
  classLevel: z.number().int().min(1).max(12),
  subject: z.string().min(1).max(120),
  language: LanguageSchema,
  sourceType: z.enum(['textbook', 'question_bank']),
  fileId: z.string().optional(),
  pageCount: z.number().int().min(0),
  chunkCount: z.number().int().min(0),
  status: z.enum(['pending', 'processing', 'ready', 'error']),
  copyrightConfirmed: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type BookRecord = z.infer<typeof BookSchema>;

export const ChapterSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  order: z.number().int().min(0),
  title: z.string().min(1).max(240),
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
  summary: z.string().optional(),
  topics: z.array(z.string()).default([]),
});
export type ChapterRecord = z.infer<typeof ChapterSchema>;

export const ChunkSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  chapterId: z.string().min(1),
  pageNumber: z.number().int().min(1),
  chunkIndex: z.number().int().min(0),
  text: z.string().min(1),
  tokenEstimate: z.number().int().min(1),
  language: LanguageSchema,
});
export type ChunkRecord = z.infer<typeof ChunkSchema>;

export const StoredFileMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  category: z.enum(['textbook', 'question_bank', 'logo', 'export']),
  createdAt: z.number().int().nonnegative(),
});
export type StoredFileMeta = z.infer<typeof StoredFileMetaSchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().optional(),
  chapterId: z.string().optional(),
  type: QuestionTypeSchema,
  text: z.string().min(1),
  options: z.array(z.string().min(1)).length(4).optional(),
  answer: z.string().min(1),
  markingScheme: z.string().optional(),
  marks: z.number().min(0.5).max(100),
  difficulty: DifficultySchema,
  bloom: BloomSchema,
  topic: z.string().min(1),
  sourcePage: z.number().int().min(1).optional(),
  origin: QuestionOriginSchema,
  language: LanguageSchema.default('en'),
  hash: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type QuestionRecord = z.infer<typeof QuestionSchema>;

export const ChoiceRuleSchema = z.object({
  enabled: z.boolean(),
  attemptCount: z.number().int().min(1).optional(),
  totalCount: z.number().int().min(1).optional(),
  internalChoiceCount: z.number().int().min(0).default(0),
});
export type ChoiceRule = z.infer<typeof ChoiceRuleSchema>;

export const BlueprintSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  instructions: z.string().optional(),
  questionType: QuestionTypeSchema,
  count: z.number().int().min(1).max(100),
  marksPerQuestion: z.number().min(0.5).max(50),
  choiceRule: ChoiceRuleSchema,
  sourceMode: z.enum(['bank_only', 'ai_from_book', 'mix']),
  difficultySplit: z.object({
    easy: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    hard: z.number().min(0).max(100),
  }),
  bloomTargets: z.array(BloomSchema).min(1),
  chapterIds: z.array(z.string()).default([]),
});
export type BlueprintSection = z.infer<typeof BlueprintSectionSchema>;

export const BlueprintHeaderSchema = z.object({
  schoolName: z.string().max(200),
  logoFileId: z.string().optional(),
  board: BoardSchema,
  classLevel: z.number().int().min(1).max(12),
  subject: z.string().min(1).max(120),
  examTitle: z.string().min(1).max(200),
  examDate: z.string().max(60).optional(),
  durationMinutes: z.number().int().min(10).max(360),
  generalInstructions: z.array(z.string()),
});
export type BlueprintHeader = z.infer<typeof BlueprintHeaderSchema>;

export const BlueprintSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  language: LanguageSchema,
  header: BlueprintHeaderSchema,
  sections: z.array(BlueprintSectionSchema).min(1),
  totalMarks: z.number().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type BlueprintRecord = z.infer<typeof BlueprintSchema>;

export const TemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(400),
  board: BoardSchema,
  classLevel: z.number().int().min(1).max(12),
  subject: z.string().min(1).max(120),
  isBuiltIn: z.boolean(),
  blueprint: BlueprintSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type TemplateRecord = z.infer<typeof TemplateSchema>;

export const PaperQuestionSchema = QuestionSchema.extend({
  paperQuestionId: z.string().min(1),
  order: z.number().int().min(0),
  alternativeToId: z.string().optional(),
});
export type PaperQuestion = z.infer<typeof PaperQuestionSchema>;

export const PaperSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  instructions: z.string().optional(),
  marksPerQuestion: z.number().min(0.5),
  choiceRule: ChoiceRuleSchema,
  questions: z.array(PaperQuestionSchema),
});
export type PaperSection = z.infer<typeof PaperSectionSchema>;

export const PaperSetSchema = z.object({
  code: z.enum(['A', 'B', 'C']),
  questionOrderBySection: z.record(z.string(), z.array(z.string())),
  optionOrderByQuestion: z.record(z.string(), z.array(z.number().int().min(0).max(3))),
});
export type PaperSet = z.infer<typeof PaperSetSchema>;

export const PaperSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(240),
  blueprintSnapshot: BlueprintSchema,
  sections: z.array(PaperSectionSchema),
  sets: z.array(PaperSetSchema),
  language: LanguageSchema,
  status: PaperStatusSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type PaperRecord = z.infer<typeof PaperSchema>;

export const PaperVersionSchema = z.object({
  id: z.string().min(1),
  paperId: z.string().min(1),
  versionNumber: z.number().int().min(1),
  note: z.string().max(240).optional(),
  snapshot: PaperSchema,
  createdAt: z.number().int().nonnegative(),
});
export type PaperVersionRecord = z.infer<typeof PaperVersionSchema>;

export const ExportRecordSchema = z.object({
  id: z.string().min(1),
  paperId: z.string().min(1),
  format: z.enum(['pdf', 'docx', 'answer_key_pdf', 'answer_key_docx', 'json']),
  setCode: z.enum(['A', 'B', 'C']).optional(),
  fileName: z.string().min(1),
  savedToLibraryFolder: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});
export type ExportRecord = z.infer<typeof ExportRecordSchema>;

export const SettingsSchema = z.object({
  id: z.literal('default'),
  teacherName: z.string().max(120).default(''),
  schoolName: z.string().max(200).default(''),
  schoolLogoFileId: z.string().optional(),
  defaultBoard: BoardSchema.default('CBSE'),
  defaultClassLevel: z.number().int().min(1).max(12).default(10),
  defaultSubject: z.string().max(120).default('Science'),
  language: LanguageSchema.default('en'),
  theme: ThemePreferenceSchema.default('system'),
  aiProvider: AIProviderSchema.default('none'),
  aiModel: z.string().max(120).default('gemini-4-hydrogen'),
  aiApiKey: z.string().max(400).default(''),
  proxyEndpoint: z.string().max(300).default(''),
  backupReminderDays: z.number().int().min(1).max(90).default(7),
  folderSyncEnabled: z.boolean().default(false),
  folderName: z.string().optional(),
  onboardingCompleted: z.boolean().default(false),
  updatedAt: z.number().int().nonnegative(),
});
export type SettingsRecord = z.infer<typeof SettingsSchema>;

export const JobSchema = z.object({
  id: z.string().min(1),
  type: JobTypeSchema,
  status: JobStatusSchema,
  title: z.string().min(1),
  progress: z.number().min(0).max(100),
  processedItems: z.number().int().min(0),
  totalItems: z.number().int().min(0),
  errorMessage: z.string().optional(),
  checkpoint: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type JobRecord = z.infer<typeof JobSchema>;

export const BackupMetaSchema = z.object({
  id: z.literal('default'),
  lastBackupAt: z.number().int().nonnegative().optional(),
  lastBackupFileName: z.string().optional(),
  papersSinceLastBackup: z.number().int().min(0).default(0),
  lastRestoreAt: z.number().int().nonnegative().optional(),
});
export type BackupMetaRecord = z.infer<typeof BackupMetaSchema>;

export const BackupBundleSchema = z.object({
  schemaVersion: z.literal(1),
  appName: z.literal('EduPulse AI'),
  exportedAt: z.number().int().nonnegative(),
  tables: z.object({
    books: z.array(BookSchema),
    chapters: z.array(ChapterSchema),
    chunks: z.array(ChunkSchema),
    filesMeta: z.array(StoredFileMetaSchema),
    questions: z.array(QuestionSchema),
    blueprints: z.array(BlueprintSchema),
    templates: z.array(TemplateSchema),
    papers: z.array(PaperSchema),
    paperVersions: z.array(PaperVersionSchema),
    exports: z.array(ExportRecordSchema),
    settings: z.array(SettingsSchema),
    backupMeta: z.array(BackupMetaSchema),
  }),
});
export type BackupBundle = z.infer<typeof BackupBundleSchema>;
