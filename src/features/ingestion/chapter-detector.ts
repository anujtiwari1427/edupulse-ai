import type { ChapterRecord, ChunkRecord } from '@/src/lib/zod-schemas';
import type { DetectedChapter, ExtractedPage, OutlineItem } from './types';
import { repository } from '@/src/features/storage/repository';
import { AppError } from '@/src/lib/errors';

/**
 * Printing/scanner DTP plate labels found in Indian state board and publisher PDFs.
 * These are NOT academic chapters and must be filtered out.
 */
export const BOGUS_OUTLINE_REGEX =
  /^(?:cover(?:\s*no\.?)?\s*\d*|prilim|prelim|prelims|text|body|front\s*matter|back\s*matter|inside\s*cover|blank\s*page|title\s*page|acknowledgements?|preface)$/i;

const CHAPTER_PATTERNS = [
  /^(?:chapter|unit|lesson|module)\s+(\d+|[ivxlcdm]+)\s*[:.\-–]?\s*(.*)$/i,
  /^(?:अध्याय|पाठ|इकाई|प्रकरण)\s*([०-९\d]+)\s*[:.\-–]?\s*(.*)$/,
  // 1. Sets, 2. Real Numbers, 1 - Sets
  /^(\d{1,2})\s*[\.:\-–]\s*([\p{L}\p{M}\p{N}\s,'\-\(\)\/&]{2,80})$/u,
  // Marathi/Hindi: १. संच, २. वास्तव संख्या
  /^([०-९]{1,2})\s*[\.:\-–]\s*([\p{L}\p{M}\p{N}\s,'\-\(\)\/&]{2,80})$/u,
  // Roman numerals: I. Sets, II. Real Numbers
  /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\s*[\.:\-–]\s*([A-Za-z][\w\s,'\-\(\)]{2,80})$/,
];

const TOPIC_HINT_PATTERNS = [
  /^(?:\d+\.\d+)\s+([\p{L}\p{M}\p{N}\s,'\-]{3,60})$/u,
  /^(?:exercise|practice|summary|key points|स्वाध्याय|सरावसंच)\s*[:.-]?\s*(.*)$/i,
];

function cleanHeadingTitle(line: string): string {
  return line
    .replace(/^[\s.:\-–]+/, '')
    .replace(/[\s.:\-–]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function parseDevanagariOrArabicNumber(str: string): number | null {
  const devanagariDigits: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  };
  const normalized = str.replace(/[०-९]/g, (d) => devanagariDigits[d] || d);
  const num = parseInt(normalized, 10);
  return isNaN(num) ? null : num;
}

interface TocEntry {
  order: number;
  title: string;
  tocPage: number;
}

/**
 * Searches the first 15 pages for an Index / Table of Contents / अनुक्रमणिका page
 * and extracts chapter listings with printed page numbers.
 */
export function extractChaptersFromTOC(pages: ExtractedPage[]): DetectedChapter[] {
  const totalPages = Math.max(1, pages.length, ...pages.map((p) => p.pageNumber));
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const frontPages = sortedPages.filter((p) => p.pageNumber <= 15);

  const tocHeaders = /(?:(?:table\s+of\s+)?contents|index|अनुक्रमणिका|विषय[\s\-]*सूची)/i;

  let tocPageIndex = -1;
  for (let i = 0; i < frontPages.length; i++) {
    const pageText = frontPages[i]!.text;
    const topPortion = pageText.split('\n').slice(0, 12).join(' ');
    if (tocHeaders.test(topPortion)) {
      tocPageIndex = i;
      break;
    }
  }

  if (tocPageIndex === -1) {
    return [];
  }

  const tocPage = frontPages[tocPageIndex]!;
  const lines = tocPage.text.split('\n').map((l) => l.trim()).filter(Boolean);

  const tocEntries: TocEntry[] = [];
  // Match lines like:
  // "1. Sets ........... 1"
  // "2. Real Numbers ... 19"
  // "१. संच ............ १"
  // "1  Sets           1"
  const tocLineRegex =
    /^(?:chapter|unit|lesson|module|अध्याय|पाठ|प्रकरण)?\s*([०-९\d]+|[ivxlcdm]+)[\s.:\-–]+([\p{L}\p{M}\p{N}\s,'\-\(\)\/&]{1,100}?)(?:[\s._–\-·…]+|\s{2,})([०-९\d]+)$/u;

  let sequentialOrder = 1;
  for (const line of lines) {
    if (tocHeaders.test(line)) continue;
    if (/^(?:no|sr|serial|page|पृष्ठ|अनुक्रमांक)\b/i.test(line)) continue;

    const match = line.match(tocLineRegex);
    if (match) {
      const parsedOrder = parseDevanagariOrArabicNumber(match[1]!) ?? sequentialOrder;
      const title = cleanHeadingTitle(match[2]!);
      const pageNum = parseDevanagariOrArabicNumber(match[3]!);

      if (title.length >= 2 && pageNum !== null && pageNum >= 1) {
        if (!BOGUS_OUTLINE_REGEX.test(title)) {
          tocEntries.push({
            order: parsedOrder,
            title,
            tocPage: pageNum,
          });
          sequentialOrder = parsedOrder + 1;
        }
      }
    }
  }

  if (tocEntries.length < 2) {
    return [];
  }

  // Calculate physical PDF page offset
  // In textbooks, printed page 1 usually starts at physical PDF page 7-15.
  // We locate where the first chapter's title appears in pages 5-25 to compute the offset.
  const firstEntry = tocEntries[0]!;
  let detectedOffset = 0;
  const firstTitleLower = firstEntry.title.toLowerCase();

  for (const page of sortedPages) {
    if (page.pageNumber <= tocPage.pageNumber) continue;
    if (page.pageNumber > tocPage.pageNumber + 25) break;

    const textLower = page.text.toLowerCase();
    if (textLower.includes(firstTitleLower) || textLower.includes(`1. ${firstTitleLower}`)) {
      detectedOffset = page.pageNumber - firstEntry.tocPage;
      break;
    }
  }

  // Fallback: If title match wasn't found, estimate offset based on TOC page number
  if (detectedOffset <= 0) {
    detectedOffset = Math.max(0, tocPage.pageNumber);
  }

  const detectedChapters: DetectedChapter[] = [];
  for (let idx = 0; idx < tocEntries.length; idx++) {
    const entry = tocEntries[idx]!;
    const nextEntry = tocEntries[idx + 1];

    let startPage = entry.tocPage + detectedOffset;
    if (startPage < 1) startPage = 1;
    if (startPage > totalPages) startPage = totalPages;

    let endPage = totalPages;
    if (nextEntry) {
      const nextStart = nextEntry.tocPage + detectedOffset;
      endPage = Math.max(startPage, Math.min(totalPages, nextStart - 1));
    }

    detectedChapters.push({
      order: idx + 1,
      title: entry.title,
      startPage,
      endPage,
      topics: extractTopicsFromPages(sortedPages, startPage, endPage),
    });
  }

  return detectedChapters;
}

export function detectChaptersFromPages(
  pages: ExtractedPage[],
  outline: OutlineItem[] = []
): DetectedChapter[] {
  const totalPages = Math.max(1, pages.length, ...pages.map((p) => p.pageNumber));

  // 1. Tier 1: Check PDF outline/bookmarks, strictly filtering out DTP plate labels
  if (outline.length > 0) {
    const validOutline = outline
      .filter((o) => {
        const clean = o.title.trim();
        return (
          o.pageNumber >= 1 &&
          o.pageNumber <= totalPages &&
          clean.length > 0 &&
          !BOGUS_OUTLINE_REGEX.test(clean)
        );
      })
      .sort((a, b) => a.pageNumber - b.pageNumber);

    // Deduplicate entries on same page
    const deduped: OutlineItem[] = [];
    for (const item of validOutline) {
      if (deduped.length === 0 || deduped[deduped.length - 1]!.pageNumber < item.pageNumber) {
        deduped.push(item);
      }
    }

    // Reject outline if it has only 1 item covering > 60% of document (e.g. "TEXT" spanning whole book)
    const isSingleGiantPlate =
      deduped.length === 1 && (totalPages - deduped[0]!.pageNumber) / totalPages > 0.6;

    if (deduped.length >= 2 && !isSingleGiantPlate) {
      return deduped.map((item, idx) => {
        const next = deduped[idx + 1];
        const startPage = idx === 0 ? 1 : item.pageNumber;
        const endPage = next ? Math.max(startPage, next.pageNumber - 1) : totalPages;
        return {
          order: idx + 1,
          title: cleanHeadingTitle(item.title),
          startPage,
          endPage,
          topics: extractTopicsFromPages(pages, startPage, endPage),
        };
      });
    }
  }

  // 2. Tier 2: Extract from Table of Contents / Index / अनुक्रमणिका
  const tocChapters = extractChaptersFromTOC(pages);
  if (tocChapters.length >= 2) {
    return tocChapters;
  }

  // 3. Tier 3: Scan body page headings
  interface HeadingHit {
    pageNumber: number;
    title: string;
  }

  const hits: HeadingHit[] = [];
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  for (const page of sortedPages) {
    const topLines = page.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10);

    for (let i = 0; i < topLines.length; i++) {
      const line = topLines[i]!;
      if (BOGUS_OUTLINE_REGEX.test(line)) continue;

      const matched = CHAPTER_PATTERNS.some((re) => re.test(line));
      if (matched && line.length <= 120) {
        let title = line;
        const nextLine = topLines[i + 1];
        if (
          title.length < 18 &&
          nextLine &&
          nextLine.length <= 90 &&
          !CHAPTER_PATTERNS.some((re) => re.test(nextLine)) &&
          !BOGUS_OUTLINE_REGEX.test(nextLine)
        ) {
          title = `${title}: ${nextLine}`;
        }

        const clean = cleanHeadingTitle(title);
        if (!BOGUS_OUTLINE_REGEX.test(clean)) {
          if (hits.length === 0 || hits[hits.length - 1]!.pageNumber < page.pageNumber) {
            hits.push({ pageNumber: page.pageNumber, title: clean });
          }
        }
        break;
      }
    }
  }

  if (hits.length > 0) {
    return hits.map((hit, idx) => {
      const startPage = idx === 0 ? 1 : hit.pageNumber;
      const next = hits[idx + 1];
      const endPage = next ? Math.max(startPage, next.pageNumber - 1) : totalPages;
      return {
        order: idx + 1,
        title: hit.title,
        startPage,
        endPage,
        topics: extractTopicsFromPages(sortedPages, startPage, endPage),
      };
    });
  }

  // 4. Fallback: single chapter
  return [
    {
      order: 1,
      title: 'Chapter 1: Full Document',
      startPage: 1,
      endPage: totalPages,
      topics: extractTopicsFromPages(sortedPages, 1, totalPages),
    },
  ];
}

export function extractTopicsFromPages(
  pages: ExtractedPage[],
  startPage: number,
  endPage: number
): string[] {
  const topics = new Set<string>();
  for (const page of pages) {
    if (page.pageNumber < startPage || page.pageNumber > endPage) continue;
    const lines = page.text.split('\n').map((l) => l.trim());
    for (const line of lines) {
      for (const pattern of TOPIC_HINT_PATTERNS) {
        const m = line.match(pattern);
        if (m?.[1] && m[1].trim().length >= 4) {
          topics.add(cleanHeadingTitle(m[1].trim()));
        }
      }
      if (topics.size >= 8) return Array.from(topics);
    }
  }
  return Array.from(topics);
}

// Pure Chapter Manager operations
export function renameChapter(
  chapters: ChapterRecord[],
  chapterId: string,
  newTitle: string
): ChapterRecord[] {
  const clean = newTitle.trim();
  if (!clean) return chapters;
  return chapters.map((ch) => (ch.id === chapterId ? { ...ch, title: clean } : ch));
}

export function updateChapterRange(
  chapters: ChapterRecord[],
  chapterId: string,
  newStartPage: number,
  newEndPage: number
): ChapterRecord[] {
  if (newStartPage > newEndPage) return chapters;
  return chapters.map((ch) =>
    ch.id === chapterId ? { ...ch, startPage: newStartPage, endPage: newEndPage } : ch
  );
}

export function splitChapterAtPage(
  chapters: ChapterRecord[],
  chapterId: string,
  splitPage: number,
  newTitle = 'New Chapter'
): ChapterRecord[] {
  const target = chapters.find((ch) => ch.id === chapterId);
  if (!target) return chapters;
  if (splitPage <= target.startPage || splitPage > target.endPage) return chapters;

  const firstPart: ChapterRecord = {
    ...target,
    endPage: splitPage - 1,
  };

  const secondPart: ChapterRecord = {
    ...target,
    id: `${target.bookId}_ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    order: target.order + 1,
    title: newTitle,
    startPage: splitPage,
    endPage: target.endPage,
    topics: [],
  };

  const result: ChapterRecord[] = [];
  for (const ch of chapters) {
    if (ch.id === chapterId) {
      result.push(firstPart, secondPart);
    } else if (ch.order > target.order) {
      result.push({ ...ch, order: ch.order + 1 });
    } else {
      result.push(ch);
    }
  }

  return result;
}

export function mergeChapters(
  chapters: ChapterRecord[],
  firstChapterId: string,
  secondChapterId?: string
): ChapterRecord[] {
  const firstIndex = chapters.findIndex((ch) => ch.id === firstChapterId);
  if (firstIndex === -1) return chapters;

  const targetSecondId =
    !secondChapterId || secondChapterId === 'next'
      ? chapters[firstIndex + 1]?.id
      : secondChapterId;

  const first = chapters[firstIndex]!;
  const second = chapters.find((ch) => ch.id === targetSecondId);
  if (!second) return chapters;

  const merged: ChapterRecord = {
    ...first,
    title: `${first.title} & ${second.title}`,
    startPage: Math.min(first.startPage, second.startPage),
    endPage: Math.max(first.endPage, second.endPage),
    topics: Array.from(new Set([...first.topics, ...second.topics])),
  };

  const result: ChapterRecord[] = [];
  let placed = false;

  for (const ch of chapters) {
    if (ch.id === firstChapterId) {
      if (!placed) {
        result.push(merged);
        placed = true;
      }
    } else if (ch.id === targetSecondId) {
      // omit merged second chapter
    } else {
      result.push(ch);
    }
  }

  return result.map((ch, idx) => ({ ...ch, order: idx + 1 }));
}

export function reassignChunksToChapters(
  chunks: ChunkRecord[],
  chapters: ChapterRecord[]
): ChunkRecord[] {
  const sorted = [...chapters].sort((a, b) => a.startPage - b.startPage);
  return chunks.map((chunk) => {
    const matched = sorted.find(
      (ch) => chunk.pageNumber >= ch.startPage && chunk.pageNumber <= ch.endPage
    );
    return {
      ...chunk,
      chapterId: matched ? matched.id : sorted[0]?.id ?? chunk.chapterId,
    };
  });
}

/**
 * On-demand fast local TOC and heading chapter detection for an existing book in the library.
 * Reads book content from chunks, detects syllabus chapters, and saves to IndexedDB.
 */
export async function applyAutoDetectedChaptersToBook(bookId: string): Promise<ChapterRecord[]> {
  const book = await repository.libraryRepo.getBook(bookId);
  if (!book) {
    throw new AppError(`Textbook with ID "${bookId}" was not found.`, { code: 'NOT_FOUND' });
  }

  const chunks = await repository.libraryRepo.listAllChunks(bookId);
  const pageMap = new Map<number, string>();
  for (const chunk of chunks) {
    const existing = pageMap.get(chunk.pageNumber) || '';
    pageMap.set(chunk.pageNumber, `${existing}\n${chunk.text}`.trim());
  }

  const pages: ExtractedPage[] = [];
  const maxPage = Math.max(book.pageCount, ...Array.from(pageMap.keys()), 1);

  for (let p = 1; p <= maxPage; p++) {
    pages.push({
      pageNumber: p,
      text: pageMap.get(p) || '',
    });
  }

  const detected = detectChaptersFromPages(pages, []);

  const newChapters: ChapterRecord[] = detected.map((ch) => ({
    id: `${book.id}_ch_${ch.order}`,
    bookId: book.id,
    order: ch.order,
    title: ch.title,
    startPage: ch.startPage,
    endPage: ch.endPage,
    topics: ch.topics,
  }));

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
