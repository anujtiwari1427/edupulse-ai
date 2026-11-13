import { z } from 'zod';
import {
  BloomSchema,
  DifficultySchema,
  QuestionSchema,
  QuestionTypeSchema,
  type BloomLevel,
  type ChapterRecord,
  type DifficultyLevel,
  type LanguageCode,
  type QuestionRecord,
  type QuestionType,
} from '@/src/lib/zod-schemas';
import { generateId, normalizeQuestionText, sha256Hex } from '@/src/lib/utils';

export interface ParseBankOptions {
  bookId?: string;
  chapterId?: string;
  defaultMarks?: number;
  language?: LanguageCode;
  chapters?: ChapterRecord[];
  existingQuestions?: QuestionRecord[];
}

export interface ParseBankResult {
  parsed: QuestionRecord[];
  duplicatesSkipped: number;
  warnings: string[];
}

export function fuzzyTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeQuestionText(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeQuestionText(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function inferBloomLevel(text: string): BloomLevel {
  const lower = text.toLowerCase();
  if (/\b(design|formulate|propose|construct|create|devise)\b/.test(lower)) return 'create';
  if (/\b(evaluate|justify|critique|assess|judge|verify)\b/.test(lower)) return 'evaluate';
  if (/\b(analyze|analyse|compare|contrast|differentiate|distinguish|assertion|reason)\b/.test(lower))
    return 'analyze';
  if (/\b(calculate|solve|balance|compute|derive|apply|draw|find the value)\b/.test(lower))
    return 'apply';
  if (/\b(explain|describe|why|how|interpret|summarize|illustrate)\b/.test(lower))
    return 'understand';
  return 'remember';
}

export function inferDifficulty(text: string, type: QuestionType, marks: number): DifficultyLevel {
  const lower = text.toLowerCase();
  if (
    marks >= 4 ||
    type === 'long' ||
    type === 'case_study' ||
    /\b(derive|justify|prove|assertion|case study|evaluate)\b/.test(lower)
  ) {
    return 'hard';
  }
  if (
    marks >= 2 ||
    type === 'short' ||
    type === 'assertion_reason' ||
    /\b(explain|compare|differentiate|balance|calculate)\b/.test(lower)
  ) {
    return 'medium';
  }
  return 'easy';
}

function inferTypeFromContent(
  text: string,
  options: string[] | undefined,
  marks: number
): QuestionType {
  const lower = text.toLowerCase();
  if (/assertion\s*\(a\)/i.test(text) && /reason\s*\(r\)/i.test(text)) {
    return 'assertion_reason';
  }
  if (options && options.length === 4) return 'mcq';
  if (/_{3,}|\bfill in the blank\b/i.test(text)) return 'fill_blank';
  if (/\b(true\s*\/\s*false|true or false|state whether true)\b/i.test(lower)) return 'true_false';
  if (marks <= 2) return 'very_short';
  if (marks <= 3) return 'short';
  return 'long';
}

function extractMarksFromText(block: string, fallbackMarks: number): { cleaned: string; marks: number } {
  const markRegex = /(?:\(|\[)\s*(\d+(?:\.\d+)?)\s*(?:marks?|m|गुण)\s*(?:\)|\])/i;
  const match = block.match(markRegex);
  if (match?.[1]) {
    const val = Number(match[1]);
    if (Number.isFinite(val) && val >= 0.5 && val <= 100) {
      return {
        cleaned: block.replace(markRegex, '').trim(),
        marks: val,
      };
    }
  }
  return { cleaned: block, marks: fallbackMarks };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

const RawJsonQuestionSchema = z.object({
  text: z.string().min(3),
  type: QuestionTypeSchema.optional(),
  options: z.array(z.string()).length(4).optional(),
  answer: z.string().min(1).optional(),
  markingScheme: z.string().optional(),
  marks: z.number().min(0.5).max(100).optional(),
  difficulty: DifficultySchema.optional(),
  bloom: BloomSchema.optional(),
  topic: z.string().optional(),
  sourcePage: z.number().int().min(1).optional(),
});

export async function parseQuestionBankText(
  rawText: string,
  options: ParseBankOptions = {}
): Promise<ParseBankResult> {
  const now = Date.now();
  const language: LanguageCode = options.language ?? 'en';
  const defaultMarks = options.defaultMarks ?? 1;
  const existing = options.existingQuestions ?? [];
  const existingHashes = new Set(existing.map((q) => q.hash));
  const seenTexts: string[] = existing.map((q) => q.text);
  const warnings: string[] = [];

  const candidates: Array<{
    text: string;
    type?: QuestionType;
    options?: string[];
    answer?: string;
    markingScheme?: string;
    marks?: number;
    difficulty?: DifficultyLevel;
    bloom?: BloomLevel;
    topic?: string;
    sourcePage?: number;
  }> = [];

  const trimmed = rawText.trim();

  // 1. JSON array import
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsedJson: unknown = JSON.parse(trimmed);
      const list = Array.isArray(parsedJson)
        ? parsedJson
        : typeof parsedJson === 'object' &&
            parsedJson !== null &&
            'questions' in parsedJson &&
            Array.isArray((parsedJson as { questions: unknown }).questions)
          ? (parsedJson as { questions: unknown[] }).questions
          : [];
      for (const item of list) {
        const checked = RawJsonQuestionSchema.safeParse(item);
        if (checked.success) {
          candidates.push(checked.data);
        }
      }
    } catch {
      warnings.push('Input started like JSON but could not be parsed as JSON; falling back to text parser.');
    }
  }

  // 2. CSV import (header starts with question/text)
  if (candidates.length === 0 && /^(?:question|text)\s*,/im.test(trimmed)) {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length >= 2) {
      const headers = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
      const idxText = headers.findIndex((h) => h === 'question' || h === 'text');
      const idxType = headers.findIndex((h) => h === 'type');
      const idxMarks = headers.findIndex((h) => h === 'marks');
      const idxOptions = headers.findIndex((h) => h === 'options');
      const idxAnswer = headers.findIndex((h) => h === 'answer');
      const idxDifficulty = headers.findIndex((h) => h === 'difficulty');
      const idxBloom = headers.findIndex((h) => h === 'bloom');
      const idxTopic = headers.findIndex((h) => h === 'topic');

      for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]!);
        const qText = idxText >= 0 ? cols[idxText] : undefined;
        if (!qText || qText.length < 3) continue;

        const rawOpts = idxOptions >= 0 ? cols[idxOptions] : undefined;
        const splitOpts = rawOpts
          ? rawOpts
              .split(/[|;]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
        const validOpts = splitOpts && splitOpts.length === 4 ? splitOpts : undefined;

        const parsedMarks = idxMarks >= 0 ? Number(cols[idxMarks]) : NaN;
        const parsedType =
          idxType >= 0 ? QuestionTypeSchema.safeParse(cols[idxType]?.toLowerCase()) : null;
        const parsedDiff =
          idxDifficulty >= 0
            ? DifficultySchema.safeParse(cols[idxDifficulty]?.toLowerCase())
            : null;
        const parsedBloom =
          idxBloom >= 0 ? BloomSchema.safeParse(cols[idxBloom]?.toLowerCase()) : null;

        candidates.push({
          text: qText,
          type: parsedType?.success ? parsedType.data : undefined,
          options: validOpts,
          answer: idxAnswer >= 0 ? cols[idxAnswer] || undefined : undefined,
          marks: Number.isFinite(parsedMarks) && parsedMarks >= 0.5 ? parsedMarks : undefined,
          difficulty: parsedDiff?.success ? parsedDiff.data : undefined,
          bloom: parsedBloom?.success ? parsedBloom.data : undefined,
          topic: idxTopic >= 0 ? cols[idxTopic] || undefined : undefined,
        });
      }
    }
  }

  // 3. Unstructured / PYQ numbered question bank text
  if (candidates.length === 0) {
    const blocks = trimmed
      .split(/\n(?=(?:Q\.?\s*\d+|\d+[.)]\s+|प्र\.?\s*[०-९\d]+))/i)
      .map((b) => b.trim())
      .filter((b) => b.length > 8);

    for (const rawBlock of blocks) {
      const withoutPrefix = rawBlock
        .replace(/^(?:Q\.?\s*\d+[.:)]?\s*|\d+[.)]\s+|प्र\.?\s*[०-९\d]+[.:)]?\s*)/i, '')
        .trim();

      const { cleaned: blockNoMarks, marks } = extractMarksFromText(withoutPrefix, defaultMarks);

      // Extract answer line if present
      let answer: string | undefined;
      let markingScheme: string | undefined;
      let stemAndOpts = blockNoMarks;

      const ansMatch = blockNoMarks.match(/(?:^|\n)\s*(?:Ans(?:wer)?|उत्तर)\s*[:.-]\s*([\s\S]+)$/i);
      if (ansMatch?.[1]) {
        const ansPart = ansMatch[1].trim();
        const msMatch = ansPart.match(/(?:^|\n)\s*Marking Scheme\s*[:.-]\s*([\s\S]+)$/i);
        if (msMatch?.[1]) {
          markingScheme = msMatch[1].trim();
          answer = ansPart.slice(0, msMatch.index).trim();
        } else {
          answer = ansPart;
        }
        stemAndOpts = blockNoMarks.slice(0, ansMatch.index).trim();
      }

      // Extract 4 MCQ options (a)/(b)/(c)/(d) or A./B./C./D.
      const optionMatches = Array.from(
        stemAndOpts.matchAll(/(?:^|\s|\n)(?:\(([a-dA-D1-4])\)|([a-dA-D])[.)])\s+([^\n(]+)/g)
      );

      let parsedOptions: string[] | undefined;
      let stemText = stemAndOpts;

      if (optionMatches.length >= 4) {
        const firstFour = optionMatches.slice(0, 4);
        parsedOptions = firstFour.map((m) => (m[3] ?? '').trim());
        const firstOptIdx = firstFour[0]!.index ?? stemAndOpts.length;
        stemText = stemAndOpts.slice(0, firstOptIdx).trim();

        // If answer is a single option letter like "b" or "(b)", resolve to option text
        if (answer) {
          const letterMatch = answer.match(/^\(?([a-dA-D])\)?$/);
          if (letterMatch?.[1]) {
            const optIdx = letterMatch[1].toLowerCase().charCodeAt(0) - 97;
            if (parsedOptions[optIdx]) {
              answer = parsedOptions[optIdx];
            }
          }
        }
      }

      if (stemText.length >= 5) {
        candidates.push({
          text: stemText,
          options: parsedOptions,
          answer,
          markingScheme,
          marks,
        });
      }
    }
  }

  const parsed: QuestionRecord[] = [];
  let duplicatesSkipped = 0;

  for (const item of candidates) {
    const hash = await sha256Hex(normalizeQuestionText(item.text));
    if (existingHashes.has(hash)) {
      duplicatesSkipped += 1;
      continue;
    }

    const isFuzzyDup = seenTexts.some((prev) => fuzzyTokenSimilarity(prev, item.text) >= 0.85);
    if (isFuzzyDup) {
      duplicatesSkipped += 1;
      continue;
    }

    const marks = item.marks ?? defaultMarks;
    const type = item.type ?? inferTypeFromContent(item.text, item.options, marks);
    const bloom = item.bloom ?? inferBloomLevel(item.text);
    const difficulty = item.difficulty ?? inferDifficulty(item.text, type, marks);
    const matchedChapter = options.chapters?.[0];

    const record = QuestionSchema.parse({
      id: generateId('q'),
      bookId: options.bookId,
      chapterId: options.chapterId ?? matchedChapter?.id,
      type,
      text: item.text.trim(),
      options: type === 'mcq' || type === 'assertion_reason' ? item.options : undefined,
      answer: item.answer?.trim() || 'Refer to textbook / teacher answer key.',
      markingScheme: item.markingScheme,
      marks,
      difficulty,
      bloom,
      topic: item.topic?.trim() || matchedChapter?.title || 'General',
      sourcePage: item.sourcePage,
      origin: 'bank',
      language,
      hash,
      createdAt: now,
      updatedAt: now,
    });

    existingHashes.add(hash);
    seenTexts.push(record.text);
    parsed.push(record);
  }

  return { parsed, duplicatesSkipped, warnings };
}
