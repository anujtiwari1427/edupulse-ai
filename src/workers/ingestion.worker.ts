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

function extractStructuredPageText(content: { items: any[] }): string {
  let text = '';
  let lastY: number | null = null;
  let lastHeight: number | null = null;

  for (const item of content.items) {
    if (!('str' in item)) continue;
    const str: string = item.str;
    if (!str && !item.hasEOL) continue;

    const currentY = Array.isArray(item.transform) ? item.transform[5] : undefined;
    const fontHeight =
      typeof item.height === 'number' && item.height > 0 ? item.height : (lastHeight ?? 10);

    const yDelta = lastY !== null && currentY !== undefined ? Math.abs(currentY - lastY) : 0;
    const isDoubleNewLine =
      lastY !== null && currentY !== undefined && yDelta > Math.max(fontHeight * 1.5, 12);
    const isNewLine =
      Boolean(item.hasEOL) ||
      (lastY !== null && currentY !== undefined && yDelta > Math.min(fontHeight * 0.35, 4));

    if (isDoubleNewLine) {
      if (text.length > 0 && !text.endsWith('\n\n')) {
        text += text.endsWith('\n') ? '\n' : '\n\n';
      }
    } else if (isNewLine) {
      if (text.length > 0 && !text.endsWith('\n')) {
        text += '\n';
      }
    } else if (
      text.length > 0 &&
      !text.endsWith('\n') &&
      !text.endsWith(' ') &&
      !str.startsWith(' ')
    ) {
      text += ' ';
    }

    text += str;
    if (currentY !== undefined) lastY = currentY;
    lastHeight = fontHeight;
  }

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
        const structuredText = extractStructuredPageText(content);
        const compactLen = structuredText.replace(/\s+/g, '').length;
        pages.push({
          pageNumber: p,
          text: structuredText,
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
