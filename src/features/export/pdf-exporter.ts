import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { resolvePaperForSet } from '@/src/features/generation/paper-engine';
import type { PaperRecord } from '@/src/lib/zod-schemas';

export type FontLoader = (fileName: string) => Promise<Uint8Array>;

export interface PdfExportOptions {
  setCode?: 'A' | 'B' | 'C';
  logoBytes?: Uint8Array;
  logoMimeType?: string;
  fontLoader?: FontLoader;
}

interface EmbeddedFontPair {
  latinRegular: PDFFont;
  latinBold: PDFFont;
  devaRegular: PDFFont;
  devaBold: PDFFont;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 46;
const MARGIN_TOP = 46;
const MARGIN_BOTTOM = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;

const SYMBOL_FALLBACKS: Record<string, string> = {
  '⇌': '<->',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '≈': '~',
  '×': 'x',
  '÷': '/',
  '±': '+/-',
  '²': '^2',
  '³': '^3',
  '¹': '^1',
  '⁰': '^0',
  '°': ' deg',
  Ω: 'Ohm',
  μ: 'u',
  Δ: 'Delta ',
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  θ: 'theta',
  π: 'pi',
  λ: 'lambda',
  '•': '*',
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '\u00a0': ' ',
};

const fontCache = new Map<string, Uint8Array>();

async function defaultBrowserFontLoader(fileName: string): Promise<Uint8Array> {
  const cached = fontCache.get(fileName);
  if (cached) return cached;
  const response = await fetch(`/fonts/${fileName}`);
  if (!response.ok) {
    throw new Error(
      `Failed to load PDF font asset "/fonts/${fileName}" (HTTP ${response.status}).`
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  fontCache.set(fileName, bytes);
  return bytes;
}

function isDevanagariChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x0900 && code <= 0x097f) ||
    (code >= 0xa8e0 && code <= 0xa8ff) ||
    (code >= 0x1cd0 && code <= 0x1cff)
  );
}

interface TextSegment {
  text: string;
  isDevanagari: boolean;
}

function sanitizeForFont(ch: string, font: PDFFont): string {
  try {
    font.widthOfTextAtSize(ch, 10);
    return ch;
  } catch {
    if (SYMBOL_FALLBACKS[ch]) return SYMBOL_FALLBACKS[ch]!;
    return '';
  }
}

function splitScriptSegments(input: string, latinFont: PDFFont, devaFont: PDFFont): TextSegment[] {
  const cleaned = input.replace(/\r\n/g, '\n').replace(/\t/g, '  ');
  const segments: TextSegment[] = [];
  let current = '';
  let currentDeva = false;

  for (const ch of cleaned) {
    if (ch === '\n') continue;
    const isDeva = isDevanagariChar(ch);
    const targetFont = isDeva ? devaFont : latinFont;
    const safeCh = sanitizeForFont(ch, targetFont);
    if (!safeCh) continue;

    if (current.length === 0) {
      current = safeCh;
      currentDeva = isDeva;
    } else if (isDeva === currentDeva) {
      current += safeCh;
    } else {
      segments.push({ text: current, isDevanagari: currentDeva });
      current = safeCh;
      currentDeva = isDeva;
    }
  }
  if (current.length > 0) {
    segments.push({ text: current, isDevanagari: currentDeva });
  }
  return segments;
}

function measureMixedWidth(
  text: string,
  size: number,
  bold: boolean,
  fonts: EmbeddedFontPair
): number {
  const latin = bold ? fonts.latinBold : fonts.latinRegular;
  const deva = bold ? fonts.devaBold : fonts.devaRegular;
  const segments = splitScriptSegments(text, latin, deva);
  let total = 0;
  for (const seg of segments) {
    const f = seg.isDevanagari ? deva : latin;
    try {
      total += f.widthOfTextAtSize(seg.text, size);
    } catch {
      total += seg.text.length * size * 0.5;
    }
  }
  return total;
}

function drawMixedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  bold: boolean,
  fonts: EmbeddedFontPair,
  color = rgb(0.08, 0.08, 0.08)
): void {
  const latin = bold ? fonts.latinBold : fonts.latinRegular;
  const deva = bold ? fonts.devaBold : fonts.devaRegular;
  const segments = splitScriptSegments(text, latin, deva);
  let cursorX = x;
  for (const seg of segments) {
    const f = seg.isDevanagari ? deva : latin;
    page.drawText(seg.text, {
      x: cursorX,
      y,
      size,
      font: f,
      color,
    });
    cursorX += f.widthOfTextAtSize(seg.text, size);
  }
}

function wrapMixedText(
  text: string,
  maxWidth: number,
  size: number,
  bold: boolean,
  fonts: EmbeddedFontPair
): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) {
      lines.push('');
      continue;
    }
    const words = trimmedPara.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (measureMixedWidth(candidate, size, bold, fonts) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        // Handle single very long word by character slicing
        if (measureMixedWidth(word, size, bold, fonts) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            const nextChunk = chunk + ch;
            if (measureMixedWidth(nextChunk, size, bold, fonts) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk = nextChunk;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

class PdfCursor {
  doc: PDFDocument;
  fonts: EmbeddedFontPair;
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = A4_HEIGHT - MARGIN_TOP;

  constructor(doc: PDFDocument, fonts: EmbeddedFontPair) {
    this.doc = doc;
    this.fonts = fonts;
    this.addPage();
  }

  addPage(): void {
    this.page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.pages.push(this.page);
    this.y = A4_HEIGHT - MARGIN_TOP;
  }

  ensureSpace(requiredHeight: number): void {
    if (this.y - requiredHeight < MARGIN_BOTTOM) {
      this.addPage();
    }
  }

  drawRule(thickness = 0.75, color = rgb(0.25, 0.25, 0.25)): void {
    this.ensureSpace(10);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: A4_WIDTH - MARGIN_X, y: this.y },
      thickness,
      color,
    });
    this.y -= 10;
  }

  drawCenteredLine(text: string, size: number, bold: boolean, color = rgb(0.05, 0.05, 0.05)): void {
    const lines = wrapMixedText(text, CONTENT_WIDTH, size, bold, this.fonts);
    const lineHeight = size * 1.38;
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      const w = measureMixedWidth(line, size, bold, this.fonts);
      const x = Math.max(MARGIN_X, (A4_WIDTH - w) / 2);
      drawMixedText(this.page, line, x, this.y - size, size, bold, this.fonts, color);
      this.y -= lineHeight;
    }
  }

  drawWrappedBlock(
    text: string,
    opts: {
      x?: number;
      maxWidth?: number;
      size?: number;
      bold?: boolean;
      lineGap?: number;
      color?: ReturnType<typeof rgb>;
      rightLabel?: string;
    } = {}
  ): void {
    const x = opts.x ?? MARGIN_X;
    const size = opts.size ?? 10.5;
    const bold = opts.bold ?? false;
    const maxWidth = opts.maxWidth ?? A4_WIDTH - MARGIN_X - x;
    const lineHeight = size * 1.42;
    const lines = wrapMixedText(text, maxWidth, size, bold, this.fonts);

    this.ensureSpace(lines.length * lineHeight + (opts.lineGap ?? 0));

    lines.forEach((line, idx) => {
      if (this.y - lineHeight < MARGIN_BOTTOM) {
        this.addPage();
      }
      drawMixedText(this.page, line, x, this.y - size, size, bold, this.fonts, opts.color);
      if (idx === 0 && opts.rightLabel) {
        const rw = measureMixedWidth(opts.rightLabel, size - 0.5, true, this.fonts);
        drawMixedText(
          this.page,
          opts.rightLabel,
          A4_WIDTH - MARGIN_X - rw,
          this.y - size,
          size - 0.5,
          true,
          this.fonts,
          rgb(0.15, 0.15, 0.15)
        );
      }
      this.y -= lineHeight;
    });
    if (opts.lineGap) {
      this.y -= opts.lineGap;
    }
  }

  finalizeFooters(footerPrefix: string): void {
    const total = this.pages.length;
    this.pages.forEach((p, idx) => {
      const label = `${footerPrefix}  |  Page ${idx + 1} of ${total}`;
      const w = measureMixedWidth(label, 8.5, false, this.fonts);
      drawMixedText(
        p,
        label,
        Math.max(MARGIN_X, (A4_WIDTH - w) / 2),
        24,
        8.5,
        false,
        this.fonts,
        rgb(0.35, 0.35, 0.35)
      );
    });
  }
}

async function createDocumentWithFonts(fontLoader: FontLoader): Promise<{
  doc: PDFDocument;
  fonts: EmbeddedFontPair;
}> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const [latinRegBytes, latinBoldBytes, devaRegBytes, devaBoldBytes] = await Promise.all([
    fontLoader('NotoSans-Regular.ttf'),
    fontLoader('NotoSans-Bold.ttf'),
    fontLoader('NotoSansDevanagari-Regular.ttf'),
    fontLoader('NotoSansDevanagari-Bold.ttf'),
  ]);

  const [latinRegular, latinBold, devaRegular, devaBold] = await Promise.all([
    doc.embedFont(latinRegBytes, { subset: true }),
    doc.embedFont(latinBoldBytes, { subset: true }),
    doc.embedFont(devaRegBytes, { subset: true }),
    doc.embedFont(devaBoldBytes, { subset: true }),
  ]);

  return {
    doc,
    fonts: { latinRegular, latinBold, devaRegular, devaBold },
  };
}

async function drawPaperHeaderBox(
  cursor: PdfCursor,
  paper: PaperRecord,
  setCode: 'A' | 'B' | 'C',
  subtitleTag?: string,
  logoBytes?: Uint8Array,
  logoMimeType?: string
): Promise<void> {
  const { header, totalMarks } = paper.blueprintSnapshot;

  if (logoBytes && logoBytes.length > 0) {
    try {
      const img =
        logoMimeType === 'image/png'
          ? await cursor.doc.embedPng(logoBytes)
          : await cursor.doc.embedJpg(logoBytes);
      const dims = img.scaleToFit(44, 44);
      cursor.page.drawImage(img, {
        x: MARGIN_X,
        y: cursor.y - dims.height,
        width: dims.width,
        height: dims.height,
      });
    } catch {
      // Ignore invalid logo image bytes gracefully
    }
  }

  cursor.drawCenteredLine(header.schoolName || 'QUESTION PAPER', 14, true);
  cursor.drawCenteredLine(header.examTitle, 11.5, true);
  if (subtitleTag) {
    cursor.drawCenteredLine(subtitleTag, 10, true, rgb(0.18, 0.18, 0.18));
  }

  cursor.y -= 4;
  cursor.ensureSpace(22);

  const leftMeta = `${header.board}  |  Class ${header.classLevel}  |  ${header.subject}${
    header.examDate ? `  |  Date: ${header.examDate}` : ''
  }`;
  const rightMeta = `SET ${setCode}  |  Time: ${header.durationMinutes} min  |  Max Marks: ${totalMarks}`;

  drawMixedText(cursor.page, leftMeta, MARGIN_X, cursor.y - 9.5, 9.5, true, cursor.fonts);
  const rw = measureMixedWidth(rightMeta, 9.5, true, cursor.fonts);
  drawMixedText(
    cursor.page,
    rightMeta,
    A4_WIDTH - MARGIN_X - rw,
    cursor.y - 9.5,
    9.5,
    true,
    cursor.fonts
  );
  cursor.y -= 18;
  cursor.drawRule(1.1, rgb(0.1, 0.1, 0.1));
}

export async function exportPaperPdfBytes(
  paper: PaperRecord,
  options: PdfExportOptions = {}
): Promise<Uint8Array> {
  const setCode = options.setCode ?? 'A';
  const fontLoader = options.fontLoader ?? defaultBrowserFontLoader;
  const { doc, fonts } = await createDocumentWithFonts(fontLoader);
  const cursor = new PdfCursor(doc, fonts);

  doc.setTitle(`${paper.title} - Set ${setCode}`);
  doc.setSubject(
    `${paper.blueprintSnapshot.header.board} Class ${paper.blueprintSnapshot.header.classLevel} ${paper.blueprintSnapshot.header.subject}`
  );
  doc.setCreator('EduPulse AI (Local-First)');

  await drawPaperHeaderBox(
    cursor,
    paper,
    setCode,
    undefined,
    options.logoBytes,
    options.logoMimeType
  );

  // General Instructions
  if (paper.blueprintSnapshot.header.generalInstructions.length > 0) {
    cursor.drawWrappedBlock('General Instructions:', {
      size: 10,
      bold: true,
      lineGap: 2,
    });
    paper.blueprintSnapshot.header.generalInstructions.forEach((inst, idx) => {
      cursor.drawWrappedBlock(`${idx + 1}. ${inst}`, {
        x: MARGIN_X + 10,
        size: 9.2,
        lineGap: 1.5,
        color: rgb(0.18, 0.18, 0.18),
      });
    });
    cursor.y -= 4;
    cursor.drawRule(0.6, rgb(0.45, 0.45, 0.45));
  }

  const resolvedSections = resolvePaperForSet(paper, setCode);

  for (const section of resolvedSections) {
    cursor.ensureSpace(44);
    const attemptHint =
      section.choiceRule.enabled && section.choiceRule.attemptCount && section.choiceRule.totalCount
        ? ` (Attempt any ${section.choiceRule.attemptCount} of ${section.choiceRule.totalCount})`
        : '';

    const sectionMarks =
      section.choiceRule.enabled && section.choiceRule.attemptCount
        ? section.choiceRule.attemptCount * section.marksPerQuestion
        : section.questions.filter((q) => !q.alternativeToId).length * section.marksPerQuestion;

    cursor.drawWrappedBlock(`${section.name}${attemptHint}`, {
      size: 11,
      bold: true,
      lineGap: 3,
      rightLabel: `[${sectionMarks} Marks]`,
    });

    if (section.instructions) {
      cursor.drawWrappedBlock(section.instructions, {
        size: 9.2,
        color: rgb(0.22, 0.22, 0.22),
        lineGap: 4,
      });
    }

    for (const q of section.questions) {
      if (q.alternativeToId) {
        cursor.drawCenteredLine('OR', 9.2, true, rgb(0.25, 0.25, 0.25));
      }

      const prefix = q.alternativeToId ? '    ' : `${q.displayNumber}. `;
      const questionWidth = CONTENT_WIDTH - 48;

      cursor.drawWrappedBlock(`${prefix}${q.text}`, {
        x: MARGIN_X,
        maxWidth: questionWidth,
        size: 10.2,
        lineGap: q.resolvedOptions ? 2 : 6,
        rightLabel: `[${q.marks}]`,
      });

      if (q.resolvedOptions && q.resolvedOptions.length === 4) {
        const colWidth = (CONTENT_WIDTH - 24) / 2;
        const optLabels = ['(a)', '(b)', '(c)', '(d)'];
        for (let row = 0; row < 2; row++) {
          const leftOpt = `${optLabels[row * 2]} ${q.resolvedOptions[row * 2] ?? ''}`;
          const rightOpt = `${optLabels[row * 2 + 1]} ${q.resolvedOptions[row * 2 + 1] ?? ''}`;
          const leftLines = wrapMixedText(leftOpt, colWidth - 8, 9.5, false, fonts);
          const rightLines = wrapMixedText(rightOpt, colWidth - 8, 9.5, false, fonts);
          const maxRows = Math.max(leftLines.length, rightLines.length);

          cursor.ensureSpace(maxRows * 13 + 2);
          for (let li = 0; li < maxRows; li++) {
            const lText = leftLines[li];
            const rText = rightLines[li];
            if (lText) {
              drawMixedText(cursor.page, lText, MARGIN_X + 18, cursor.y - 9.5, 9.5, false, fonts);
            }
            if (rText) {
              drawMixedText(
                cursor.page,
                rText,
                MARGIN_X + 18 + colWidth,
                cursor.y - 9.5,
                9.5,
                false,
                fonts
              );
            }
            cursor.y -= 13;
          }
        }
        cursor.y -= 5;
      }
    }

    cursor.y -= 6;
  }

  cursor.finalizeFooters(`${paper.blueprintSnapshot.header.subject} · Set ${setCode}`);
  return doc.save();
}

export async function exportAnswerKeyPdfBytes(
  paper: PaperRecord,
  options: PdfExportOptions = {}
): Promise<Uint8Array> {
  const setCode = options.setCode ?? 'A';
  const fontLoader = options.fontLoader ?? defaultBrowserFontLoader;
  const { doc, fonts } = await createDocumentWithFonts(fontLoader);
  const cursor = new PdfCursor(doc, fonts);

  doc.setTitle(`${paper.title} - Answer Key (Set ${setCode})`);
  doc.setCreator('EduPulse AI (Local-First)');

  await drawPaperHeaderBox(
    cursor,
    paper,
    setCode,
    `ANSWER KEY & MARKING SCHEME — SET ${setCode}`,
    options.logoBytes,
    options.logoMimeType
  );

  const resolvedSections = resolvePaperForSet(paper, setCode);

  for (const section of resolvedSections) {
    cursor.ensureSpace(36);
    cursor.drawWrappedBlock(section.name, {
      size: 11,
      bold: true,
      lineGap: 4,
    });

    for (const q of section.questions) {
      const qLabel = q.alternativeToId ? `Q${q.displayNumber} (OR)` : `Q${q.displayNumber}`;
      const answerDisplay = q.resolvedAnswerLabel ?? q.answer;

      cursor.drawWrappedBlock(`${qLabel}. Answer: ${answerDisplay}`, {
        x: MARGIN_X,
        maxWidth: CONTENT_WIDTH - 48,
        size: 10,
        bold: true,
        lineGap: 2,
        rightLabel: `[${q.marks}m]`,
      });

      if (q.markingScheme) {
        cursor.drawWrappedBlock(`Marking Scheme / Value Points: ${q.markingScheme}`, {
          x: MARGIN_X + 14,
          maxWidth: CONTENT_WIDTH - 24,
          size: 9.2,
          color: rgb(0.2, 0.2, 0.2),
          lineGap: 2,
        });
      }

      cursor.drawWrappedBlock(
        `Topic: ${q.topic}  |  Difficulty: ${q.difficulty}  |  Bloom: ${q.bloom}`,
        {
          x: MARGIN_X + 14,
          maxWidth: CONTENT_WIDTH - 24,
          size: 8.5,
          color: rgb(0.38, 0.38, 0.38),
          lineGap: 6,
        }
      );
    }

    cursor.y -= 4;
  }

  cursor.finalizeFooters(`Answer Key & Marking Scheme · Set ${setCode}`);
  return doc.save();
}
