import * as Comlink from 'comlink';
import type { IngestionWorkerApi } from '@/src/workers/ingestion.worker';
import { repository } from '@/src/features/storage/repository';
import { writeFileToLibraryFolder } from '@/src/features/storage/folder-sync';
import { AppError, getErrorMessage } from '@/src/lib/errors';
import { generateId, sha256Hex } from '@/src/lib/utils';
import {
  BookSchema,
  ChapterSchema,
  type BoardType,
  type BookRecord,
  type ChapterRecord,
  type JobRecord,
  type LanguageCode,
} from '@/src/lib/zod-schemas';
import { detectChaptersFromPages } from './chapter-detector';
import { chunkPages } from './chunker';
import { ocrImageFile, ocrScannedPdfPages } from './ocr-service';
import { parseQuestionBankText } from './question-parser';
import type { ExtractedPage, IngestCheckpoint, OutlineItem } from './types';

export interface StartIngestionInput {
  file: File;
  title: string;
  board: BoardType;
  classLevel: number;
  subject: string;
  language: LanguageCode;
  sourceType: 'textbook' | 'question_bank';
  ocrEnabled: boolean;
  copyrightConfirmed: boolean;
  defaultMarks?: number;
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.epub', '.txt', '.md', '.csv', '.json', '.png', '.jpg', '.jpeg'];

const activeControllers = new Map<string, AbortController>();

export function validateUploadFile(file: File): void {
  if (file.size === 0) {
    throw new AppError('The selected file is empty.', { code: 'EMPTY_FILE' });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError('File exceeds the 100 MB maximum upload size.', { code: 'FILE_TOO_LARGE' });
  }
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(
      `Unsupported file format "${ext}". Supported: ${ALLOWED_EXTENSIONS.join(', ')}`,
      { code: 'UNSUPPORTED_FILE_TYPE' }
    );
  }
}

function createWorkerClient(): { api: Comlink.Remote<IngestionWorkerApi>; terminate: () => void } {
  const worker = new Worker(new URL('../../workers/ingestion.worker.ts', import.meta.url), {
    type: 'module',
  });
  const api = Comlink.wrap<IngestionWorkerApi>(worker);
  return {
    api,
    terminate: () => worker.terminate(),
  };
}

export function cancelIngestionJob(jobId: string): void {
  const controller = activeControllers.get(jobId);
  if (controller) {
    controller.abort();
    activeControllers.delete(jobId);
  }
}

export async function startIngestionJob(input: StartIngestionInput): Promise<{
  bookId: string;
  jobId: string;
}> {
  if (!input.copyrightConfirmed) {
    throw new AppError('Please confirm educational-use rights before uploading.', {
      code: 'COPYRIGHT_REQUIRED',
    });
  }
  validateUploadFile(input.file);

  const now = Date.now();
  const bookId = generateId('book');
  const fileId = generateId('file');
  const jobId = generateId('job');

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const hash = await sha256Hex(bytes);

  await repository.libraryRepo.saveFile({
    id: fileId,
    name: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    size: input.file.size,
    sha256: hash,
    category: input.sourceType,
    createdAt: now,
    blob: input.file,
  });

  // Auto-save original file to local Library folder if connected
  const folderSubdir = input.sourceType === 'textbook' ? ['Textbooks'] : ['QuestionBanks'];
  void writeFileToLibraryFolder(folderSubdir, input.file.name, input.file);

  const book: BookRecord = BookSchema.parse({
    id: bookId,
    title: input.title.trim() || input.file.name,
    board: input.board,
    classLevel: input.classLevel,
    subject: input.subject.trim() || 'General',
    language: input.language,
    sourceType: input.sourceType,
    fileId,
    pageCount: 0,
    chunkCount: 0,
    status: 'processing',
    copyrightConfirmed: true,
    createdAt: now,
    updatedAt: now,
  });
  await repository.libraryRepo.saveBook(book);

  const checkpoint: IngestCheckpoint = {
    bookId,
    fileId,
    fileName: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    sourceType: input.sourceType,
    board: input.board,
    classLevel: input.classLevel,
    subject: input.subject.trim() || 'General',
    language: input.language,
    ocrEnabled: input.ocrEnabled,
    totalPages: 0,
    lastProcessedPage: 0,
    stage: 'parsing',
    pages: [],
    outline: [],
  };

  const job: JobRecord = {
    id: jobId,
    type: input.sourceType === 'question_bank' ? 'parse_bank' : 'ingest',
    status: 'running',
    title: `Ingesting ${book.title}`,
    progress: 2,
    processedItems: 0,
    totalItems: 1,
    checkpoint: JSON.stringify(checkpoint),
    createdAt: now,
    updatedAt: now,
  };
  await repository.jobsRepo.saveJob(job);

  // Execute asynchronously so UI can display live progress and cancel/pause controls
  void executeCheckpointPipeline(jobId, checkpoint, input.defaultMarks);

  return { bookId, jobId };
}

export async function resumeIngestionJob(jobId: string): Promise<void> {
  const jobs = await repository.jobsRepo.listJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job || !job.checkpoint) {
    throw new AppError('No resumable checkpoint found for this task.', { code: 'NO_CHECKPOINT' });
  }
  const checkpoint = JSON.parse(job.checkpoint) as IngestCheckpoint;
  await repository.jobsRepo.updateJobProgress(jobId, {
    status: 'running',
    errorMessage: undefined,
  });
  void executeCheckpointPipeline(jobId, checkpoint);
}

async function executeCheckpointPipeline(
  jobId: string,
  checkpoint: IngestCheckpoint,
  defaultMarks = 1
): Promise<void> {
  const controller = new AbortController();
  activeControllers.set(jobId, controller);
  const { signal } = controller;

  const saveCheckpoint = async (
    progress: number,
    processedItems: number,
    totalItems: number,
    patch?: Partial<IngestCheckpoint>
  ) => {
    Object.assign(checkpoint, patch);
    await repository.jobsRepo.updateJobProgress(jobId, {
      progress: Math.min(99, Math.max(1, Math.round(progress))),
      processedItems,
      totalItems,
      checkpoint: JSON.stringify(checkpoint),
    });
  };

  let workerHandle: ReturnType<typeof createWorkerClient> | null = null;

  try {
    const storedFile = await repository.libraryRepo.getFile(checkpoint.fileId);
    if (!storedFile) {
      throw new AppError('Source file binary missing from local IndexedDB.', {
        code: 'MISSING_SOURCE_FILE',
      });
    }

    const buffer = storedFile.data;
    const ext = `.${checkpoint.fileName.split('.').pop()?.toLowerCase() ?? ''}`;

    // Stage 1: Parse document pages (with batch checkpointing for PDFs)
    if (checkpoint.stage === 'parsing') {
      if (ext === '.pdf') {
        workerHandle = createWorkerClient();
        const batchSize = 5;
        let nextPage = checkpoint.lastProcessedPage + 1;
        let totalPages = checkpoint.totalPages;

        while (true) {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const batch = await workerHandle.api.parsePdfPageBatch(
            buffer.slice(0),
            nextPage,
            nextPage + batchSize - 1,
            nextPage === 1
          );
          totalPages = batch.totalPages;
          const existingNums = new Set(checkpoint.pages.map((p) => p.pageNumber));
          for (const page of batch.pages) {
            if (!existingNums.has(page.pageNumber)) {
              checkpoint.pages.push(page);
            }
          }
          const outline: OutlineItem[] =
            checkpoint.outline.length > 0 ? checkpoint.outline : batch.outline;
          const lastProcessed = Math.min(totalPages, nextPage + batchSize - 1);

          await saveCheckpoint((lastProcessed / Math.max(1, totalPages)) * 55, lastProcessed, totalPages, {
            totalPages,
            lastProcessedPage: lastProcessed,
            outline,
          });

          if (lastProcessed >= totalPages) break;
          nextPage = lastProcessed + 1;
        }
        workerHandle.terminate();
        workerHandle = null;
      } else if (ext === '.docx') {
        workerHandle = createWorkerClient();
        const pages = await workerHandle.api.parseDocx(buffer.slice(0));
        workerHandle.terminate();
        workerHandle = null;
        await saveCheckpoint(55, pages.length, Math.max(1, pages.length), {
          pages,
          totalPages: pages.length,
          lastProcessedPage: pages.length,
        });
      } else if (ext === '.epub') {
        workerHandle = createWorkerClient();
        const pages = await workerHandle.api.parseEpub(buffer.slice(0));
        workerHandle.terminate();
        workerHandle = null;
        await saveCheckpoint(55, pages.length, Math.max(1, pages.length), {
          pages,
          totalPages: pages.length,
          lastProcessedPage: pages.length,
        });
      } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        const imgFile = new File([buffer], checkpoint.fileName, { type: checkpoint.mimeType });
        const pages = await ocrImageFile(imgFile, checkpoint.language);
        await saveCheckpoint(70, 1, 1, {
          pages,
          totalPages: 1,
          lastProcessedPage: 1,
        });
      } else {
        // .txt / .md / .csv / .json
        const decoded = new TextDecoder().decode(buffer);
        const pages: ExtractedPage[] = [{ pageNumber: 1, text: decoded }];
        await saveCheckpoint(60, 1, 1, {
          pages,
          totalPages: 1,
          lastProcessedPage: 1,
        });
      }

      checkpoint.stage = checkpoint.ocrEnabled && ext === '.pdf' ? 'ocr' : checkpoint.sourceType === 'question_bank' ? 'parsing_bank' : 'chunking';
      await saveCheckpoint(60, checkpoint.lastProcessedPage, Math.max(1, checkpoint.totalPages));
    }

    // Stage 2: Optional OCR on scanned PDF pages
    if (checkpoint.stage === 'ocr') {
      const scannedCount = checkpoint.pages.filter((p) => p.needsOcr && !p.ocrApplied).length;
      if (scannedCount > 0) {
        await repository.jobsRepo.updateJobProgress(jobId, {
          type: 'ocr',
          title: `Running OCR on ${scannedCount} scanned page(s)…`,
        });

        const updatedPages = await ocrScannedPdfPages(buffer, checkpoint.pages, checkpoint.language, {
          signal,
          onProgress: (evt) => {
            void repository.jobsRepo.updateJobProgress(jobId, {
              progress: Math.round(60 + (evt.current / evt.total) * 25),
              processedItems: evt.current,
              totalItems: evt.total,
            });
          },
          onPageComplete: async (updatedPage) => {
            const idx = checkpoint.pages.findIndex((p) => p.pageNumber === updatedPage.pageNumber);
            if (idx >= 0) checkpoint.pages[idx] = updatedPage;
            await repository.jobsRepo.updateJobProgress(jobId, {
              checkpoint: JSON.stringify(checkpoint),
            });
          },
        });
        checkpoint.pages = updatedPages;
      }

      checkpoint.stage = checkpoint.sourceType === 'question_bank' ? 'parsing_bank' : 'chunking';
      await saveCheckpoint(85, checkpoint.totalPages, Math.max(1, checkpoint.totalPages));
    }

    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

    // Stage 3A: Question Bank Extraction
    if (checkpoint.stage === 'parsing_bank') {
      const fullText = checkpoint.pages.map((p) => p.text).join('\n\n');
      const existingQuestions = await repository.libraryRepo.listQuestions();
      const { parsed, duplicatesSkipped } = await parseQuestionBankText(fullText, {
        bookId: checkpoint.bookId,
        defaultMarks,
        language: checkpoint.language,
        existingQuestions,
      });

      if (parsed.length > 0) {
        await repository.libraryRepo.saveQuestions(parsed);
      }

      const book = await repository.libraryRepo.getBook(checkpoint.bookId);
      if (book) {
        await repository.libraryRepo.saveBook({
          ...book,
          pageCount: checkpoint.totalPages,
          chunkCount: parsed.length,
          status: 'ready',
          updatedAt: Date.now(),
        });
      }

      void writeFileToLibraryFolder(
        ['QuestionBanks'],
        `${checkpoint.bookId}.json`,
        JSON.stringify({ bookId: checkpoint.bookId, questions: parsed }, null, 2)
      );

      await repository.jobsRepo.updateJobProgress(jobId, {
        status: 'completed',
        progress: 100,
        processedItems: parsed.length,
        totalItems: parsed.length + duplicatesSkipped,
        title: `Imported ${parsed.length} questions (${duplicatesSkipped} duplicates skipped)`,
        checkpoint: undefined,
      });
      return;
    }

    // Stage 3B: Chapter Detection & Chunking for Textbooks
    const detected = detectChaptersFromPages(checkpoint.pages, checkpoint.outline);
    const chapters: ChapterRecord[] = detected.map((ch) =>
      ChapterSchema.parse({
        id: `${checkpoint.bookId}_ch_${ch.order}`,
        bookId: checkpoint.bookId,
        order: ch.order,
        title: ch.title,
        startPage: ch.startPage,
        endPage: ch.endPage,
        topics: ch.topics,
      })
    );

    const chunks = chunkPages(checkpoint.pages, chapters, {
      bookId: checkpoint.bookId,
      language: checkpoint.language,
    });

    await repository.libraryRepo.saveBookChaptersAndReassignChunks(
      checkpoint.bookId,
      chapters,
      chunks
    );

    const book = await repository.libraryRepo.getBook(checkpoint.bookId);
    if (book) {
      await repository.libraryRepo.saveBook({
        ...book,
        pageCount: checkpoint.totalPages,
        chunkCount: chunks.length,
        status: 'ready',
        updatedAt: Date.now(),
      });
    }

    void writeFileToLibraryFolder(
      ['Textbooks'],
      `${checkpoint.bookId}.json`,
      JSON.stringify({ book, chapters, chunks }, null, 2)
    );

    await repository.jobsRepo.updateJobProgress(jobId, {
      status: 'completed',
      progress: 100,
      processedItems: chunks.length,
      totalItems: chunks.length,
      title: `Indexed ${chapters.length} chapters & ${chunks.length} chunks`,
      checkpoint: undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      await repository.jobsRepo.updateJobProgress(jobId, {
        status: 'paused',
        checkpoint: JSON.stringify(checkpoint),
        errorMessage: 'Paused by user — click Resume to continue from checkpoint.',
      });
    } else {
      const msg = getErrorMessage(err);
      await repository.jobsRepo.updateJobProgress(jobId, {
        status: 'failed',
        errorMessage: msg,
        checkpoint: JSON.stringify(checkpoint),
      });
      const book = await repository.libraryRepo.getBook(checkpoint.bookId);
      if (book) {
        await repository.libraryRepo.saveBook({
          ...book,
          status: 'error',
          updatedAt: Date.now(),
        });
      }
    }
  } finally {
    if (workerHandle) workerHandle.terminate();
    activeControllers.delete(jobId);
  }
}
