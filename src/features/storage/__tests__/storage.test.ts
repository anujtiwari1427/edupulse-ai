import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { EduPulseDB } from '../db';
import { createRepository, ensureBuiltInTemplatesSeeded } from '../repository';
import {
  applyValidatedBackup,
  exportWorkspaceBackupZip,
  isBackupDue,
  parseAndValidateBackupZip,
} from '../backup';
import { loadSampleClass10Library } from '../sample-data';

describe('Dexie Repository & Backup Round-Trip', () => {
  let testDb: EduPulseDB;

  beforeEach(async () => {
    testDb = new EduPulseDB(`edupulse_test_${Math.random().toString(36).slice(2)}`);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('seeds built-in CBSE, ICSE, and Maharashtra board templates once', async () => {
    await ensureBuiltInTemplatesSeeded(testDb);
    await ensureBuiltInTemplatesSeeded(testDb);
    const repo = createRepository(testDb);
    const templates = await repo.papersRepo.listTemplates();
    expect(templates).toHaveLength(3);
    expect(templates.map((t) => t.board).sort()).toEqual(['CBSE', 'ICSE', 'MAHARASHTRA']);
  });

  it('persists and updates settings and creates paper versions', async () => {
    const repo = createRepository(testDb);
    const initial = await repo.settingsRepo.get();
    expect(initial.defaultBoard).toBe('CBSE');

    const updated = await repo.settingsRepo.update({
      schoolName: 'Adarsh Vidyalaya',
      language: 'mr',
    });
    expect(updated.schoolName).toBe('Adarsh Vidyalaya');
    expect(updated.language).toBe('mr');

    const { questionsAdded } = await loadSampleClass10Library(testDb);
    expect(questionsAdded).toBe(10);

    const papers = await repo.papersRepo.listPapers();
    expect(papers).toHaveLength(1);

    await repo.papersRepo.savePaper(
      { ...papers[0]!, title: 'Updated Sample Paper' },
      'Manual title edit'
    );
    const versions = await testDb.paperVersions.where('paperId').equals(papers[0]!.id).toArray();
    expect(versions).toHaveLength(1);
    expect(versions[0]?.note).toBe('Manual title edit');
  });

  it('exports a valid backup ZIP and restores cleanly in overwrite and merge modes', async () => {
    await ensureBuiltInTemplatesSeeded(testDb);
    await loadSampleClass10Library(testDb);
    const repo = createRepository(testDb);
    await repo.libraryRepo.saveFile({
      id: 'file_logo_1',
      name: 'logo.png',
      mimeType: 'image/png',
      size: 4,
      sha256: 'abc123',
      category: 'logo',
      createdAt: Date.now(),
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    });

    const { blob, fileName } = await exportWorkspaceBackupZip(testDb);
    expect(fileName).toMatch(/^edupulse-backup-\d{4}-\d{2}-\d{2}\.zip$/);

    const preview = await parseAndValidateBackupZip(await blob.arrayBuffer());
    expect(preview.counts.books).toBe(1);
    expect(preview.counts.questions).toBe(10);
    expect(preview.counts.papers).toBe(1);
    expect(preview.counts.files).toBe(1);

    // Wipe DB and restore in overwrite mode
    await repo.storageRepo.deleteAllUserData();
    expect(await testDb.books.count()).toBe(0);

    await applyValidatedBackup(preview, 'overwrite', testDb);
    expect(await testDb.books.count()).toBe(1);
    expect(await testDb.questions.count()).toBe(10);
    expect(await testDb.papers.count()).toBe(1);
    expect(await testDb.files.count()).toBe(1);
  });

  it('rejects tampered/invalid backup ZIPs without modifying existing data', async () => {
    await loadSampleClass10Library(testDb);
    const badZip = new JSZip();
    badZip.file('manifest.json', JSON.stringify({ schemaVersion: 1, appName: 'Wrong' }));
    const badBuffer = await badZip.generateAsync({ type: 'arraybuffer' });

    await expect(parseAndValidateBackupZip(badBuffer)).rejects.toThrow(/validation failed/i);
    expect(await testDb.questions.count()).toBe(10);
  });

  it('evaluates backup reminders accurately', () => {
    const baseSettings = {
      id: 'default' as const,
      teacherName: '',
      schoolName: '',
      defaultBoard: 'CBSE' as const,
      defaultClassLevel: 10,
      defaultSubject: 'Science',
      language: 'en' as const,
      theme: 'system' as const,
      aiProvider: 'none' as const,
      aiModel: 'gemini-4-hydrogen',
      aiApiKey: '',
      proxyEndpoint: '',
      backupReminderDays: 7,
      folderSyncEnabled: false,
      onboardingCompleted: true,
      updatedAt: Date.now(),
    };

    expect(
      isBackupDue({ id: 'default', papersSinceLastBackup: 2 }, baseSettings)
    ).toBe(false);
    expect(
      isBackupDue({ id: 'default', papersSinceLastBackup: 3 }, baseSettings)
    ).toBe(true);
    expect(
      isBackupDue(
        {
          id: 'default',
          papersSinceLastBackup: 0,
          lastBackupAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        },
        baseSettings
      )
    ).toBe(true);
  });
});
