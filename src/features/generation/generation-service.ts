import { z } from 'zod';
import {
  calculateBlueprintSummary,
  getSectionGeneratedCount,
} from '@/src/features/blueprint/blueprint-engine';
import { db } from '@/src/features/storage/db';
import { writeFileToLibraryFolder } from '@/src/features/storage/folder-sync';
import { repository } from '@/src/features/storage/repository';
import { AppError, getErrorMessage } from '@/src/lib/errors';
import { generateId, normalizeQuestionText } from '@/src/lib/utils';
import {
  BloomSchema,
  DifficultySchema,
  PaperSchema,
  type BlueprintRecord,
  type BlueprintSection,
  type LanguageCode,
  type PaperRecord,
  type PaperSection,
  type QuestionRecord,
  type SettingsRecord,
} from '@/src/lib/zod-schemas';
import { callAIProvider, isAIConfigured } from './ai-providers';
import {
  buildSectionQuestionsWithChoices,
  convertAIItemsToPaperQuestions,
  extractJsonFromAIResponse,
  generateParallelSets,
  parseAndNormalizeAIQuestions,
  retrieveContextChunksForSection,
  selectBankQuestionsForSection,
} from './paper-engine';

export interface GenerationShortfall {
  sectionId: string;
  sectionName: string;
  requested: number;
  fulfilled: number;
  reason: string;
}

export interface GenerationResult {
  paper: PaperRecord;
  jobId: string;
  shortfalls: GenerationShortfall[];
  aiGeneratedCount: number;
  bankSelectedCount: number;
  lowGroundingWarnings: number;
}

export interface GenerationProgressUpdate {
  stage: string;
  progress: number;
  sectionName?: string;
}

const activeGenerationControllers = new Map<string, AbortController>();

export function cancelGenerationJob(jobId: string): void {
  const controller = activeGenerationControllers.get(jobId);
  if (controller) {
    controller.abort();
    activeGenerationControllers.delete(jobId);
  }
}

function buildSectionResponseSchema(questionType: BlueprintSection['questionType']): Record<string, unknown> {
  const needsOptions = questionType === 'mcq' || questionType === 'assertion_reason';
  const itemProperties: Record<string, unknown> = {
    text: { type: 'STRING', description: 'Complete, self-contained question stem.' },
    answer: { type: 'STRING', description: 'Accurate expected answer.' },
    markingScheme: { type: 'STRING', description: 'Stepwise marking points.' },
    difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
    bloom: {
      type: 'STRING',
      enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'],
    },
    topic: { type: 'STRING', description: 'Concise topic name.' },
    sourcePage: { type: 'INTEGER', description: 'Source page number if applicable.' },
  };
  const required = ['text', 'answer', 'markingScheme', 'difficulty', 'bloom', 'topic'];

  if (needsOptions) {
    itemProperties.options = {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Exactly 4 distinct answer choices.',
    };
    required.push('options');
  }

  return {
    type: 'OBJECT',
    properties: {
      questions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: itemProperties,
          required,
        },
      },
    },
    required: ['questions'],
  };
}

function buildSectionPrompt(
  blueprint: BlueprintRecord,
  section: BlueprintSection,
  countNeeded: number,
  chunksText: string,
  avoidQuestions: string[]
): { systemPrompt: string; userPrompt: string } {
  const langName: Record<LanguageCode, string> = {
    en: 'English',
    hi: 'Hindi (Devanagari script)',
    mr: 'Marathi (Devanagari script)',
  };

  const needsOptions =
    section.questionType === 'mcq' || section.questionType === 'assertion_reason';
  const schemaExample = needsOptions
    ? '{"questions":[{"text":"...","options":["...","...","...","..."],"answer":"...","markingScheme":"...","difficulty":"easy|medium|hard","bloom":"remember|understand|apply|analyze|evaluate|create","topic":"...","sourcePage":1}]}'
    : '{"questions":[{"text":"...","answer":"...","markingScheme":"...","difficulty":"easy|medium|hard","bloom":"remember|understand|apply|analyze|evaluate|create","topic":"...","sourcePage":1}]}';

  const optionRule = needsOptions
    ? 'Each question MUST include an "options" array of exactly 4 distinct non-empty strings, and "answer" MUST exactly equal one of those 4 option strings.'
    : 'Do NOT include an "options" property in any question object.';

  const systemPrompt = [
    `You are an experienced ${blueprint.header.board} school exam paper setter for Class ${blueprint.header.classLevel} ${blueprint.header.subject}.`,
    `Write all questions, answers, and marking schemes in ${langName[blueprint.language]}.`,
    'Ground every question strictly in the provided textbook excerpts when excerpts are given; otherwise align strictly with the board syllabus.',
    'Return ONLY a valid JSON object matching this exact schema:',
    schemaExample,
    optionRule,
  ].join(' ');

  const avoidSnippet =
    avoidQuestions.length > 0
      ? `\nDo NOT repeat, copy, or closely paraphrase any of these existing questions:\n- ${avoidQuestions.slice(-20).join('\n- ')}`
      : '';

  const userPrompt = [
    `Generate EXACTLY ${countNeeded} distinct ${section.questionType.replace('_', ' ')} question(s) worth ${section.marksPerQuestion} mark(s) each for "${section.name}".`,
    `The "questions" array MUST contain all ${countNeeded} unique items covering different concepts.`,
    `Target difficulty split (%): easy ${section.difficultySplit.easy}%, medium ${section.difficultySplit.medium}%, hard ${section.difficultySplit.hard}%.`,
    `Target Bloom levels: ${section.bloomTargets.join(', ')}.`,
    chunksText
      ? `\nTextbook Reference Excerpts:\n${chunksText}`
      : '\nNo textbook excerpts provided; align strictly with standard board syllabus.',
    avoidSnippet,
  ].join('\n');

  return { systemPrompt, userPrompt };
}

async function generateAISectionItems(
  blueprint: BlueprintRecord,
  section: BlueprintSection,
  neededCount: number,
  chunksText: string,
  avoidTexts: string[],
  settings: SettingsRecord,
  signal: AbortSignal
) {
  const { systemPrompt, userPrompt } = buildSectionPrompt(
    blueprint,
    section,
    neededCount,
    chunksText,
    avoidTexts
  );
  const responseSchema = buildSectionResponseSchema(section.questionType);
  const needsOptions =
    section.questionType === 'mcq' || section.questionType === 'assertion_reason';
  const repairTemplate = needsOptions
    ? '{"questions":[{"text":"...","options":["a","b","c","d"],"answer":"...","markingScheme":"...","difficulty":"easy|medium|hard","bloom":"remember|understand|apply|analyze|evaluate|create","topic":"..."}]}'
    : '{"questions":[{"text":"...","answer":"...","markingScheme":"...","difficulty":"easy|medium|hard","bloom":"remember|understand|apply|analyze|evaluate|create","topic":"..."}]}';

  const firstAttempt = await callAIProvider(settings, {
    systemPrompt,
    userPrompt,
    temperature: 0.35,
    maxTokens: 4096,
    signal,
    responseSchema,
    thinkingLevel: 'LOW',
  });

  try {
    return parseAndNormalizeAIQuestions(firstAttempt.text, section.questionType);
  } catch (parseErr) {
    // One automatic JSON/schema repair pass
    const repairResult = await callAIProvider(settings, {
      systemPrompt: `Repair the malformed JSON below so it strictly matches ${repairTemplate}. Return valid JSON only.`,
      userPrompt: `Validation error: ${getErrorMessage(parseErr)}\nExpected type: ${section.questionType}\n\nMalformed response:\n${firstAttempt.text.slice(0, 6000)}`,
      temperature: 0,
      maxTokens: 4096,
      signal,
      responseSchema,
      thinkingLevel: 'LOW',
    });
    return parseAndNormalizeAIQuestions(repairResult.text, section.questionType);
  }
}

export async function generateQuestionPaperJob(
  blueprint: BlueprintRecord,
  options?: {
    title?: string;
    onJobCreated?: (jobId: string) => void;
    onProgress?: (update: GenerationProgressUpdate) => void;
  }
): Promise<GenerationResult> {
  const summary = calculateBlueprintSummary(blueprint);
  if (!summary.isValid) {
    throw new AppError(summary.errors[0] ?? 'Blueprint validation failed.', {
      code: 'INVALID_BLUEPRINT',
    });
  }

  const jobId = generateId('job');
  const controller = new AbortController();
  activeGenerationControllers.set(jobId, controller);
  options?.onJobCreated?.(jobId);

  const now = Date.now();
  const paperTitle = options?.title?.trim() || blueprint.title;

  await repository.jobsRepo.saveJob({
    id: jobId,
    type: 'generate',
    status: 'running',
    title: `Generating ${paperTitle}`,
    progress: 5,
    processedItems: 0,
    totalItems: blueprint.sections.length,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const [settings, bankQuestions, chapters, chunks] = await Promise.all([
      repository.settingsRepo.get(),
      repository.libraryRepo.listQuestions(),
      db.chapters.orderBy('order').toArray(),
      db.chunks.toArray(),
    ]);

    const aiAvailable = isAIConfigured(settings);
    const usedIds = new Set<string>();
    const usedNormalizedTexts: string[] = [];
    const paperSections: PaperSection[] = [];
    const shortfalls: GenerationShortfall[] = [];
    let aiGeneratedCount = 0;
    let bankSelectedCount = 0;
    let lowGroundingWarnings = 0;

    for (let idx = 0; idx < blueprint.sections.length; idx++) {
      if (controller.signal.aborted) {
        throw new DOMException('Paper generation cancelled by user', 'AbortError');
      }

      const section = blueprint.sections[idx]!;
      const needed = getSectionGeneratedCount(section);
      const pct = Math.round(10 + ((idx + 0.3) / Math.max(1, blueprint.sections.length)) * 80);

      options?.onProgress?.({
        stage: `Preparing ${section.name}`,
        progress: pct,
        sectionName: section.name,
      });
      await repository.jobsRepo.updateJobProgress(jobId, {
        progress: pct,
        processedItems: idx,
        title: `Generating ${section.name}…`,
      });

      const sectionPool: QuestionRecord[] = [];

      // 1. Deterministic bank selection when allowed or when AI is offline/unconfigured
      if (section.sourceMode !== 'ai_from_book' || !aiAvailable) {
        const picked = selectBankQuestionsForSection(
          section,
          bankQuestions,
          usedIds,
          usedNormalizedTexts,
          needed
        );
        sectionPool.push(...picked);
        bankSelectedCount += picked.length;
      }

      // 2. AI generation for remaining slots if enabled and allowed by sourceMode
      const remaining = needed - sectionPool.length;
      if (remaining > 0 && section.sourceMode !== 'bank_only') {
        if (!aiAvailable) {
          shortfalls.push({
            sectionId: section.id,
            sectionName: section.name,
            requested: needed,
            fulfilled: sectionPool.length,
            reason:
              'AI provider is set to Offline / Bank-Only mode and the local question bank had fewer matching items.',
          });
        } else {
          const contextChunks = retrieveContextChunksForSection(
            section,
            chunks,
            chapters,
            blueprint.header.subject,
            5
          );
          const chunksText = contextChunks
            .map((c) => `[Page ${c.pageNumber}] ${c.text}`)
            .join('\n\n');

          const MAX_BATCH_SIZE = 5;
          const MAX_AI_PASSES = 4;
          let pass = 0;
          let lastAiError: unknown = null;

          while (sectionPool.length < needed && pass < MAX_AI_PASSES) {
            if (controller.signal.aborted) {
              throw new DOMException('Paper generation cancelled by user', 'AbortError');
            }
            pass += 1;
            const stillNeeded = needed - sectionPool.length;
            const batchTarget = Math.min(stillNeeded, MAX_BATCH_SIZE);

            try {
              const aiItems = await generateAISectionItems(
                blueprint,
                section,
                batchTarget,
                chunksText,
                usedNormalizedTexts,
                settings,
                controller.signal
              );
              const verified = await convertAIItemsToPaperQuestions(
                aiItems.slice(0, stillNeeded),
                section,
                blueprint.language,
                contextChunks,
                usedNormalizedTexts
              );
              sectionPool.push(...verified.accepted);
              aiGeneratedCount += verified.accepted.length;
              lowGroundingWarnings += verified.lowGroundingCount;
              lastAiError = null;
            } catch (aiErr) {
              if (aiErr instanceof DOMException && aiErr.name === 'AbortError') {
                throw aiErr;
              }
              lastAiError = aiErr;
              const code = aiErr instanceof AppError ? aiErr.code : '';
              const nonRetryable =
                code === 'MISSING_API_KEY' ||
                code === 'AI_DISABLED' ||
                code === 'AI_BLOCKED' ||
                code === 'AI_HTTP_400' ||
                code === 'AI_HTTP_401' ||
                code === 'AI_HTTP_403' ||
                code === 'AI_HTTP_404';
              if (nonRetryable) {
                break;
              }
            }
          }

          if (sectionPool.length < needed) {
            const fallbackPicked = selectBankQuestionsForSection(
              section,
              bankQuestions,
              usedIds,
              usedNormalizedTexts,
              needed - sectionPool.length
            );
            sectionPool.push(...fallbackPicked);
            bankSelectedCount += fallbackPicked.length;

            if (sectionPool.length < needed) {
              shortfalls.push({
                sectionId: section.id,
                sectionName: section.name,
                requested: needed,
                fulfilled: sectionPool.length,
                reason: lastAiError
                  ? `AI call failed (${getErrorMessage(lastAiError)}); used available bank items.`
                  : 'Some duplicate or incomplete AI items were filtered during verification.',
              });
            }
          }
        }
      } else if (remaining > 0 && section.sourceMode === 'bank_only') {
        shortfalls.push({
          sectionId: section.id,
          sectionName: section.name,
          requested: needed,
          fulfilled: sectionPool.length,
          reason: 'Not enough matching questions in the local bank for this section.',
        });
      }

      const paperQuestions = buildSectionQuestionsWithChoices(section, sectionPool);
      paperSections.push({
        id: section.id,
        name: section.name,
        instructions: section.instructions,
        marksPerQuestion: section.marksPerQuestion,
        choiceRule: section.choiceRule,
        questions: paperQuestions,
      });
    }

    const sets = generateParallelSets(paperSections, now % 100000);
    const paper: PaperRecord = PaperSchema.parse({
      id: generateId('paper'),
      title: paperTitle,
      blueprintSnapshot: {
        ...blueprint,
        totalMarks: summary.totalMarks,
        updatedAt: Date.now(),
      },
      sections: paperSections,
      sets,
      language: blueprint.language,
      status: 'draft',
      createdAt: now,
      updatedAt: Date.now(),
    });

    await repository.papersRepo.savePaper(paper, 'Initial generated draft');

    const safeClassSubject = `Class-${blueprint.header.classLevel}-${blueprint.header.subject
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;
    void writeFileToLibraryFolder(
      ['Papers', safeClassSubject],
      `${paper.id}.json`,
      JSON.stringify(paper, null, 2)
    );

    await repository.jobsRepo.updateJobProgress(jobId, {
      status: 'completed',
      progress: 100,
      processedItems: blueprint.sections.length,
      totalItems: blueprint.sections.length,
      title: `Generated "${paper.title}" (${bankSelectedCount} bank, ${aiGeneratedCount} AI)`,
    });

    options?.onProgress?.({ stage: 'Completed', progress: 100 });

    return {
      paper,
      jobId,
      shortfalls,
      aiGeneratedCount,
      bankSelectedCount,
      lowGroundingWarnings,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      await repository.jobsRepo.updateJobProgress(jobId, {
        status: 'cancelled',
        errorMessage: 'Generation cancelled by user.',
      });
    } else {
      await repository.jobsRepo.updateJobProgress(jobId, {
        status: 'failed',
        errorMessage: getErrorMessage(err),
      });
    }
    throw err;
  } finally {
    activeGenerationControllers.delete(jobId);
  }
}

const AITagBatchResponseSchema = z.object({
  tags: z.array(
    z.object({
      id: z.string().min(1),
      difficulty: DifficultySchema,
      bloom: BloomSchema,
      topic: z.string().min(1),
    })
  ),
});

export async function aiAutoTagQuestions(
  questions: QuestionRecord[],
  settings: SettingsRecord
): Promise<number> {
  if (!isAIConfigured(settings)) {
    throw new AppError('Configure an AI provider key in Settings to run AI-assisted tagging.');
  }
  if (questions.length === 0) return 0;

  const batch = questions.slice(0, 25);
  const res = await callAIProvider(settings, {
    systemPrompt:
      'Classify each school exam question with difficulty (easy|medium|hard), bloom (remember|understand|apply|analyze|evaluate|create), and concise topic. Return JSON: {"tags":[{"id":"...","difficulty":"medium","bloom":"understand","topic":"..."}]}',
    userPrompt: JSON.stringify(
      batch.map((q) => ({ id: q.id, text: q.text, marks: q.marks, type: q.type }))
    ),
    temperature: 0.1,
    maxTokens: 2048,
    thinkingLevel: 'LOW',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        tags: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              id: { type: 'STRING' },
              difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
              bloom: {
                type: 'STRING',
                enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'],
              },
              topic: { type: 'STRING' },
            },
            required: ['id', 'difficulty', 'bloom', 'topic'],
          },
        },
      },
      required: ['tags'],
    },
  });

  const parsed = AITagBatchResponseSchema.parse(extractJsonFromAIResponse(res.text));
  const tagMap = new Map(parsed.tags.map((t) => [t.id, t]));
  const updated: QuestionRecord[] = [];
  const now = Date.now();

  for (const q of batch) {
    const tag = tagMap.get(q.id);
    if (tag) {
      updated.push({
        ...q,
        difficulty: tag.difficulty,
        bloom: tag.bloom,
        topic: tag.topic.trim() || q.topic,
        updatedAt: now,
      });
    }
  }

  if (updated.length > 0) {
    await repository.libraryRepo.saveQuestions(updated);
  }
  return updated.length;
}

export async function regenerateSingleQuestionWithAI(
  blueprint: BlueprintRecord,
  section: BlueprintSection,
  existingQuestionTexts: string[],
  settings: SettingsRecord
): Promise<QuestionRecord> {
  if (!isAIConfigured(settings)) {
    throw new AppError('Configure an AI provider in Settings to regenerate questions with AI.');
  }
  const [chapters, chunks] = await Promise.all([
    db.chapters.orderBy('order').toArray(),
    db.chunks.toArray(),
  ]);

  const contextChunks = retrieveContextChunksForSection(
    section,
    chunks,
    chapters,
    blueprint.header.subject,
    4
  );
  const chunksText = contextChunks.map((c) => `[Page ${c.pageNumber}] ${c.text}`).join('\n\n');
  const avoidNorms = existingQuestionTexts.map((t) => normalizeQuestionText(t));

  const controller = new AbortController();
  const items = await generateAISectionItems(
    blueprint,
    section,
    1,
    chunksText,
    existingQuestionTexts,
    settings,
    controller.signal
  );

  const verified = await convertAIItemsToPaperQuestions(
    items.slice(0, 1),
    section,
    blueprint.language,
    contextChunks,
    avoidNorms
  );

  if (verified.accepted.length === 0) {
    throw new AppError('Generated replacement duplicated an existing question. Please try again.');
  }

  return verified.accepted[0]!;
}
