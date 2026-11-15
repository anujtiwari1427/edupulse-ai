import { z } from 'zod';
import {
  getSectionGeneratedCount,
} from '@/src/features/blueprint/blueprint-engine';
import { fuzzyTokenSimilarity } from '@/src/features/ingestion/question-parser';
import { LocalBM25Index } from '@/src/features/ingestion/search-index';
import { generateId, normalizeQuestionText, sha256Hex } from '@/src/lib/utils';
import {
  BloomSchema,
  DifficultySchema,
  type BlueprintRecord,
  type BlueprintSection,
  type ChapterRecord,
  type ChunkRecord,
  type DifficultyLevel,
  type LanguageCode,
  type PaperQuestion,
  type PaperRecord,
  type PaperSection,
  type PaperSet,
  type QuestionRecord,
  type QuestionType,
} from '@/src/lib/zod-schemas';

export const AIQuestionItemSchema = z.object({
  text: z.string().min(4),
  options: z.array(z.string().min(1)).length(4).optional(),
  answer: z.string().min(1),
  markingScheme: z.string().optional(),
  difficulty: DifficultySchema.default('medium'),
  bloom: BloomSchema.default('understand'),
  topic: z.string().min(1).default('General'),
  sourcePage: z.number().int().min(1).optional(),
});

export const AIGeneratedQuestionsResponseSchema = z.object({
  questions: z.array(AIQuestionItemSchema).min(1),
});

export type AIGeneratedQuestionItem = z.infer<typeof AIQuestionItemSchema>;

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  aiQuestionCount: number;
  bankQuestionCount: number;
  estimatedCostUsd: number;
}

export function extractJsonFromAIResponse<T = unknown>(raw?: string | null): T | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx >= 0 && endIdx > startIdx) {
      try {
        return JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as T;
      } catch {
        // fall through
      }
    }
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return { questions: JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) } as T;
      } catch {
        // fall through
      }
    }
    return null;
  }
}

function normalizeDifficultyValue(raw: unknown): z.infer<typeof DifficultySchema> {
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    if (lower === 'easy' || lower === 'medium' || lower === 'hard') return lower;
  }
  return 'medium';
}

function normalizeBloomValue(raw: unknown): z.infer<typeof BloomSchema> {
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    if (
      lower === 'remember' ||
      lower === 'understand' ||
      lower === 'apply' ||
      lower === 'analyze' ||
      lower === 'evaluate' ||
      lower === 'create'
    ) {
      return lower;
    }
    if (lower.includes('know') || lower.includes('recall')) return 'remember';
    if (lower.includes('comprehen') || lower.includes('explain')) return 'understand';
    if (lower.includes('applic')) return 'apply';
    if (lower.includes('analys')) return 'analyze';
    if (lower.includes('evaluat')) return 'evaluate';
    if (lower.includes('synth') || lower.includes('creat')) return 'create';
  }
  return 'understand';
}

function resolveOptionAnswer(answer: string, options: string[]): string {
  const trimmed = answer.trim();
  const exact = options.find((o) => normalizeQuestionText(o) === normalizeQuestionText(trimmed));
  if (exact) return exact;

  const letterMatch = trimmed.match(/^(?:option\s*)?\(?([a-dA-D1-4])\)?[.):]?$/i);
  if (letterMatch?.[1]) {
    const token = letterMatch[1].toLowerCase();
    const idx = token >= '1' && token <= '4' ? Number(token) - 1 : token.charCodeAt(0) - 97;
    if (options[idx]) return options[idx]!;
  }
  return trimmed;
}

export function parseAndNormalizeAIQuestions(
  rawText: string,
  expectedType: QuestionType
): AIGeneratedQuestionItem[] {
  const parsedRaw = extractJsonFromAIResponse(rawText);
  const rawList = Array.isArray(parsedRaw)
    ? parsedRaw
    : typeof parsedRaw === 'object' &&
        parsedRaw !== null &&
        'questions' in parsedRaw &&
        Array.isArray((parsedRaw as { questions: unknown }).questions)
      ? (parsedRaw as { questions: unknown[] }).questions
      : null;

  if (!rawList || rawList.length === 0) {
    throw new Error('AI JSON did not contain a non-empty "questions" array.');
  }

  const needsOptions = expectedType === 'mcq' || expectedType === 'assertion_reason';
  const normalizedItems: AIGeneratedQuestionItem[] = [];
  let lastError: unknown = null;

  for (const entry of rawList) {
    if (typeof entry !== 'object' || entry === null) continue;
    const obj = entry as Record<string, unknown>;

    const rawTextField = typeof obj.text === 'string' ? obj.text.trim() : '';
    const rawAnswerField = typeof obj.answer === 'string' ? obj.answer.trim() : '';
    const rawTopic = typeof obj.topic === 'string' && obj.topic.trim() ? obj.topic.trim() : 'General';
    const rawMarkingScheme =
      typeof obj.markingScheme === 'string' && obj.markingScheme.trim()
        ? obj.markingScheme.trim()
        : rawAnswerField
          ? `Award full marks for: ${rawAnswerField.slice(0, 80)}`
          : undefined;
    const rawPage =
      typeof obj.sourcePage === 'number' && Number.isFinite(obj.sourcePage) && obj.sourcePage >= 1
        ? Math.round(obj.sourcePage)
        : undefined;

    let cleanOptions: string[] | undefined;
    if (needsOptions && Array.isArray(obj.options)) {
      const cleaned = obj.options
        .filter((o): o is string => typeof o === 'string')
        .map((o) => o.trim())
        .filter(Boolean);
      if (cleaned.length >= 4) {
        cleanOptions = cleaned.slice(0, 4);
      }
    }

    const candidate: Record<string, unknown> = {
      text: rawTextField,
      answer: cleanOptions ? resolveOptionAnswer(rawAnswerField, cleanOptions) : rawAnswerField,
      markingScheme: rawMarkingScheme,
      difficulty: normalizeDifficultyValue(obj.difficulty),
      bloom: normalizeBloomValue(obj.bloom),
      topic: rawTopic,
      sourcePage: rawPage,
    };
    if (needsOptions && cleanOptions) {
      candidate.options = cleanOptions;
    }

    const checked = AIQuestionItemSchema.safeParse(candidate);
    if (!checked.success) {
      lastError = checked.error;
      continue;
    }
    if (needsOptions && (!checked.data.options || checked.data.options.length !== 4)) {
      lastError = new Error(
        `Expected 4 options for ${expectedType} question: "${checked.data.text.slice(0, 40)}..."`
      );
      continue;
    }
    normalizedItems.push({
      ...checked.data,
      options: needsOptions ? checked.data.options : undefined,
      markingScheme:
        checked.data.markingScheme?.trim() ||
        `Award full marks for: ${checked.data.answer.slice(0, 80)}`,
    });
  }

  if (normalizedItems.length === 0) {
    if (lastError instanceof Error) throw lastError;
    throw new Error(`No valid ${expectedType} questions found in AI response.`);
  }

  return normalizedItems;
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export function computeDifficultyBuckets(
  totalCount: number,
  split: { easy: number; medium: number; hard: number }
): Record<DifficultyLevel, number> {
  const easy = Math.round((totalCount * split.easy) / 100);
  const medium = Math.round((totalCount * split.medium) / 100);
  const hard = Math.max(0, totalCount - easy - medium);
  return { easy, medium, hard };
}

export function selectBankQuestionsForSection(
  section: BlueprintSection,
  bankQuestions: QuestionRecord[],
  usedIds: Set<string>,
  usedNormalizedTexts: string[],
  neededCount: number
): QuestionRecord[] {
  if (neededCount <= 0) return [];

  const chapterSet = new Set(section.chapterIds);
  const bloomSet = new Set(section.bloomTargets);

  // Rank candidates by exactness of type, chapter, marks, and Bloom alignment
  const candidates = bankQuestions
    .filter((q) => !usedIds.has(q.id))
    .filter((q) => {
      if (chapterSet.size > 0 && q.chapterId && !chapterSet.has(q.chapterId)) {
        return false;
      }
      if (q.type === section.questionType) return true;
      // Allow assertion_reason inside mcq section (standard CBSE Section A pattern)
      if (section.questionType === 'mcq' && q.type === 'assertion_reason') return true;
      return false;
    })
    .filter((q) => {
      const norm = normalizeQuestionText(q.text);
      return !usedNormalizedTexts.some((seen) => fuzzyTokenSimilarity(seen, norm) >= 0.85);
    })
    .sort((a, b) => {
      const aMarksDiff = Math.abs(a.marks - section.marksPerQuestion);
      const bMarksDiff = Math.abs(b.marks - section.marksPerQuestion);
      if (aMarksDiff !== bMarksDiff) return aMarksDiff - bMarksDiff;

      const aBloom = bloomSet.has(a.bloom) ? 0 : 1;
      const bBloom = bloomSet.has(b.bloom) ? 0 : 1;
      return aBloom - bBloom;
    });

  const targets = computeDifficultyBuckets(neededCount, section.difficultySplit);
  const selected: QuestionRecord[] = [];
  const remaining: QuestionRecord[] = [];

  for (const cand of candidates) {
    const norm = normalizeQuestionText(cand.text);
    const dupInSelected = selected.some(
      (s) => fuzzyTokenSimilarity(normalizeQuestionText(s.text), norm) >= 0.85
    );
    if (dupInSelected) continue;

    if (targets[cand.difficulty] > 0 && selected.length < neededCount) {
      targets[cand.difficulty] -= 1;
      selected.push(cand);
    } else {
      remaining.push(cand);
    }
  }

  for (const cand of remaining) {
    if (selected.length >= neededCount) break;
    const norm = normalizeQuestionText(cand.text);
    const dupInSelected = selected.some(
      (s) => fuzzyTokenSimilarity(normalizeQuestionText(s.text), norm) >= 0.85
    );
    if (dupInSelected) continue;
    selected.push(cand);
  }

  for (const item of selected) {
    usedIds.add(item.id);
    usedNormalizedTexts.push(normalizeQuestionText(item.text));
  }

  return selected;
}

export function retrieveContextChunksForSection(
  section: BlueprintSection,
  allChunks: ChunkRecord[],
  chapters: ChapterRecord[],
  subject: string,
  maxChunks = 5
): ChunkRecord[] {
  if (allChunks.length === 0) return [];

  const chapterSet = new Set(section.chapterIds);
  const filteredChunks =
    chapterSet.size > 0
      ? allChunks.filter((c) => chapterSet.has(c.chapterId))
      : allChunks;

  const pool = filteredChunks.length > 0 ? filteredChunks : allChunks;
  if (pool.length <= maxChunks) return pool;

  const chapterTitles = chapters
    .filter((c) => chapterSet.size === 0 || chapterSet.has(c.id))
    .map((c) => `${c.title} ${c.topics.join(' ')}`)
    .join(' ');

  const query = `${subject} ${chapterTitles} ${section.name}`.trim();
  const idx = new LocalBM25Index();
  idx.indexChunks(pool);
  const hits = idx.searchChunks(query, { limit: maxChunks });

  if (hits.length === 0) {
    return pool.slice(0, maxChunks);
  }

  const chunkById = new Map(pool.map((c) => [c.id, c]));
  const retrieved: ChunkRecord[] = [];
  for (const hit of hits) {
    const ch = chunkById.get(hit.id);
    if (ch) retrieved.push(ch);
  }
  return retrieved.length > 0 ? retrieved : pool.slice(0, maxChunks);
}

export function computeGroundingScore(questionText: string, contextChunks: ChunkRecord[]): number {
  if (contextChunks.length === 0) return 1;
  const chunkTokens = new Set(
    contextChunks
      .map((c) => normalizeQuestionText(c.text))
      .join(' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );
  const qTokens = normalizeQuestionText(questionText)
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  if (qTokens.length === 0) return 1;
  let hits = 0;
  for (const tok of qTokens) {
    if (chunkTokens.has(tok)) hits += 1;
  }
  return hits / qTokens.length;
}

export async function convertAIItemsToPaperQuestions(
  items: AIGeneratedQuestionItem[],
  section: BlueprintSection,
  language: LanguageCode,
  contextChunks: ChunkRecord[],
  usedNormalizedTexts: string[]
): Promise<{
  accepted: PaperQuestion[];
  droppedDuplicates: number;
  lowGroundingCount: number;
}> {
  const now = Date.now();
  const accepted: PaperQuestion[] = [];
  let droppedDuplicates = 0;
  let lowGroundingCount = 0;

  for (const item of items) {
    const norm = normalizeQuestionText(item.text);
    if (
      usedNormalizedTexts.some(
        (seen) => seen === norm || fuzzyTokenSimilarity(seen, norm) >= 0.9
      )
    ) {
      droppedDuplicates += 1;
      continue;
    }

    const grounding = computeGroundingScore(item.text, contextChunks);
    if (contextChunks.length > 0 && grounding < 0.15) {
      lowGroundingCount += 1;
    }

    const matchedChunk = contextChunks[0];
    const hash = await sha256Hex(norm);
    const id = generateId('q');

    usedNormalizedTexts.push(norm);
    accepted.push({
      id,
      paperQuestionId: generateId('pq'),
      order: accepted.length,
      bookId: matchedChunk?.bookId,
      chapterId: matchedChunk?.chapterId ?? section.chapterIds[0],
      type: section.questionType,
      text: item.text.trim(),
      options: item.options,
      answer: item.answer.trim(),
      markingScheme: item.markingScheme?.trim(),
      marks: section.marksPerQuestion,
      difficulty: item.difficulty,
      bloom: item.bloom,
      topic: item.topic.trim() || section.name,
      sourcePage: item.sourcePage ?? matchedChunk?.pageNumber,
      origin: 'ai',
      language,
      hash,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { accepted, droppedDuplicates, lowGroundingCount };
}

export function buildSectionQuestionsWithChoices(
  section: BlueprintSection,
  rawQuestions: QuestionRecord[]
): PaperQuestion[] {
  const internalCount =
    section.choiceRule.enabled && !section.choiceRule.totalCount
      ? Math.min(section.choiceRule.internalChoiceCount, section.count)
      : 0;

  const primaryCount = section.choiceRule.totalCount
    ? Math.max(section.count, section.choiceRule.totalCount)
    : section.count;

  const primaries = rawQuestions.slice(0, primaryCount).map((q, idx) => ({
    ...q,
    paperQuestionId: generateId('pq'),
    order: idx,
    marks: section.marksPerQuestion,
  }));

  const alternatives = rawQuestions.slice(primaryCount, primaryCount + internalCount).map((q, idx) => {
    const hostIdx = Math.max(0, primaries.length - internalCount + idx);
    const host = primaries[hostIdx];
    return {
      ...q,
      paperQuestionId: generateId('pq'),
      order: hostIdx,
      marks: section.marksPerQuestion,
      alternativeToId: host?.paperQuestionId,
    };
  });

  // Interleave each alternative directly after its host question
  const merged: PaperQuestion[] = [];
  for (const primary of primaries) {
    merged.push(primary);
    const alt = alternatives.find((a) => a.alternativeToId === primary.paperQuestionId);
    if (alt) merged.push(alt);
  }
  return merged.map((q, idx) => ({ ...q, order: idx }));
}

export function generateParallelSets(
  sections: PaperSection[],
  seed = 2026
): PaperSet[] {
  const codes: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

  return codes.map((code, idx) => {
    const rng = seededRandom(seed + idx * 997);
    const questionOrderBySection: Record<string, string[]> = {};
    const optionOrderByQuestion: Record<string, number[]> = {};

    for (const sec of sections) {
      // Group each primary question with its OR alternative so pairs move together
      const groups: PaperQuestion[][] = [];
      for (const q of sec.questions) {
        if (q.alternativeToId) {
          const hostGroup = groups.find((g) => g[0]?.paperQuestionId === q.alternativeToId);
          if (hostGroup) hostGroup.push(q);
          else groups.push([q]);
        } else {
          groups.push([q]);
        }
      }

      const orderedGroups = code === 'A' ? groups : shuffleWithRng(groups, rng);
      questionOrderBySection[sec.id] = orderedGroups.flatMap((g) =>
        g.map((q) => q.paperQuestionId)
      );

      for (const q of sec.questions) {
        if (q.options && q.options.length === 4) {
          optionOrderByQuestion[q.paperQuestionId] =
            code === 'A' ? [0, 1, 2, 3] : shuffleWithRng([0, 1, 2, 3], rng);
        }
      }
    }

    return {
      code,
      questionOrderBySection,
      optionOrderByQuestion,
    };
  });
}

export interface ResolvedPaperQuestion extends PaperQuestion {
  displayNumber: number;
  resolvedOptions?: string[];
  resolvedAnswerLabel?: string;
}

export function resolvePaperForSet(
  paper: PaperRecord,
  setCode: 'A' | 'B' | 'C'
): Array<Omit<PaperSection, 'questions'> & { questions: ResolvedPaperQuestion[] }> {
  const setObj = paper.sets.find((s) => s.code === setCode);

  return paper.sections.map((section) => {
    const qMap = new Map(section.questions.map((q) => [q.paperQuestionId, q]));
    const orderedIds = setObj?.questionOrderBySection[section.id];
    const orderedQuestions = orderedIds
      ? orderedIds.map((id) => qMap.get(id)).filter((q): q is PaperQuestion => Boolean(q))
      : section.questions;

    let displayCounter = 0;
    const resolvedQuestions: ResolvedPaperQuestion[] = orderedQuestions.map((q) => {
      if (!q.alternativeToId) displayCounter += 1;

      let resolvedOptions = q.options;
      let resolvedAnswerLabel: string | undefined;

      if (q.options && q.options.length === 4) {
        const perm = setObj?.optionOrderByQuestion[q.paperQuestionId] ?? [0, 1, 2, 3];
        resolvedOptions = perm.map((idx) => q.options![idx] ?? '');
        const normAns = normalizeQuestionText(q.answer);
        const matchIdx = resolvedOptions.findIndex(
          (opt) => normalizeQuestionText(opt) === normAns
        );
        if (matchIdx >= 0) {
          resolvedAnswerLabel = `(${String.fromCharCode(97 + matchIdx)}) ${resolvedOptions[matchIdx]}`;
        }
      }

      return {
        ...q,
        displayNumber: displayCounter,
        resolvedOptions,
        resolvedAnswerLabel,
      };
    });

    return {
      ...section,
      questions: resolvedQuestions,
    };
  });
}

export function estimateGenerationTokens(
  blueprint: BlueprintRecord,
  bankQuestions: QuestionRecord[],
  chunks: ChunkRecord[],
  chapters: ChapterRecord[],
  aiEnabled: boolean
): TokenEstimate {
  const usedIds = new Set<string>();
  const usedTexts: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let aiQuestionCount = 0;
  let bankQuestionCount = 0;

  for (const sec of blueprint.sections) {
    const needed = getSectionGeneratedCount(sec);
    let fromBank = 0;

    if (sec.sourceMode !== 'ai_from_book' || !aiEnabled) {
      const picked = selectBankQuestionsForSection(sec, bankQuestions, usedIds, usedTexts, needed);
      fromBank = picked.length;
    }

    bankQuestionCount += fromBank;
    const fromAI = aiEnabled && sec.sourceMode !== 'bank_only' ? Math.max(0, needed - fromBank) : 0;

    if (fromAI > 0) {
      aiQuestionCount += fromAI;
      const retrieved = retrieveContextChunksForSection(
        sec,
        chunks,
        chapters,
        blueprint.header.subject,
        5
      );
      const contextTokens = retrieved.reduce((sum, c) => sum + c.tokenEstimate, 0);
      inputTokens += 350 + contextTokens;
      outputTokens += fromAI * 120;
    }
  }

  const totalTokens = inputTokens + outputTokens;
  // Conservative blended reference estimate (~$0.30/1M input + $1.20/1M output)
  const estimatedCostUsd = Number(
    ((inputTokens * 0.0000003 + outputTokens * 0.0000012)).toFixed(4)
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    aiQuestionCount,
    bankQuestionCount,
    estimatedCostUsd,
  };
}
