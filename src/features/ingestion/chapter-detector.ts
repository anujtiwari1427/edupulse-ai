import type { ChapterRecord, ChunkRecord } from '@/src/lib/zod-schemas';
import type { DetectedChapter, ExtractedPage, OutlineItem } from './types';

const CHAPTER_PATTERNS = [
  /^(?:chapter|unit|lesson|module)\s+(\d+|[ivxlcdm]+)\s*[:.\-–]?\s*(.*)$/i,
  /^(?:अध्याय|पाठ|इकाई|प्रकरण)\s*([०-९\d]+)\s*[:.\-–]?\s*(.*)$/,
];

const TOPIC_HINT_PATTERNS = [
  /^(?:\d+\.\d+)\s+([A-Z][\w\s,'-]{3,60})$/,
  /^(?:exercise|practice|summary|key points)\s*[:.-]?\s*(.*)$/i,
];

function cleanHeadingTitle(line: string): string {
  return line.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function detectChaptersFromPages(
  pages: ExtractedPage[],
  outline: OutlineItem[] = []
): DetectedChapter[] {
  const totalPages = Math.max(1, pages.length);

  if (outline.length > 0) {
    const validOutline = outline
      .filter((o) => o.pageNumber >= 1 && o.pageNumber <= totalPages && o.title.trim().length > 0)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    // Deduplicate entries pointing to the same start page
    const deduped: OutlineItem[] = [];
    for (const item of validOutline) {
      if (deduped.length === 0 || deduped[deduped.length - 1]!.pageNumber < item.pageNumber) {
        deduped.push(item);
      }
    }

    if (deduped.length > 0) {
      return deduped.map((item, idx) => {
        const next = deduped[idx + 1];
        const startPage = idx === 0 ? 1 : item.pageNumber;
        const endPage = next ? Math.max(startPage, next.pageNumber - 1) : totalPages;
        return {
          order: idx + 1,
          title: cleanHeadingTitle(item.title),
          startPage,
          endPage,
          topics: [],
        };
      });
    }
  }

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
      .slice(0, 8);

    for (let i = 0; i < topLines.length; i++) {
      const line = topLines[i]!;
      const matched = CHAPTER_PATTERNS.some((re) => re.test(line));
      if (matched && line.length <= 120) {
        let title = line;
        const nextLine = topLines[i + 1];
        if (
          title.length < 18 &&
          nextLine &&
          nextLine.length <= 90 &&
          !CHAPTER_PATTERNS.some((re) => re.test(nextLine))
        ) {
          title = `${title}: ${nextLine}`;
        }
        if (hits.length === 0 || hits[hits.length - 1]!.pageNumber < page.pageNumber) {
          hits.push({ pageNumber: page.pageNumber, title: cleanHeadingTitle(title) });
        }
        break;
      }
    }
  }

  if (hits.length === 0) {
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

  const chapters: DetectedChapter[] = hits.map((hit, idx) => {
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

  return chapters;
}

function extractTopicsFromPages(
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
          topics.add(m[1].trim());
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

export function mergeChapters(
  chapters: ChapterRecord[],
  chapterId: string,
  direction: 'next' | 'prev'
): ChapterRecord[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.id === chapterId);
  if (idx === -1) return chapters;

  const targetIdx = direction === 'next' ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= sorted.length) return chapters;

  const firstIdx = Math.min(idx, targetIdx);
  const secondIdx = Math.max(idx, targetIdx);
  const first = sorted[firstIdx]!;
  const second = sorted[secondIdx]!;

  const merged: ChapterRecord = {
    ...first,
    endPage: Math.max(first.endPage, second.endPage),
    topics: Array.from(new Set([...first.topics, ...second.topics])),
  };

  const result = [...sorted.slice(0, firstIdx), merged, ...sorted.slice(secondIdx + 1)];
  return result.map((ch, orderIdx) => ({ ...ch, order: orderIdx + 1 }));
}

export function splitChapterAtPage(
  chapters: ChapterRecord[],
  chapterId: string,
  splitPage: number,
  newTitle?: string
): ChapterRecord[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.id === chapterId);
  if (idx === -1) return chapters;

  const target = sorted[idx]!;
  if (splitPage <= target.startPage || splitPage > target.endPage) {
    return chapters;
  }

  const firstHalf: ChapterRecord = {
    ...target,
    endPage: splitPage - 1,
  };
  const secondHalf: ChapterRecord = {
    id: `${target.bookId}_ch_${Date.now().toString(36)}_${idx + 1}`,
    bookId: target.bookId,
    order: target.order + 1,
    title: newTitle?.trim() || `${target.title} (Part 2)`,
    startPage: splitPage,
    endPage: target.endPage,
    topics: [],
  };

  const result = [...sorted.slice(0, idx), firstHalf, secondHalf, ...sorted.slice(idx + 1)];
  return result.map((ch, orderIdx) => ({ ...ch, order: orderIdx + 1 }));
}

export function updateChapterRange(
  chapters: ChapterRecord[],
  chapterId: string,
  startPage: number,
  endPage: number
): ChapterRecord[] {
  const validStart = Math.max(1, Math.floor(startPage));
  const validEnd = Math.max(validStart, Math.floor(endPage));
  return chapters.map((ch) =>
    ch.id === chapterId ? { ...ch, startPage: validStart, endPage: validEnd } : ch
  );
}

export function reassignChunksToChapters(
  chunks: ChunkRecord[],
  chapters: ChapterRecord[]
): ChunkRecord[] {
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  if (sortedChapters.length === 0) return chunks;

  return chunks.map((chunk) => {
    const match = sortedChapters.find(
      (ch) => chunk.pageNumber >= ch.startPage && chunk.pageNumber <= ch.endPage
    );
    return {
      ...chunk,
      chapterId: match ? match.id : sortedChapters[0]!.id,
    };
  });
}
