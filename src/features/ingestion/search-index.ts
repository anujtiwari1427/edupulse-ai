import MiniSearch from 'minisearch';
import type { ChunkRecord, QuestionRecord } from '@/src/lib/zod-schemas';

export interface ChunkSearchHit {
  id: string;
  bookId: string;
  chapterId: string;
  pageNumber: number;
  text: string;
  score: number;
}

export interface QuestionSearchHit {
  id: string;
  score: number;
}

export class LocalBM25Index {
  private chunkIndex: MiniSearch<ChunkRecord>;
  private questionIndex: MiniSearch<QuestionRecord>;

  constructor() {
    this.chunkIndex = new MiniSearch<ChunkRecord>({
      fields: ['text'],
      storeFields: ['id', 'bookId', 'chapterId', 'pageNumber', 'text'],
      searchOptions: {
        boost: { text: 1 },
        fuzzy: 0.15,
        prefix: true,
      },
    });

    this.questionIndex = new MiniSearch<QuestionRecord>({
      fields: ['text', 'topic', 'answer'],
      storeFields: ['id'],
      searchOptions: {
        boost: { text: 2, topic: 1.5, answer: 1 },
        fuzzy: 0.15,
        prefix: true,
      },
    });
  }

  indexChunks(chunks: ChunkRecord[]): void {
    this.chunkIndex.removeAll();
    if (chunks.length > 0) {
      this.chunkIndex.addAll(chunks);
    }
  }

  indexQuestions(questions: QuestionRecord[]): void {
    this.questionIndex.removeAll();
    if (questions.length > 0) {
      this.questionIndex.addAll(questions);
    }
  }

  searchChunks(
    query: string,
    filter?: { bookId?: string; chapterId?: string; limit?: number }
  ): ChunkSearchHit[] {
    const clean = query.trim();
    if (!clean) return [];

    const results = this.chunkIndex.search(clean, {
      filter: (result) => {
        if (filter?.bookId && result.bookId !== filter.bookId) return false;
        if (filter?.chapterId && result.chapterId !== filter.chapterId) return false;
        return true;
      },
    });

    return results.slice(0, filter?.limit ?? 12).map((r) => ({
      id: String(r.id),
      bookId: String(r.bookId ?? ''),
      chapterId: String(r.chapterId ?? ''),
      pageNumber: Number(r.pageNumber ?? 1),
      text: String(r.text ?? ''),
      score: r.score,
    }));
  }

  searchQuestions(query: string, limit = 50): QuestionSearchHit[] {
    const clean = query.trim();
    if (!clean) return [];
    const results = this.questionIndex.search(clean);
    return results.slice(0, limit).map((r) => ({
      id: String(r.id),
      score: r.score,
    }));
  }
}

export const localSearchIndex = new LocalBM25Index();
