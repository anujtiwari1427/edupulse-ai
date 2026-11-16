import { repository } from '@/src/features/storage/repository';
import { callAIProvider, isAIConfigured } from '@/src/features/generation/ai-providers';
import { extractJsonFromAIResponse } from '@/src/features/generation/paper-engine';
import {
  BOGUS_OUTLINE_REGEX,
  detectChaptersFromPages,
  reassignChunksToChapters,
} from './chapter-detector';
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
 * Extracts and synthesizes textbook front matter, isolated TOC page, and page markers into a concise prompt.
 */
function buildSampleTextForAI(pages: ExtractedPage[], outline: OutlineItem[] = []): string {
  const totalPages = Math.max(1, pages.length);
  const sampleParts: string[] = [];

  // 1. PDF Outline / Bookmarks (strictly filtering bogus DTP labels)
  const cleanOutline = outline.filter(
    (item) =>
      item.title.trim().length > 0 &&
      !BOGUS_OUTLINE_REGEX.test(item.title) &&
      item.pageNumber >= 1 &&
      item.pageNumber <= totalPages
  );

  if (cleanOutline.length > 0) {
    const outlineSummary = cleanOutline
      .slice(0, 30)
      .map((item) => `- "${item.title}" (Page ${item.pageNumber})`)
      .join('\n');
    sampleParts.push(`--- EMBEDDED DOCUMENT OUTLINE ---\n${outlineSummary}\n`);
  }

  // 2. Identify and highlight Table of Contents / Index page
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const frontPages = sortedPages.filter((p) => p.pageNumber <= 25);
  const tocHeaders = /(?:(?:table\s+of\s+)?contents|index|अनुक्रमणिका|विषय[\s\-]*सूची)/i;

  let tocFound = false;
  for (const page of frontPages) {
    if (tocHeaders.test(page.text.slice(0, 2000))) {
      sampleParts.push(
        `--- TABLE OF CONTENTS / INDEX (PDF Physical Page ${page.pageNumber}) ---\n${page.text.trim().slice(0, 4000)}`
      );
      tocFound = true;
    }
  }

  // Also include first 5 pages for book title, edition, and metadata
  for (const page of frontPages.slice(0, 5)) {
    const trimmed = page.text.trim();
    if (trimmed.length > 0 && !sampleParts.some((p) => p.includes(`PDF Physical Page ${page.pageNumber}`))) {
      sampleParts.push(`--- PDF FRONT PAGE ${page.pageNumber} ---\n${trimmed.slice(0, 1500)}`);
    }
  }

  // 3. Sample headings detected across body pages
  const headingLines: string[] = [];
  const candidatePatterns = [
    /^(?:chapter|unit|lesson|module)\s+(\d+|[ivxlcdm]+)\s*[:.\-–]?\s*(.*)$/i,
    /^(?:अध्याय|पाठ|इकाई|प्रकरण)\s*([०-९\d]+)\s*[:.\-–]?\s*(.*)$/,
    /^(\d{1,2})\s*[\.:\-–]\s*([A-Za-z\u0900-\u097F][\w\s,'\-\(\)\/\&]{2,80})$/,
    /^([०-९]{1,2})\s*[\.:\-–]\s*([\u0900-\u097F][\w\s,'\-\(\)\/\&]{2,80})$/,
  ];

  for (const page of sortedPages) {
    if (page.pageNumber <= 5) continue;
    const lines = page.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 3 && l.length <= 100);

    for (const line of lines.slice(0, 6)) {
      if (BOGUS_OUTLINE_REGEX.test(line)) continue;
      if (candidatePatterns.some((re) => re.test(line))) {
        headingLines.push(`Physical Page ${page.pageNumber}: ${line}`);
        break;
      }
    }
    if (headingLines.length >= 25) break;
  }

  if (headingLines.length > 0) {
    sampleParts.push(
      `--- CANDIDATE CHAPTER MARKERS IN BODY PAGES ---\n${headingLines.join('\n')}`
    );
  }

  return sampleParts.join('\n\n').slice(0, 16000);
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
Your task is to analyze the textbook's Table of Contents (TOC) and chapter headings to detect all academic curriculum chapters.

CRITICAL INSTRUCTIONS:
1. Extract ONLY genuine curriculum chapters/units in sequential order (1, 2, 3...).
2. EXCLUDE all printing, DTP, and scanner artifact labels: "PRILIM", "PRELIM", "TEXT", "BODY", "COVER NO. 1", "COVER NO. 2", "COVER NO. 3", "COVER NO. 4", "INSIDE COVER". These are NEVER chapters.
3. Clean chapter titles (e.g. "Sets", "Real Numbers", "Polynomials", "रासायनिक अभिक्रिया और समीकरण"). Strip unnecessary noise like "Chapter 1:" from the title if you prefer, or keep it standard.
4. Determine physical PDF startPage and endPage for each chapter.
   - Note that printed page 1 in the book usually starts several pages into the physical PDF (e.g. printed page 1 may be physical PDF page 11).
   - startPage must be >= 1 and endPage must be <= ${totalPages}.
   - Chapters must be sequential and non-overlapping.
5. Provide 2-5 key sub-topics for each chapter.
6. Return only valid JSON according to the schema.`;

  const userPrompt = `Analyze this Indian textbook (${metadata.board} Class ${metadata.classLevel} ${metadata.subject}) and return the structured chapter breakdown.

Document Information:
- Title: "${metadata.title}"
- Board: ${metadata.board}
- Class: ${metadata.classLevel}
- Subject: ${metadata.subject}
- Total Physical PDF Pages: ${totalPages}

Document Text Sample (TOC & Page Markers):
${sampleText}

Return the complete JSON object with the "chapters" array.`;

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
            startPage: { type: 'INTEGER', description: `Physical PDF starting page (>= 1)` },
            endPage: { type: 'INTEGER', description: `Physical PDF ending page (<= ${totalPages})` },
            topics: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: '2-5 key curriculum subtopics in this chapter',
            },
          },
          required: ['order', 'title', 'startPage', 'endPage'],
        },
      },
    },
    required: ['chapters'],
  };

  try {
    const result = await callAIProvider(settings, {
      systemPrompt,
      userPrompt,
      responseSchema,
      temperature: 0.1,
      timeoutMs: 15_000,
    });

    const rawOutput = result.text || (result as { content?: string }).content || '';
    const parsed = extractJsonFromAIResponse<RawAIResponse>(rawOutput);
    const chapters = parsed?.chapters;

    if (!Array.isArray(chapters) || chapters.length === 0) {
      // Fallback to local heuristic TOC detector
      return detectChaptersFromPages(pages, outline);
    }

    const sanitized = sanitizeAIChapters(chapters, totalPages);
    return sanitized.length > 0 ? sanitized : detectChaptersFromPages(pages, outline);
  } catch (err) {
    console.warn('AI chapter detection failed or timed out, falling back to local detector:', err);
    return detectChaptersFromPages(pages, outline);
  }
}

function sanitizeAIChapters(raw: RawAIChapter[], totalPages: number): DetectedChapter[] {
  const filtered = raw.filter((item) => {
    if (!item.title || typeof item.title !== 'string') return false;
    const clean = item.title.trim();
    if (clean.length < 2) return false;
    if (BOGUS_OUTLINE_REGEX.test(clean)) return false;
    return true;
  });

  if (filtered.length === 0) return [];

  // Sort by startPage or order
  filtered.sort((a, b) => {
    const pA = a.startPage ?? 0;
    const pB = b.startPage ?? 0;
    if (pA !== pB) return pA - pB;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  const validChapters: DetectedChapter[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i]!;
    const cleanTitle = item.title!.replace(/\s+/g, ' ').trim().slice(0, 180);

    let start = Math.max(1, Math.min(totalPages, Number(item.startPage) || 1));
    let end = Math.max(start, Math.min(totalPages, Number(item.endPage) || totalPages));

    if (validChapters.length > 0) {
      const prev = validChapters[validChapters.length - 1]!;
      if (start <= prev.endPage) {
        start = prev.endPage + 1;
      }
      if (start > totalPages) {
        start = totalPages;
      }
      if (end < start) {
        end = start;
      }
    }

    const topics = Array.isArray(item.topics)
      ? item.topics
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim().slice(0, 100))
      : [];

    validChapters.push({
      order: i + 1,
      title: cleanTitle,
      startPage: start,
      endPage: end,
      topics,
    });
  }

  // Ensure first starts at 1 and last reaches totalPages
  if (validChapters.length > 0) {
    validChapters[0]!.startPage = 1;
    validChapters[validChapters.length - 1]!.endPage = totalPages;
  }

  // Adjust contiguous page ranges
  for (let i = 0; i < validChapters.length; i++) {
    const cur = validChapters[i]!;
    const next = validChapters[i + 1];
    if (next) {
      if (cur.endPage >= next.startPage) {
        cur.endPage = Math.max(cur.startPage, next.startPage - 1);
      } else if (cur.endPage < next.startPage - 1) {
        cur.endPage = next.startPage - 1;
      }
    } else {
      cur.endPage = totalPages;
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

  let pages: ExtractedPage[] = [];
  let outline: OutlineItem[] = [];

  // 1. Try to re-extract fresh structured text directly from stored PDF
  if (typeof Worker !== 'undefined' && book.fileId) {
    try {
      const storedFile = await repository.libraryRepo.getFile(book.fileId);
      if (storedFile?.data) {
        const { createWorkerClient } = await import('./ingestion-service');
        const workerHandle = createWorkerClient();
        const batch = await workerHandle.api.parsePdfPageBatch(
          storedFile.data.slice(0),
          1,
          book.pageCount || 1000,
          true
        );
        workerHandle.terminate();
        if (batch && batch.pages.length > 0) {
          pages = batch.pages;
          outline = batch.outline || [];
        }
      }
    } catch (workerErr) {
      console.warn('Worker re-parse fallback to stored chunks:', workerErr);
    }
  }

  // 2. Fallback: synthesize extracted pages from existing chunks
  if (pages.length === 0) {
    const chunks = await repository.libraryRepo.listAllChunks(bookId);
    const pageMap = new Map<number, string>();
    for (const chunk of chunks) {
      const existing = pageMap.get(chunk.pageNumber) || '';
      pageMap.set(chunk.pageNumber, `${existing}\n${chunk.text}`.trim());
    }

    const maxPage = Math.max(book.pageCount, ...Array.from(pageMap.keys()), 1);
    for (let p = 1; p <= maxPage; p++) {
      pages.push({
        pageNumber: p,
        text: pageMap.get(p) || '',
      });
    }
  }

  const detected = await detectChaptersWithAI(
    pages,
    {
      bookId: book.id,
      title: book.title,
      board: book.board,
      classLevel: book.classLevel,
      subject: book.subject,
      language: book.language,
    },
    outline
  );

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

  const existingChunks = await repository.libraryRepo.listAllChunks(book.id);
  const reassignedChunks = reassignChunksToChapters(existingChunks, newChapters);
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
