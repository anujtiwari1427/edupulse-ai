import type { ChapterRecord, ChunkRecord } from '@/src/lib/zod-schemas';
import type { DetectedChapter, ExtractedPage, OutlineItem } from './types';
import { repository } from '@/src/features/storage/repository';
import { AppError } from '@/src/lib/errors';

/**
 * Printing/scanner DTP plate labels found in Indian state board and publisher PDFs.
 * These are NOT academic chapters and must be filtered out.
 */
export const BOGUS_OUTLINE_REGEX =
  /^(?:cover(?:\s*no\.?)?\s*\d*|prilim|prelim|prelims|text|body|front\s*matter|back\s*matter|inside\s*cover|blank\s*page|title\s*page|acknowledgements?|preface|contents|table\s+of\s+contents|index|अनुक्रमणिका|विषय[\s\-]*सूची|pledge|national\s+anthem|competenc(?:y|ies)\b.*)$/i;

const CHAPTER_PATTERNS = [
  /^(?:chapter|unit|lesson|module|part|section)\s+(\d+|[ivxlcdm]+)\s*[:.\-–]?\s*(.*)$/i,
  /^(?:अध्याय|पाठ|इकाई|प्रकरण|भाग)\s*([०-९\d]+)\s*[:.\-–]?\s*(.*)$/,
  // 1. Sets, 2. Real Numbers, 1 - Sets, 1: Sets, 1 – Sets
  /^(\d{1,2})\s*[\.:\-–]\s*([\p{L}\p{M}\p{N}\s,'\-\(\)\/&:–]{2,80})$/u,
  // 1 Historiography : Development in the West (space only, starting with capital letter or Devanagari)
  /^(\d{1,2})\s+([A-Z\u0900-\u097F][\p{L}\p{M}\p{N}\s,'\-\(\)\/&:–]{2,80})$/u,
  // Marathi/Hindi: १. संच, २. वास्तव संख्या, १ संच
  /^([०-९]{1,2})\s*[\.:\-–]?\s*([\p{L}\p{M}\p{N}\s,'\-\(\)\/&:–]{2,80})$/u,
  // Roman numerals: I. Sets, II. Real Numbers, I Sets
  /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\s*[\.:\-–]?\s*([A-Za-z][\w\s,'\-\(\)&:–]{2,80})$/,
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
  section?: string;
  title: string;
  tocPage: number;
}

/**
 * Searches the first 25 pages for Table of Contents / Index / अनुक्रमणिका
 * and extracts chapter listings with printed page numbers. Supports multi-page TOCs,
 * two-column layouts, and section headers (e.g. Part 1 History / Part 2 Political Science).
 */
export function extractChaptersFromTOC(pages: ExtractedPage[]): DetectedChapter[] {
  const totalPages = Math.max(1, pages.length, ...pages.map((p) => p.pageNumber));
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const frontPages = sortedPages.filter((p) => p.pageNumber <= 25);

  const tocHeaders =
    /(?:(?:table\s+of\s+)?contents|index|अनुक्रमणिका|विषय[\s\-]*सूची|पाठ्यक्रमाची\s+अनुक्रमणिका)/i;

  // Find all pages that contain TOC headers or consecutive chapter listings
  const tocPages: ExtractedPage[] = [];
  for (let i = 0; i < frontPages.length; i++) {
    const page = frontPages[i]!;
    const isTocHeader = tocHeaders.test(page.text);
    const lines = page.text.split('\n').map((l) => l.trim()).filter(Boolean);
    let matchedLines = 0;
    for (const line of lines) {
      if (
        /(?:^|\s)(?:[०-९\d]+|[ivxlcdm]+)[\s.:\-–]+.+?[\s._–\-·…]+[०-९\d]+$/iu.test(line) ||
        /^(?:chapter|unit|lesson|module|अध्याय|पाठ|प्रकरण|भाग)\s+[०-९\d]+/iu.test(line)
      ) {
        matchedLines++;
      }
    }

    if (isTocHeader || matchedLines >= 3) {
      tocPages.push(page);
    } else if (
      tocPages.length > 0 &&
      tocPages[tocPages.length - 1]!.pageNumber === page.pageNumber - 1 &&
      matchedLines >= 2
    ) {
      // Continuation TOC page
      tocPages.push(page);
    }
  }

  if (tocPages.length === 0) {
    return [];
  }

  const tocEntries: TocEntry[] = [];
  const singleLineRegex =
    /^(?:chapter|unit|lesson|module|अध्याय|पाठ|प्रकरण|भाग)?\s*([०-९\d]+|[ivxlcdm]+)[\s.:\-–]+([\p{L}\p{M}\p{N}\s,'\-\(\)\/&:–]{2,100}?)(?:[\s._–\-·…]+|\s{2,}|\s+)([०-९\d]+)$/u;
  const headingOnlyRegex =
    /^(?:chapter|unit|lesson|module|अध्याय|पाठ|प्रकरण|भाग)?\s*([०-९\d]+|[ivxlcdm]+)[\s.:\-–]+([\p{L}\p{M}\p{N}\s,'\-\(\)\/&:–]{2,100})$/u;
  const pageOnlyRegex = /^(?:p(?:age)?\.?\s*)?([०-९\d]+)$/i;
  const sectionRegex =
    /^(?:part|section|unit|भाग|इकाई|विभाग)\s*([०-९\d]+|[ivxlcdm]+)?\s*[:.\-–]?\s*([\p{L}\p{M}\p{N}\s,'\-\(\)\/&]{3,50})$/iu;
  const subjectSectionRegex =
    /^(?:history|political\s+science|geography|economics|civics|physics|chemistry|biology|science\s+part\s+[12]|math(?:ematics)?\s+part\s+[12]|इतिहास|राज्यशास्त्र|भूगोल|अर्थशास्त्र|नागरिकशास्त्र)\b/i;

  let currentSection = '';
  let sequentialOrder = 1;

  for (const tocPage of tocPages) {
    const lines = tocPage.text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (tocHeaders.test(line)) continue;
      if (/^(?:no|sr\.?\s*no|serial|page|page\s*no|पृष्ठ|अनुक्रमांक)\b/i.test(line)) continue;

      // Section header detection (e.g. "Part 1 History", "Part 2 Political Science")
      if (subjectSectionRegex.test(line) || sectionRegex.test(line)) {
        currentSection = cleanHeadingTitle(line);
        continue;
      }

      // 1. Single line match: "1. Historiography : Development in the West ....... 1"
      const singleMatch = line.match(singleLineRegex);
      if (singleMatch) {
        const parsedOrder = parseDevanagariOrArabicNumber(singleMatch[1]!) ?? sequentialOrder;
        let title = cleanHeadingTitle(singleMatch[2]!);
        const pageNum = parseDevanagariOrArabicNumber(singleMatch[3]!);

        if (
          title.length >= 2 &&
          pageNum !== null &&
          pageNum >= 1 &&
          !BOGUS_OUTLINE_REGEX.test(title)
        ) {
          if (currentSection && !title.toLowerCase().includes(currentSection.toLowerCase())) {
            title = `${currentSection}: ${title}`;
          }
          tocEntries.push({
            order: sequentialOrder++,
            section: currentSection || undefined,
            title,
            tocPage: pageNum,
          });
          continue;
        }
      }

      // 2. Multi-line match (Title on line i, page number on line i+1)
      const headMatch = line.match(headingOnlyRegex);
      if (headMatch && i + 1 < lines.length) {
        const nextLine = lines[i + 1]!;
        const pageMatch = nextLine.match(pageOnlyRegex);
        if (pageMatch) {
          const parsedOrder = parseDevanagariOrArabicNumber(headMatch[1]!) ?? sequentialOrder;
          let title = cleanHeadingTitle(headMatch[2]!);
          const pageNum = parseDevanagariOrArabicNumber(pageMatch[1]!);

          if (
            title.length >= 2 &&
            pageNum !== null &&
            pageNum >= 1 &&
            !BOGUS_OUTLINE_REGEX.test(title)
          ) {
            if (currentSection && !title.toLowerCase().includes(currentSection.toLowerCase())) {
              title = `${currentSection}: ${title}`;
            }
            tocEntries.push({
              order: sequentialOrder++,
              section: currentSection || undefined,
              title,
              tocPage: pageNum,
            });
            i++; // consume page number line
            continue;
          }
        }
      }
    }
  }

  if (tocEntries.length < 2) {
    return [];
  }

  // Deduplicate entries by tocPage
  const dedupedEntries: TocEntry[] = [];
  for (const entry of tocEntries) {
    const last = dedupedEntries[dedupedEntries.length - 1];
    if (!last || last.title !== entry.title || last.tocPage !== entry.tocPage) {
      dedupedEntries.push({ ...entry, order: dedupedEntries.length + 1 });
    }
  }

  if (dedupedEntries.length < 2) {
    return [];
  }

  // Calculate physical PDF page offset
  // In textbooks, printed page 1 usually starts at physical PDF page 7-15.
  // We locate where the first and second chapter titles appear in physical pages 5-30.
  const firstEntry = dedupedEntries[0]!;
  const secondEntry = dedupedEntries[1];
  let detectedOffset = 0;
  const lastTocPageNum = tocPages[tocPages.length - 1]!.pageNumber;

  const getCoreTitle = (entry: TocEntry) => {
    let t = entry.title;
    if (entry.section && t.startsWith(entry.section)) {
      t = t.slice(entry.section.length).replace(/^[\s:–\-]+/, '');
    }
    return t.trim().toLowerCase();
  };

  const coreFirstTitle = getCoreTitle(firstEntry);
  const firstTitleKeywords = coreFirstTitle
    .split(/[:–\-\s]+/)
    .filter((w) => w.length >= 4);

  for (const page of sortedPages) {
    if (page.pageNumber <= lastTocPageNum) continue;
    if (page.pageNumber > lastTocPageNum + 25) break;

    const textLower = page.text.toLowerCase();
    const matchesFirst =
      (firstTitleKeywords.length > 0 && firstTitleKeywords.every((kw) => textLower.includes(kw))) ||
      (coreFirstTitle.length >= 3 && textLower.includes(coreFirstTitle));

    if (matchesFirst) {
      detectedOffset = page.pageNumber - firstEntry.tocPage;
      break;
    }
  }

  // Cross-check with second entry if first entry wasn't found or offset seems invalid
  if (detectedOffset <= 0 && secondEntry) {
    const coreSecondTitle = getCoreTitle(secondEntry);
    const secondTitleKeywords = coreSecondTitle
      .split(/[:–\-\s]+/)
      .filter((w) => w.length >= 4);

    for (const page of sortedPages) {
      if (page.pageNumber <= lastTocPageNum) continue;
      if (page.pageNumber > lastTocPageNum + 35) break;

      const textLower = page.text.toLowerCase();
      const matchesSecond =
        (secondTitleKeywords.length > 0 && secondTitleKeywords.every((kw) => textLower.includes(kw))) ||
        (coreSecondTitle.length >= 3 && textLower.includes(coreSecondTitle));

      if (matchesSecond) {
        detectedOffset = page.pageNumber - secondEntry.tocPage;
        break;
      }
    }
  }

  // Fallback: estimate offset based on the last TOC page number
  if (detectedOffset <= 0) {
    detectedOffset = Math.max(0, lastTocPageNum);
  }

  const detectedChapters: DetectedChapter[] = [];
  for (let idx = 0; idx < dedupedEntries.length; idx++) {
    const entry = dedupedEntries[idx]!;
    const nextEntry = dedupedEntries[idx + 1];

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

  // 3. Tier 3: Scan body page headings (single-line & two-line patterns)
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

      // Check for standalone chapter number followed by title on next line
      const standaloneNum = line.match(
        /^(?:(?:chapter|unit|lesson|module|part|section|अध्याय|पाठ|इकाई|प्रकरण|भाग)\s+)?([०-९\d]{1,2}|[ivxlcdm]+)\.?$/i
      );
      if (standaloneNum && i + 1 < topLines.length && page.pageNumber >= 5) {
        const nextLine = topLines[i + 1]!;
        if (
          nextLine.length >= 3 &&
          nextLine.length <= 90 &&
          !BOGUS_OUTLINE_REGEX.test(nextLine) &&
          !CHAPTER_PATTERNS.some((re) => re.test(nextLine))
        ) {
          const clean = cleanHeadingTitle(`Chapter ${standaloneNum[1]}: ${nextLine}`);
          if (hits.length === 0 || hits[hits.length - 1]!.pageNumber < page.pageNumber) {
            hits.push({ pageNumber: page.pageNumber, title: clean });
          }
          break;
        }
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

  // 2. Fallback: reconstruct from existing chunks
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

  // 3. Multi-tier chapter detection
  let detected = detectChaptersFromPages(pages, outline);

  // 4. If fewer than 2 chapters detected, try Gemini AI syllabus scan with auto key
  if (detected.length < 2) {
    try {
      const { detectChaptersWithAI } = await import('./ai-chapter-service');
      const settings = await repository.settingsRepo.get();
      const aiDetected = await detectChaptersWithAI(
        pages,
        {
          bookId: book.id,
          title: book.title,
          board: book.board,
          classLevel: book.classLevel,
          subject: book.subject,
          language: book.language,
        },
        outline,
        settings
      );
      if (aiDetected && aiDetected.length >= 2) {
        detected = aiDetected;
      }
    } catch (aiErr) {
      console.warn('AI fallback in applyAutoDetectedChaptersToBook:', aiErr);
    }
  }

  const newChapters: ChapterRecord[] = detected.map((ch) => ({
    id: `${book.id}_ch_${ch.order}`,
    bookId: book.id,
    order: ch.order,
    title: ch.title,
    startPage: ch.startPage,
    endPage: ch.endPage,
    topics: ch.topics,
  }));

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
