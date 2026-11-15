import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import type { LanguageCode } from '@/src/lib/zod-schemas';
import type { ExtractedPage } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const TESSERACT_LANG_MAP: Record<LanguageCode, string> = {
  en: 'eng',
  hi: 'eng+hin',
  mr: 'eng+mar',
};

export interface OcrProgressEvent {
  current: number;
  total: number;
  pageNumber: number;
}

export async function ocrScannedPdfPages(
  pdfBuffer: ArrayBuffer,
  pages: ExtractedPage[],
  language: LanguageCode,
  options?: {
    signal?: AbortSignal;
    onProgress?: (evt: OcrProgressEvent) => void;
    onPageComplete?: (updatedPage: ExtractedPage) => Promise<void>;
  }
): Promise<ExtractedPage[]> {
  const targetPages = pages.filter((p) => p.needsOcr && !p.ocrApplied);
  if (targetPages.length === 0) return pages;

  try {
    const langCode = TESSERACT_LANG_MAP[language] || 'eng';
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });

    // 12s timeout for PDF document loading
    const pdfPromise = loadingTask.promise;
    const pdf = await Promise.race([
      pdfPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF loading timeout')), 12000)
      ),
    ]);

    // 15s timeout for Tesseract worker creation
    const workerPromise = createWorker(langCode);
    const ocrWorker = await Promise.race([
      workerPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR worker init timeout')), 15000)
      ),
    ]);

    try {
      const updatedMap = new Map(pages.map((p) => [p.pageNumber, p]));
      let processed = 0;

      for (const target of targetPages) {
        if (options?.signal?.aborted) {
          throw new DOMException('OCR cancelled', 'AbortError');
        }

        try {
          const page = await pdf.getPage(target.pageNumber);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          await page.render({ canvas, canvasContext: ctx, viewport }).promise;

          // Per-page OCR recognition timeout: 10 seconds
          const recognizePromise = ocrWorker.recognize(canvas);
          const result = await Promise.race([
            recognizePromise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Page OCR timeout')), 10000)
            ),
          ]);
          const ocrText = result.data.text.trim();

          const mergedPage: ExtractedPage = {
            ...target,
            text: ocrText || target.text,
            ocrApplied: true,
            needsOcr: false,
          };
          updatedMap.set(target.pageNumber, mergedPage);
          processed += 1;

          options?.onProgress?.({
            current: processed,
            total: targetPages.length,
            pageNumber: target.pageNumber,
          });

          if (options?.onPageComplete) {
            await options.onPageComplete(mergedPage);
          }
        } catch (pageErr) {
          console.warn(`OCR skipped for page ${target.pageNumber}:`, pageErr);
          processed += 1;
        }
      }

      return Array.from(updatedMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);
    } finally {
      await ocrWorker.terminate().catch(() => {});
      await loadingTask.destroy().catch(() => {});
    }
  } catch (err) {
    console.warn('OCR service unavailable or timed out, continuing with extracted PDF text:', err);
    // Mark target pages as not needing OCR so they don't block
    return pages.map((p) => ({ ...p, needsOcr: false }));
  }
}

export async function ocrImageFile(
  file: File,
  language: LanguageCode
): Promise<ExtractedPage[]> {
  const langCode = TESSERACT_LANG_MAP[language];
  const ocrWorker = await createWorker(langCode);
  try {
    const result = await ocrWorker.recognize(file);
    return [
      {
        pageNumber: 1,
        text: result.data.text.trim(),
        ocrApplied: true,
        needsOcr: false,
      },
    ];
  } finally {
    await ocrWorker.terminate();
  }
}
