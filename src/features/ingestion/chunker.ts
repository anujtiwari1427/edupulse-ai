import type { ChapterRecord, ChunkRecord, LanguageCode } from '@/src/lib/zod-schemas';
import type { ExtractedPage } from './types';

export interface ChunkingOptions {
  bookId: string;
  language: LanguageCode;
  minTokens?: number;
  targetTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/).filter(Boolean);
  // Devanagari & academic terms average ~1.35 tokens per whitespace word
  const devanagariChars = (trimmed.match(/[\u0900-\u097F]/g) ?? []).length;
  const extraDevanagari = Math.round(devanagariChars * 0.12);
  return Math.max(1, Math.round(words.length * 1.3) + extraDevanagari);
}

function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  const rawParts = normalized.split(/(?<=[.!?।॥\n])\s+/);
  return rawParts.map((s) => s.trim()).filter(Boolean);
}

function findChapterForPage(chapters: ChapterRecord[], pageNumber: number): ChapterRecord | undefined {
  const exact = chapters.find((ch) => pageNumber >= ch.startPage && pageNumber <= ch.endPage);
  if (exact) return exact;
  return chapters[0];
}

export function chunkPages(
  pages: ExtractedPage[],
  chapters: ChapterRecord[],
  options: ChunkingOptions
): ChunkRecord[] {
  const minTokens = options.minTokens ?? 500;
  const targetTokens = options.targetTokens ?? 650;
  const maxTokens = options.maxTokens ?? 800;
  const overlapTokens = options.overlapTokens ?? 80;

  if (pages.length === 0 || chapters.length === 0) return [];

  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const chunks: ChunkRecord[] = [];
  let globalChunkIndex = 0;

  // Group pages by chapter so chunks never straddle chapter boundaries
  const pagesByChapter = new Map<string, ExtractedPage[]>();
  for (const ch of chapters) {
    pagesByChapter.set(ch.id, []);
  }
  for (const page of sortedPages) {
    if (!page.text.trim()) continue;
    const ch = findChapterForPage(chapters, page.pageNumber);
    if (!ch) continue;
    const list = pagesByChapter.get(ch.id) ?? [];
    list.push(page);
    pagesByChapter.set(ch.id, list);
  }

  for (const chapter of chapters) {
    const chapterPages = pagesByChapter.get(chapter.id) ?? [];
    if (chapterPages.length === 0) continue;

    interface SentenceUnit {
      text: string;
      tokens: number;
      pageNumber: number;
    }

    const units: SentenceUnit[] = [];
    for (const p of chapterPages) {
      const sentences = splitIntoSentences(p.text);
      for (const sentence of sentences) {
        const tokens = estimateTokens(sentence);
        if (tokens <= maxTokens) {
          units.push({ text: sentence, tokens, pageNumber: p.pageNumber });
        } else {
          // Split unusually long single sentence / OCR block by words
          const words = sentence.split(/\s+/);
          let buf: string[] = [];
          for (const word of words) {
            buf.push(word);
            if (estimateTokens(buf.join(' ')) >= targetTokens) {
              const part = buf.join(' ');
              units.push({ text: part, tokens: estimateTokens(part), pageNumber: p.pageNumber });
              buf = [];
            }
          }
          if (buf.length > 0) {
            const part = buf.join(' ');
            units.push({ text: part, tokens: estimateTokens(part), pageNumber: p.pageNumber });
          }
        }
      }
    }

    let cursor = 0;
    while (cursor < units.length) {
      const selected: SentenceUnit[] = [];
      let runningTokens = 0;

      while (cursor < units.length) {
        const next = units[cursor]!;
        if (runningTokens > 0 && runningTokens + next.tokens > maxTokens) {
          break;
        }
        selected.push(next);
        runningTokens += next.tokens;
        cursor += 1;
        if (runningTokens >= targetTokens && runningTokens >= minTokens) {
          break;
        }
      }

      if (selected.length === 0) break;

      const chunkText = selected.map((u) => u.text).join(' ').trim();
      const firstPage = selected[0]!.pageNumber;

      chunks.push({
        id: `${options.bookId}_chk_${globalChunkIndex}`,
        bookId: options.bookId,
        chapterId: chapter.id,
        pageNumber: firstPage,
        chunkIndex: globalChunkIndex,
        text: chunkText,
        tokenEstimate: estimateTokens(chunkText),
        language: options.language,
      });
      globalChunkIndex += 1;

      if (cursor >= units.length) break;

      // Rewind cursor slightly for overlap within the same chapter
      let overlapAccum = 0;
      let rewindCount = 0;
      for (let i = selected.length - 1; i >= 1; i--) {
        const unit = selected[i]!;
        if (overlapAccum + unit.tokens > overlapTokens) break;
        overlapAccum += unit.tokens;
        rewindCount += 1;
      }
      if (rewindCount > 0) {
        cursor -= rewindCount;
      }
    }
  }

  return chunks;
}
