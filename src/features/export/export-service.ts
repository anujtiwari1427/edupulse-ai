import {
  buildPaperFolderSegments,
  writeFileToLibraryFolder,
} from '@/src/features/storage/folder-sync';
import { repository } from '@/src/features/storage/repository';
import { generateId, slugifyPathSegment } from '@/src/lib/utils';
import type { ExportRecord, PaperRecord } from '@/src/lib/zod-schemas';
import { exportAnswerKeyDocxBlob, exportPaperDocxBlob } from './docx-exporter';
import { exportPaperJsonBlob } from './json-exporter';
import { exportAnswerKeyPdfBytes, exportPaperPdfBytes } from './pdf-exporter';

export type PaperExportFormat = ExportRecord['format'];

export function buildExportFileName(
  paper: PaperRecord,
  format: PaperExportFormat,
  setCode: 'A' | 'B' | 'C'
): string {
  const { classLevel, subject } = paper.blueprintSnapshot.header;
  const slug =
    slugifyPathSegment(paper.title) || `class-${classLevel}-${slugifyPathSegment(subject)}`;
  switch (format) {
    case 'pdf':
      return `${slug}-Set${setCode}.pdf`;
    case 'answer_key_pdf':
      return `${slug}-Set${setCode}-AnswerKey.pdf`;
    case 'docx':
      return `${slug}-Set${setCode}.docx`;
    case 'answer_key_docx':
      return `${slug}-Set${setCode}-AnswerKey.docx`;
    case 'json':
      return `${slug}.edupulse.json`;
  }
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function resolveSchoolLogoBytes(paper: PaperRecord): Promise<{
  bytes?: Uint8Array;
  mimeType?: string;
}> {
  const settings = await repository.settingsRepo.get();
  const logoId = paper.blueprintSnapshot.header.logoFileId ?? settings.schoolLogoFileId;
  if (!logoId) return {};
  const fileRec = await repository.libraryRepo.getFile(logoId);
  if (!fileRec) return {};
  return {
    bytes: new Uint8Array(fileRec.data),
    mimeType: fileRec.mimeType,
  };
}

export async function runPaperExport(
  paper: PaperRecord,
  format: PaperExportFormat,
  setCode: 'A' | 'B' | 'C' = 'A',
  options?: { download?: boolean }
): Promise<{
  fileName: string;
  savedToLibraryFolder: boolean;
  blob: Blob;
}> {
  const fileName = buildExportFileName(paper, format, setCode);
  const logo = await resolveSchoolLogoBytes(paper);
  let blob: Blob;

  if (format === 'pdf') {
    const bytes = await exportPaperPdfBytes(paper, {
      setCode,
      logoBytes: logo.bytes,
      logoMimeType: logo.mimeType,
    });
    blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  } else if (format === 'answer_key_pdf') {
    const bytes = await exportAnswerKeyPdfBytes(paper, {
      setCode,
      logoBytes: logo.bytes,
      logoMimeType: logo.mimeType,
    });
    blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  } else if (format === 'docx') {
    blob = await exportPaperDocxBlob(paper, {
      setCode,
      logoBytes: logo.bytes,
      logoMimeType: logo.mimeType,
    });
  } else if (format === 'answer_key_docx') {
    blob = await exportAnswerKeyDocxBlob(paper, {
      setCode,
      logoBytes: logo.bytes,
      logoMimeType: logo.mimeType,
    });
  } else {
    blob = exportPaperJsonBlob(paper);
  }

  // Save to connected Library Folder (/Exports and /Papers/<class>-<subject>/) if granted
  const savedExports = await writeFileToLibraryFolder(['Exports'], fileName, blob);
  if (format === 'json') {
    const folderSegments = buildPaperFolderSegments(
      paper.blueprintSnapshot.header.classLevel,
      paper.blueprintSnapshot.header.subject
    );
    await writeFileToLibraryFolder(folderSegments, fileName, blob);
  }

  await repository.papersRepo.recordExport({
    id: generateId('exp'),
    paperId: paper.id,
    format,
    setCode: format === 'json' ? undefined : setCode,
    fileName,
    savedToLibraryFolder: savedExports,
    createdAt: Date.now(),
  });

  if (options?.download !== false) {
    triggerBlobDownload(blob, fileName);
  }

  return { fileName, savedToLibraryFolder: savedExports, blob };
}
