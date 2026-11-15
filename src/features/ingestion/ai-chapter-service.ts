import { repository } from '@/src/features/storage/repository';
import { callAIProvider, isAIConfigured } from '@/src/features/generation/ai-providers';
import { extractJsonFromAIResponse } from '@/src/features/generation/paper-engine';
import { reassignChunksToChapters } from './chapter-detector';
import {
  ChapterSchema,
  type BoardType,
  type BookRecord,
  type ChapterRecord,
  type LanguageCode,
  type SettingsRecord,
} from '@/src/lib/zod-schemas';
import type { DetectedChapter, ExtractedPage, OutlineItem } from './types';
import { AppError, getErrorMessage } from '@/src/lib/errors';

export interface AIChapterMetadata {
  bookId: string;
  title: string;
  board: BoardType;
  classLevel: number;
  subject: string;
  language: LanguageCode;
}

interface RawAIChapter {
  order?: number;
  title?: string;
  startPage?: number;
  endPage?: number;
  topics?: string[];
}

interface RawAIResponse {
  chapters?: RawAIChapter[];
}

/**
 * Extracts and synthesizes textbook front matter and page markers into a concise context prompt
 */
function buildSampleTextForAI(pages: ExtractedPage[], outline: OutlineItem[] = []): string {
  const totalPages = Math.max(1, pages.length);
  const sampleParts: string[] = [];

  // 1. PDF Outline / Bookmarks if available
  if (outline.length > 0) {
    const outlineSummary = outline
      .slice(0, 40)
      .map((item) => `- "${item.title}" (Page ${item.pageNumber})`)
      .join('\n');
    sampleParts.push(`--- EMBEDDED DOCUMENT OUTLINE ---\n${outlineSummary}\n`);
  }

  // 2. Front matter pages (first 18 pages contain TOC, Syllabus, Course Content)
  const frontPages = pages
    .filter((p) => p.pageNumber <= 18)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  for (const page of frontPages) {
    const trimmed = page.text.trim();
    if (trimmed.length > 0) {
      sampleParts.push(`--- PAGE ${page.pageNumber} ---\n${trimmed.slice(0, 2500)}`);
    }
  }

  // 3. Sample headings from subsequent pages to confirm chapter locations
  const remainingPages = pages
    .filter((p) => p.pageNumber > 18)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const headingLines: string[] = [];
  for (const page of remainingPages) {
    const lines = page.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 4 && l.length <= 100);

    for (const line of lines.slice(0, 4)) {
      if (
        /^(?:chapter|unit|lesson|module|अध्याय|पाठ|प्रकरण)\s+\d+/i.test(line) ||
        /^\d+\s*[.\-:]\s*[A-Z]/.test(line)
      ) {
        headingLines.push(`Page ${page.pageNumber}: ${line}`);
        break;
      }
    }
  }

  if (headingLines.length > 0) {
    sampleParts.push(
      `--- SAMPLE HEADINGS DETECTED ACROSS PAGES ---\n${headingLines.slice(0, 30).join('\n')}`
    );
  }

  return sampleParts.join('\n\n').slice(0, 25000);
}

/**
 * Uses Google Gemini AI to analyze textbook table of contents and structure,
 * returning accurate chapters, page numbers, and key topics.
 */
export async function detectChaptersWithAI(
  pages: ExtractedPage[],
  metadata: AIChapterMetadata,
  outline: OutlineItem[] = [],
  settingsOverride?: SettingsRecord
): Promise<DetectedChapter[]> {
  const settings = settingsOverride ?? (await repository.settingsRepo.get());
  if (!settings || !isAIConfigured(settings)) {
    throw new AppError('AI provider is not configured.', { code: 'AI_DISABLED' });
  }

  const totalPages = Math.max(1, pages.length);
  const sampleText = buildSampleTextForAI(pages, outline);

  if (!sampleText.trim()) {
    throw new AppError('No text available in the document to detect chapters.', {
      code: 'EMPTY_DOCUMENT_TEXT',
    });
  }

  const systemPrompt = `You are an expert curriculum and textbook analysis AI for Indian education boards (${metadata.board}, Class ${metadata.classLevel} ${metadata.subject}).
Your task is to analyze the textbook's Table of Contents (TOC), front matter, and page headings to detect all chapters.

Rules:
1. Identify all genuine curriculum chapters/units in sequential order (1, 2, 3...).
2. Provide clean, professional chapter titles (e.g. "Chemical Reactions and Equations", "Acids, Bases and Salts"). Remove unnecessary prefix garbage like "Unit-I:" unless essential.
3. Determine accurate startPage and endPage for each chapter. startPage must be >= 1 and endPage must be <= ${totalPages}.
4. Ensure chapters are sequential and non-overlapping.
5. Provide 2-5 essential sub-topics for each chapter.
6. Return only valid JSON according to the schema.`;

  const userPrompt = `Analyze this textbook and return the chapter breakdown.

Document Information:
- Title: "${metadata.title}"
- Board: ${metadata.board}
- Class: ${metadata.classLevel}
- Subject: ${metadata.subject}
- Total Document Pages: ${totalPages}

Document Text Sample (TOC & Page Markers):
${sampleText}

Return the complete JSON array of detected chapters.`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      chapters: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            order: { type: 'INTEGER', description: 'Chapter sequence number starting from 1' },
            title: { type: 'STRING', description: 'Clean chapter title' },
            startPage: { type: 'INTEGER', description: `Starting page (>= 1)` },
            endPage: { type: 'INTEGER', description: `Ending page (<= ${totalPages})` },
            topics: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Key syllabus topics in this chapter',
            },
          },
          required: ['order', 'title', 'startPage', 'endPage'],
        },
      },
    },
    required: ['chapters'],
  };

  const response = await callAIProvider(settings, {
    systemPrompt,
    userPrompt,
    responseSchema,
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 40_000,
  });

  const parsed = extractJsonFromAIResponse(response.text) as RawAIResponse;
  const rawChapters = parsed?.chapters;

  if (!Array.isArray(rawChapters) || rawChapters.length === 0) {
    throw new AppError('AI could not detect structured chapters from this document.', {
      code: 'AI_CHAPTER_DETECTION_FAILED',
    });
  }

  // Normalize, validate, and clean chapter boundaries
  const validChapters: DetectedChapter[] = [];
  const sorted = [...rawChapters].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  for (let idx = 0; idx < sorted.length; idx++) {
    const ch = sorted[idx]!;
    const title = (ch.title || `Chapter ${idx + 1}`).trim().slice(0, 150);
    const order = idx + 1;
    let startPage = Math.max(1, Math.min(totalPages, Number(ch.startPage) || 1));
    let endPage = Math.max(startPage, Math.min(totalPages, Number(ch.endPage) || startPage));

    // Ensure monotonically increasing page boundaries
    if (idx > 0 && startPage <= validChapters[idx - 1]!.startPage) {
      startPage = validChapters[idx - 1]!.endPage + 1;
      if (startPage > totalPages) startPage = totalPages;
    }

    if (endPage < startPage) {
      endPage = startPage;
    }

    const topics = Array.isArray(ch.topics)
      ? ch.topics.map((t) => String(t).trim()).filter((t) => t.length > 0).slice(0, 8)
      : [];

    validChapters.push({
      order,
      title,
      startPage,
      endPage,
      topics,
    });
  }

  // Fix end pages: ensure each chapter spans until the next chapter starts, and last reaches totalPages
  for (let i = 0; i < validChapters.length; i++) {
    const cur = validChapters[i]!;
    const next = validChapters[i + 1];
    if (next) {
      if (cur.endPage < cur.startPage || cur.endPage >= next.startPage) {
        cur.endPage = Math.max(cur.startPage, next.startPage - 1);
      }
    } else {
      if (cur.endPage < totalPages) {
        cur.endPage = totalPages;
      }
    }
  }

  return validChapters;
}

/**
 * On-demand AI chapter scanner for an existing book in the library.
 * Reads book content, calls Gemini AI to understand chapters, and updates IndexedDB.
 */
export async function applyAIChaptersToBook(bookId: string): Promise<ChapterRecord[]> {
  const book = await repository.libraryRepo.getBook(bookId);
  if (!book) {
    throw new AppError(`Textbook with ID "${bookId}" was not found.`, { code: 'NOT_FOUND' });
  }

  const storedFile = await repository.libraryRepo.getFile(book.fileId);
  if (!storedFile) {
    throw new AppError('Source document file binary is missing from local storage.', {
      code: 'MISSING_FILE',
    });
  }

  // Synthesize extracted pages from existing chunks
  const chunks = await repository.libraryRepo.listAllChunks(bookId);
  const pageMap = new Map<number, string>();
  for (const chunk of chunks) {
    const existing = pageMap.get(chunk.pageNumber) || '';
    pageMap.set(chunk.pageNumber, `${existing}\n${chunk.text}`.trim());
  }

  const pages: ExtractedPage[] = [];
  const maxPage = Math.max(book.pageCount, ...Array.from(pageMap.keys()));

  for (let p = 1; p <= maxPage; p++) {
    pages.push({
      pageNumber: p,
      text: pageMap.get(p) || '',
    });
  }

  const detected = await detectChaptersWithAI(pages, {
    bookId: book.id,
    title: book.title,
    board: book.board,
    classLevel: book.classLevel,
    subject: book.subject,
    language: book.language,
  });

  const newChapters: ChapterRecord[] = detected.map((ch) =>
    ChapterSchema.parse({
      id: `${book.id}_ch_${ch.order}`,
      bookId: book.id,
      order: ch.order,
      title: ch.title,
      startPage: ch.startPage,
      endPage: ch.endPage,
      topics: ch.topics,
    })
  );

  const reassignedChunks = reassignChunksToChapters(chunks, newChapters);
  await repository.libraryRepo.saveBookChaptersAndReassignChunks(
    book.id,
    newChapters,
    reassignedChunks
  );

  await repository.libraryRepo.saveBook({
    ...book,
    chunkCount: reassignedChunks.length,
    updatedAt: Date.now(),
  });

  return newChapters;
}
