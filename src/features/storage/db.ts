import Dexie, { type Table } from 'dexie';
import type {
  BackupMetaRecord,
  BlueprintRecord,
  BookRecord,
  ChapterRecord,
  ChunkRecord,
  ExportRecord,
  JobRecord,
  PaperRecord,
  PaperVersionRecord,
  QuestionRecord,
  SettingsRecord,
  StoredFileMeta,
  TemplateRecord,
} from '@/src/lib/zod-schemas';

export interface StoredFileRecord extends StoredFileMeta {
  data: ArrayBuffer;
}

export interface FsHandleRecord {
  id: 'library_root';
  folderName: string;
  handle: FileSystemDirectoryHandle;
  updatedAt: number;
}

export class EduPulseDB extends Dexie {
  books!: Table<BookRecord, string>;
  chapters!: Table<ChapterRecord, string>;
  chunks!: Table<ChunkRecord, string>;
  files!: Table<StoredFileRecord, string>;
  questions!: Table<QuestionRecord, string>;
  blueprints!: Table<BlueprintRecord, string>;
  templates!: Table<TemplateRecord, string>;
  papers!: Table<PaperRecord, string>;
  paperVersions!: Table<PaperVersionRecord, string>;
  exports!: Table<ExportRecord, string>;
  settings!: Table<SettingsRecord, string>;
  jobs!: Table<JobRecord, string>;
  backupMeta!: Table<BackupMetaRecord, string>;
  fsHandles!: Table<FsHandleRecord, string>;

  constructor(dbName = 'edupulse_local_db') {
    super(dbName);

    this.version(1).stores({
      books: 'id, board, classLevel, subject, sourceType, status, updatedAt',
      chapters: 'id, bookId, order',
      chunks: 'id, bookId, chapterId, pageNumber, [bookId+chapterId]',
      files: 'id, category, sha256, createdAt',
      questions: 'id, bookId, chapterId, type, difficulty, bloom, origin, hash, updatedAt',
      blueprints: 'id, title, updatedAt',
      templates: 'id, board, classLevel, subject, isBuiltIn, updatedAt',
      papers: 'id, title, status, updatedAt, createdAt',
      paperVersions: 'id, paperId, versionNumber, createdAt',
      exports: 'id, paperId, format, createdAt',
      settings: 'id',
      jobs: 'id, type, status, updatedAt',
      backupMeta: 'id',
      fsHandles: 'id',
    });

    // Version 2: add compound index on questions [chapterId+type] for fast blueprint slot selection
    this.version(2).stores({
      questions:
        'id, bookId, chapterId, type, difficulty, bloom, origin, hash, updatedAt, [chapterId+type]',
    });
  }
}

export const db = new EduPulseDB();
