import type { BoardType, LanguageCode } from '@/src/lib/zod-schemas';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  needsOcr?: boolean;
  ocrApplied?: boolean;
}

export interface OutlineItem {
  title: string;
  pageNumber: number;
}

export interface DetectedChapter {
  order: number;
  title: string;
  startPage: number;
  endPage: number;
  topics: string[];
}

export interface IngestCheckpoint {
  bookId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sourceType: 'textbook' | 'question_bank';
  board: BoardType;
  classLevel: number;
  subject: string;
  language: LanguageCode;
  ocrEnabled: boolean;
  aiChapterDetection?: boolean;
  totalPages: number;
  lastProcessedPage: number;
  stage: 'parsing' | 'ocr' | 'chunking' | 'parsing_bank' | 'done';
  pages: ExtractedPage[];
  outline: OutlineItem[];
}
