import * as Comlink from 'comlink';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { extractEpubPages } from '@/src/features/ingestion/epub-parser';
import type { ExtractedPage, OutlineItem } from '@/src/features/ingestion/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PdfBatchResult {
  totalPages: number;
  pages: ExtractedPage[];
  outline: OutlineItem[];
}

interface PdfOutlineNode {
  title?: string;
  dest?: unknown;
  items?: PdfOutlineNode[];
}

async function resolveOutline(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<OutlineItem[]> {
  try {
    const rawOutline = (await pdf.getOutline()) as PdfOutlineNode[] | null;
    if (!rawOutline || rawOutline.length === 0) return [];

    const items: OutlineItem[] = [];
    for (const node of rawOutline) {
      if (!node.title) continue;
      let pageNumber = 1;
      try {
        let dest = node.dest;
        if (typeof dest === 'string') {
          dest = await pdf.getDestination(dest);
        }
        if (Array.isArray(dest) && dest[0]) {
          const pageIndex = await pdf.getPageIndex(dest[0] as never);
          pageNumber = pageIndex + 1;
        }
      } catch {
        continue;
      }
      items.push({ title: node.title.trim(), pageNumber });
    }
    return items;
  } catch {
    return [];
  }
}

const workerApi = {
  async parsePdfPageBatch(
    buffer: ArrayBuffer,
    startPage: number,
    endPage: number,
    includeOutline: boolean
  ): Promise<PdfBatchResult> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    try {
      const totalPages = pdf.numPages;
      const clampedStart = Math.max(1, startPage);
      const clampedEnd = Math.min(totalPages, endPage);
      const outline = includeOutline ? await resolveOutline(pdf) : [];
      const pages: ExtractedPage[] = [];

      for (let p = clampedStart; p <= clampedEnd; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const textItems = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/[ \t]+/g, ' ')
          .trim();

        const compactLen = textItems.replace(/\s+/g, '').length;
        pages.push({
          pageNumber: p,
          text: textItems,
          needsOcr: compactLen < 35,
        });
      }

      return { totalPages, pages, outline };
    } finally {
      await loadingTask.destroy();
    }
  },

  async parseDocx(buffer: ArrayBuffer): Promise<ExtractedPage[]> {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = result.value.replace(/\r\n/g, '\n').trim();
    if (!text) return [];

    // Split DOCX into ~1800 character logical pages
    const paragraphs = text.split(/\n{2,}/);
    const pages: ExtractedPage[] = [];
    let buf = '';
    let pageNum = 1;

    for (const para of paragraphs) {
      if (buf.length > 0 && buf.length + para.length > 1800) {
        pages.push({ pageNumber: pageNum, text: buf.trim() });
        pageNum += 1;
        buf = para;
      } else {
        buf = buf ? `${buf}\n\n${para}` : para;
      }
    }
    if (buf.trim()) {
      pages.push({ pageNumber: pageNum, text: buf.trim() });
    }
    return pages;
  },

  async parseEpub(buffer: ArrayBuffer): Promise<ExtractedPage[]> {
    return extractEpubPages(buffer);
  },
};

export type IngestionWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
