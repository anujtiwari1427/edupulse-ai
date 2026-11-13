import JSZip from 'jszip';
import { db, type EduPulseDB, type StoredFileRecord } from './db';
import { createRepository } from './repository';
import {
  BackupBundleSchema,
  type BackupBundle,
  type BackupMetaRecord,
  type SettingsRecord,
} from '@/src/lib/zod-schemas';
import { AppError } from '@/src/lib/errors';

export type RestoreMode = 'merge' | 'overwrite';

export interface BackupPreview {
  exportedAt: number;
  schemaVersion: number;
  counts: {
    books: number;
    chapters: number;
    chunks: number;
    questions: number;
    blueprints: number;
    templates: number;
    papers: number;
    files: number;
  };
  bundle: BackupBundle;
  filesMap: Map<string, Blob>;
}

export function isBackupDue(meta: BackupMetaRecord, settings: SettingsRecord): boolean {
  if (meta.papersSinceLastBackup >= 3) return true;
  if (!meta.lastBackupAt) return false;
  const elapsedDays = (Date.now() - meta.lastBackupAt) / (1000 * 60 * 60 * 24);
  return elapsedDays >= settings.backupReminderDays;
}

export async function exportWorkspaceBackupZip(
  database: EduPulseDB = db
): Promise<{ blob: Blob; fileName: string; bundle: BackupBundle }> {
  const [
    books,
    chapters,
    chunks,
    files,
    questions,
    blueprints,
    templates,
    papers,
    paperVersions,
    exportsList,
    settings,
    backupMeta,
  ] = await Promise.all([
    database.books.toArray(),
    database.chapters.toArray(),
    database.chunks.toArray(),
    database.files.toArray(),
    database.questions.toArray(),
    database.blueprints.toArray(),
    database.templates.toArray(),
    database.papers.toArray(),
    database.paperVersions.toArray(),
    database.exports.toArray(),
    database.settings.toArray(),
    database.backupMeta.toArray(),
  ]);

  const filesMeta = files.map(({ data: _data, ...meta }) => meta);

  const bundle: BackupBundle = BackupBundleSchema.parse({
    schemaVersion: 1,
    appName: 'EduPulse AI',
    exportedAt: Date.now(),
    tables: {
      books,
      chapters,
      chunks,
      filesMeta,
      questions,
      blueprints,
      templates,
      papers,
      paperVersions,
      exports: exportsList,
      settings,
      backupMeta,
    },
  });

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(bundle, null, 2));

  const filesFolder = zip.folder('files');
  if (filesFolder) {
    for (const file of files) {
      filesFolder.file(file.id, file.data);
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `edupulse-backup-${dateStr}.zip`;

  const repo = createRepository(database);
  await repo.backupMetaRepo.update({
    lastBackupAt: Date.now(),
    lastBackupFileName: fileName,
    papersSinceLastBackup: 0,
  });

  return { blob, fileName, bundle };
}

export async function parseAndValidateBackupZip(zipInput: Blob | ArrayBuffer): Promise<BackupPreview> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipInput);
  } catch (err) {
    throw new AppError('The selected file is not a valid ZIP archive.', {
      code: 'INVALID_BACKUP_ZIP',
      cause: err,
    });
  }

  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new AppError('Backup archive is missing manifest.json.', {
      code: 'MISSING_BACKUP_MANIFEST',
    });
  }

  let rawJson: unknown;
  try {
    const manifestText = await manifestEntry.async('text');
    rawJson = JSON.parse(manifestText);
  } catch (err) {
    throw new AppError('Backup manifest.json contains invalid JSON.', {
      code: 'CORRUPT_BACKUP_MANIFEST',
      cause: err,
    });
  }

  const parsed = BackupBundleSchema.safeParse(rawJson);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AppError(
      `Backup validation failed (${firstIssue?.path.join('.') || 'schema'}: ${firstIssue?.message ?? 'invalid structure'}). Your existing data was not modified.`,
      {
        code: 'BACKUP_SCHEMA_INVALID',
      }
    );
  }

  const filesMap = new Map<string, Blob>();
  for (const meta of parsed.data.tables.filesMeta) {
    const entry = zip.file(`files/${meta.id}`);
    if (entry) {
      const arrayBuf = await entry.async('arraybuffer');
      filesMap.set(meta.id, new Blob([arrayBuf], { type: meta.mimeType }));
    }
  }

  return {
    exportedAt: parsed.data.exportedAt,
    schemaVersion: parsed.data.schemaVersion,
    counts: {
      books: parsed.data.tables.books.length,
      chapters: parsed.data.tables.chapters.length,
      chunks: parsed.data.tables.chunks.length,
      questions: parsed.data.tables.questions.length,
      blueprints: parsed.data.tables.blueprints.length,
      templates: parsed.data.tables.templates.length,
      papers: parsed.data.tables.papers.length,
      files: filesMap.size,
    },
    bundle: parsed.data,
    filesMap,
  };
}

export async function applyValidatedBackup(
  preview: BackupPreview,
  mode: RestoreMode,
  database: EduPulseDB = db
): Promise<void> {
  const { bundle, filesMap } = preview;
  const { tables } = bundle;

  const fileRecords: StoredFileRecord[] = [];
  for (const meta of tables.filesMeta) {
    const blob = filesMap.get(meta.id);
    if (blob) {
      fileRecords.push({ ...meta, data: await blob.arrayBuffer() });
    }
  }

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
      database.backupMeta,
    ],
    async () => {
      if (mode === 'overwrite') {
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
          database.backupMeta.clear(),
        ]);
      }

      if (tables.books.length) await database.books.bulkPut(tables.books);
      if (tables.chapters.length) await database.chapters.bulkPut(tables.chapters);
      if (tables.chunks.length) await database.chunks.bulkPut(tables.chunks);
      if (fileRecords.length) await database.files.bulkPut(fileRecords);
      if (tables.questions.length) await database.questions.bulkPut(tables.questions);
      if (tables.blueprints.length) await database.blueprints.bulkPut(tables.blueprints);
      if (tables.templates.length) await database.templates.bulkPut(tables.templates);
      if (tables.papers.length) await database.papers.bulkPut(tables.papers);
      if (tables.paperVersions.length) await database.paperVersions.bulkPut(tables.paperVersions);
      if (tables.exports.length) await database.exports.bulkPut(tables.exports);
      if (tables.settings.length) await database.settings.bulkPut(tables.settings);

      const repo = createRepository(database);
      await repo.backupMetaRepo.update({
        lastRestoreAt: Date.now(),
      });
    }
  );
}
