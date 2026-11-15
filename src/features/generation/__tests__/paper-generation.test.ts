import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/src/features/storage/db';
import { repository } from '@/src/features/storage/repository';
import { loadSampleClass10Library } from '@/src/features/storage/sample-data';
import { createBlankBlueprint } from '@/src/features/blueprint/blueprint-engine';
import { generateQuestionPaperJob } from '../generation-service';
import {
  buildSectionQuestionsWithChoices,
  computeGroundingScore,
  generateParallelSets,
  parseAndNormalizeAIQuestions,
  resolvePaperForSet,
  selectBankQuestionsForSection,
} from '../paper-engine';
import type { PaperRecord, QuestionRecord } from '@/src/lib/zod-schemas';

describe('Paper Selection, AI Repair, Sets A/B/C & Generation Job', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects bank questions without duplicates and builds internal OR choices', () => {
    const sampleQuestions: QuestionRecord[] = [
      {
        id: 'q1',
        type: 'short',
        text: 'Define oxidation with an example.',
        answer: 'Gain of oxygen or loss of hydrogen.',
        marks: 2,
        difficulty: 'easy',
        bloom: 'remember',
        topic: 'Reactions',
        origin: 'bank',
        language: 'en',
        hash: 'h1',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'q2',
        type: 'short',
        text: 'Define oxidation with an example.', // exact duplicate text
        answer: 'Gain of oxygen.',
        marks: 2,
        difficulty: 'easy',
        bloom: 'remember',
        topic: 'Reactions',
        origin: 'bank',
        language: 'en',
        hash: 'h1',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'q3',
        type: 'short',
        text: 'Balance the chemical equation for burning magnesium ribbon.',
        answer: '2Mg + O2 -> 2MgO',
        marks: 2,
        difficulty: 'medium',
        bloom: 'apply',
        topic: 'Reactions',
        origin: 'bank',
        language: 'en',
        hash: 'h3',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const usedIds = new Set<string>();
    const usedNorms: string[] = [];
    const section = createBlankBlueprint().sections[1]!;
    section.count = 1;
    section.marksPerQuestion = 2;
    section.choiceRule = { enabled: true, internalChoiceCount: 1 };

    const selected = selectBankQuestionsForSection(section, sampleQuestions, usedIds, usedNorms, 2);
    expect(selected).toHaveLength(2);
    expect(selected.map((q) => q.id)).toEqual(['q3', 'q1']);

    const merged = buildSectionQuestionsWithChoices(section, selected);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.alternativeToId).toBe(merged[0]?.paperQuestionId);
  });

  it('generates parallel Sets A, B, C and keeps MCQ option answer keys synchronized', () => {
    const mcqs: QuestionRecord[] = [1, 2, 3].map((n) => ({
      id: `mcq_${n}`,
      type: 'mcq',
      text: `Question ${n}: Which gas is evolved?`,
      options: ['Oxygen', 'Hydrogen', 'Nitrogen', 'Chlorine'],
      answer: 'Hydrogen',
      marks: 1,
      difficulty: 'easy',
      bloom: 'remember',
      topic: 'Gases',
      origin: 'bank',
      language: 'en',
      hash: `h_${n}`,
      createdAt: 1,
      updatedAt: 1,
    }));

    const sec = createBlankBlueprint().sections[0]!;
    sec.id = 'sec_mcq';
    sec.count = 3;
    const pqs = buildSectionQuestionsWithChoices(sec, mcqs);
    const paperSections = [
      {
        id: 'sec_mcq',
        name: 'Section A',
        marksPerQuestion: 1,
        choiceRule: { enabled: false, internalChoiceCount: 0 },
        questions: pqs,
      },
    ];

    const sets = generateParallelSets(paperSections, 42);
    expect(sets).toHaveLength(3);

    const paper: PaperRecord = {
      id: 'p1',
      title: 'Test Paper',
      blueprintSnapshot: createBlankBlueprint(),
      sections: paperSections,
      sets,
      language: 'en',
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
    };

    for (const code of ['A', 'B', 'C'] as const) {
      const resolved = resolvePaperForSet(paper, code);
      expect(resolved[0]?.questions).toHaveLength(3);
      for (const q of resolved[0]!.questions) {
        expect(q.resolvedOptions).toHaveLength(4);
        expect(q.resolvedAnswerLabel).toContain('Hydrogen');
      }
    }
  });

  it('parses markdown-fenced AI JSON and computes textbook grounding overlap', () => {
    const raw = '```json\n{"questions":[{"text":"Why is respiration exothermic?","answer":"Energy is released.","difficulty":"medium","bloom":"understand","topic":"Respiration"}]}\n```';
    const items = parseAndNormalizeAIQuestions(raw, 'short');
    expect(items).toHaveLength(1);
    expect(items[0]?.markingScheme).toContain('Energy is released');

    const score = computeGroundingScore('Why is respiration exothermic?', [
      {
        id: 'c1',
        bookId: 'b1',
        chapterId: 'ch1',
        pageNumber: 5,
        chunkIndex: 0,
        text: 'Respiration is an exothermic process because glucose breakdown releases energy.',
        tokenEstimate: 14,
        language: 'en',
      },
    ]);
    expect(score).toBeGreaterThan(0.5);
  });

  it('runs end-to-end offline bank-only generation and mocked Gemini AI generation with JSON auto-repair', async () => {
    await loadSampleClass10Library();

    // 1. Offline Bank-Only Mode
    const bp = createBlankBlueprint();
    bp.sections = [
      {
        ...bp.sections[0]!,
        id: 's_mcq',
        questionType: 'mcq',
        count: 3,
        marksPerQuestion: 1,
        sourceMode: 'bank_only',
      },
    ];
    const offlineResult = await generateQuestionPaperJob(bp, { title: 'Offline Unit Test' });
    expect(offlineResult.bankSelectedCount).toBe(3);
    expect(offlineResult.aiGeneratedCount).toBe(0);
    expect(offlineResult.paper.sets).toHaveLength(3);

    const savedOffline = await repository.papersRepo.getPaper(offlineResult.paper.id);
    expect(savedOffline?.title).toBe('Offline Unit Test');

    // 2. Mocked Gemini BYOK Mode (1st response malformed, 2nd repair response valid)
    await repository.settingsRepo.update({
      aiProvider: 'gemini',
      aiModel: 'gemini-4-hydrogen',
      aiApiKey: 'test-key-123',
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'NOT VALID JSON {{' }] } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      questions: [
                        {
                          text: 'Write the balanced thermal decomposition reaction of ferrous sulphate.',
                          answer: '2FeSO4 -> Fe2O3 + SO2 + SO3',
                          markingScheme: '1 mark for reactants, 1 mark for balanced products.',
                          difficulty: 'medium',
                          bloom: 'apply',
                          topic: 'Decomposition reactions',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const aiBp = createBlankBlueprint();
    aiBp.sections = [
      {
        ...aiBp.sections[1]!,
        id: 's_ai',
        questionType: 'short',
        count: 1,
        marksPerQuestion: 2,
        sourceMode: 'ai_from_book',
      },
    ];
    const aiResult = await generateQuestionPaperJob(aiBp, { title: 'AI Grounded Test' });
    expect(aiResult.aiGeneratedCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aiResult.paper.sections[0]?.questions[0]?.origin).toBe('ai');
  });

  it('strips empty/null options on non-MCQ questions and resolves letter answers on MCQs', () => {
    const shortRaw = JSON.stringify({
      questions: [
        {
          text: 'Give scientific reason: Metals conduct electricity.',
          options: [],
          answer: 'Metals have free electrons that carry electric charge.',
          difficulty: 'Medium',
          bloom: 'Comprehension',
          topic: 'Metals',
        },
        {
          text: 'Explain why ionic compounds have high melting points.',
          options: null,
          answer: 'Strong electrostatic attraction between oppositely charged ions.',
          difficulty: 'hard',
          bloom: 'understand',
          topic: 'Ionic Bonding',
        },
      ],
    });

    const parsedShort = parseAndNormalizeAIQuestions(shortRaw, 'short');
    expect(parsedShort).toHaveLength(2);
    expect(parsedShort[0]?.options).toBeUndefined();
    expect(parsedShort[0]?.difficulty).toBe('medium');
    expect(parsedShort[0]?.bloom).toBe('understand');
    expect(parsedShort[1]?.options).toBeUndefined();

    const mcqRaw = JSON.stringify({
      questions: [
        {
          text: 'Which gas is evolved when acid reacts with zinc?',
          options: ['Oxygen', 'Hydrogen', 'Nitrogen', 'Chlorine'],
          answer: '(b)',
          difficulty: 'easy',
          bloom: 'remember',
          topic: 'Acids',
        },
      ],
    });
    const parsedMcq = parseAndNormalizeAIQuestions(mcqRaw, 'mcq');
    expect(parsedMcq[0]?.answer).toBe('Hydrogen');
  });

  it('retries Gemini empty responses, omits deprecated Gemini 4 params, batches 8-item sections, and tops up filtered duplicates', async () => {
    await repository.settingsRepo.update({
      aiProvider: 'gemini',
      aiModel: 'gemini-4-hydrogen',
      aiApiKey: 'test-key-gem4',
    });

    const samplePrompts = [
      'Define exothermic combination reaction with a balanced equation.',
      'Explain why respiration is considered an exothermic biological process.',
      'State two observable changes when lead nitrate crystals are heated strongly.',
      'Distinguish between aerobic respiration in mitochondria and anaerobic glycolysis.',
      'Why does dry HCl gas fail to turn dry blue litmus paper red?',
      'Describe how plaster of Paris reacts when mixed with water.',
      'Explain the role of villi in absorbing digested nutrients in the small intestine.',
      'How do guard cells regulate the opening and closing of stomatal pores?',
    ];

    const makeBatch = (start: number, count: number) =>
      JSON.stringify({
        questions: Array.from({ length: count }, (_, idx) => {
          const n = start + idx;
          return {
            text: samplePrompts[n - 1] ?? `Distinct science question ${n}`,
            options: [], // Intentionally empty array on short question to ensure it is stripped cleanly
            answer: `Accurate textbook answer for question ${n}.`,
            difficulty: 'medium',
            bloom: 'understand',
            topic: `Topic ${n}`,
          };
        }),
      });

    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi
      .fn()
      // Call 1 (batch 1 of 5 for 8-item section): Gemini returns thought-only/empty first, triggers retry
      .mockImplementationOnce(async (_url, init) => {
        requestBodies.push(JSON.parse(String(init?.body ?? '{}')));
        return {
          ok: true,
          json: async () => ({
            candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ thought: true, text: 'thinking...' }] } }],
          }),
        };
      })
      // Call 2 (retry for batch 1): returns 5 items (one duplicates item 1 to exercise top-up!)
      .mockImplementationOnce(async (_url, init) => {
        requestBodies.push(JSON.parse(String(init?.body ?? '{}')));
        const dupPlusFour = JSON.parse(makeBatch(1, 5)) as { questions: Array<Record<string, unknown>> };
        dupPlusFour.questions[4] = { ...dupPlusFour.questions[0]! };
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify(dupPlusFour) }] } }],
          }),
        };
      })
      // Call 3 (batch 2 asks for remaining 4 items: 8 - 4 = 4)
      .mockImplementationOnce(async (_url, init) => {
        requestBodies.push(JSON.parse(String(init?.body ?? '{}')));
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: makeBatch(5, 4) }] } }],
          }),
        };
      });

    vi.stubGlobal('fetch', fetchMock);

    const bp = createBlankBlueprint();
    bp.sections = [
      {
        ...bp.sections[1]!,
        id: 'sec_eight',
        name: 'Q.3 Answer the following (Attempt any 5 of 8)',
        questionType: 'short',
        count: 5,
        marksPerQuestion: 3,
        choiceRule: { enabled: true, internalChoiceCount: 0, attemptCount: 5, totalCount: 8 },
        sourceMode: 'ai_from_book',
      },
    ];

    const res = await generateQuestionPaperJob(bp, { title: 'SSC Science Gemini 4 Test' });
    expect(res.shortfalls).toEqual([]);
    expect(res.aiGeneratedCount).toBe(8);
    expect(res.paper.sections[0]?.questions).toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const genConfig = (requestBodies[0] as { generationConfig?: Record<string, unknown> })
      .generationConfig;
    expect(genConfig?.temperature).toBeUndefined();
    expect(genConfig?.maxOutputTokens).toBe(8192);
    expect(genConfig?.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(genConfig?.responseSchema).toBeDefined();
  });
});
