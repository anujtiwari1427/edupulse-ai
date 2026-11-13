import { generateId } from '@/src/lib/utils';
import { PaperSchema, type PaperRecord } from '@/src/lib/zod-schemas';

export function exportPaperJsonBlob(paper: PaperRecord): Blob {
  const payload = {
    schemaVersion: 1,
    appName: 'EduPulse AI',
    exportedAt: Date.now(),
    paper,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export function parseImportedPaperJson(rawText: string): PaperRecord {
  const parsed = JSON.parse(rawText) as unknown;
  const candidate =
    typeof parsed === 'object' && parsed !== null && 'paper' in parsed
      ? (parsed as { paper: unknown }).paper
      : parsed;

  const validated = PaperSchema.parse(candidate);
  const now = Date.now();
  return PaperSchema.parse({
    ...validated,
    id: generateId('paper'),
    title: `${validated.title} (Imported)`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  });
}
