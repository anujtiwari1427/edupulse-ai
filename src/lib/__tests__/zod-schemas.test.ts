import { beforeEach, describe, expect, it } from 'vitest';
import { QuestionSchema, SettingsSchema } from '@/src/lib/zod-schemas';
import {
  AppError,
  captureError,
  clearLocalErrorLog,
  exportErrorLogJson,
  readLocalErrorLog,
} from '@/src/lib/errors';

describe('Zod Boundary Schemas & Error Log', () => {
  beforeEach(() => {
    clearLocalErrorLog();
  });

  it('validates MCQ questions with exactly 4 options and rejects invalid option counts', () => {
    const now = Date.now();
    const valid = QuestionSchema.safeParse({
      id: 'q1',
      type: 'mcq',
      text: 'What is the chemical formula of water?',
      options: ['H2O', 'CO2', 'O2', 'H2O2'],
      answer: 'H2O',
      marks: 1,
      difficulty: 'easy',
      bloom: 'remember',
      topic: 'Acids',
      origin: 'bank',
      language: 'en',
      hash: 'hash1',
      createdAt: now,
      updatedAt: now,
    });
    expect(valid.success).toBe(true);

    const invalid = QuestionSchema.safeParse({
      id: 'q2',
      type: 'mcq',
      text: 'Invalid MCQ',
      options: ['Only one', 'Two'],
      answer: 'Only one',
      marks: 1,
      difficulty: 'easy',
      bloom: 'remember',
      topic: 'Acids',
      origin: 'bank',
      language: 'en',
      hash: 'hash2',
      createdAt: now,
      updatedAt: now,
    });
    expect(invalid.success).toBe(false);
  });

  it('applies safe defaults on SettingsSchema', () => {
    const parsed = SettingsSchema.parse({
      id: 'default',
      updatedAt: Date.now(),
    });
    expect(parsed.language).toBe('en');
    expect(parsed.aiProvider).toBe('gemini');
    expect(parsed.backupReminderDays).toBe(7);
  });

  it('captures and exports local errors cleanly', () => {
    captureError(new AppError('Corrupt PDF header', { code: 'PDF_PARSE' }), 'ingestion');
    const entries = readLocalErrorLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.code).toBe('PDF_PARSE');

    const exported = JSON.parse(exportErrorLogJson()) as { entries: unknown[] };
    expect(exported.entries).toHaveLength(1);
  });
});
