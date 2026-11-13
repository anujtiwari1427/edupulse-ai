import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankBlueprint } from '@/src/features/blueprint/blueprint-engine';
import { generateParallelSets } from '@/src/features/generation/paper-engine';
import { db } from '@/src/features/storage/db';
import { repository } from '@/src/features/storage/repository';
import type { PaperRecord, QuestionRecord } from '@/src/lib/zod-schemas';
import {
  addQuestionToSection,
  computePaperMarksSummary,
  deleteQuestionFromSection,
  reorderQuestionInSection,
  reshufflePaperSets,
  swapQuestionInSection,
  updatePaperHeader,
  updateQuestionInPaper,
} from '../paper-editor-ops';

function makePaper(): PaperRecord {
  const bp = createBlankBlueprint();
  bp.totalMarks = 4;
  const sections = [
    {
      id: 'sec_a',
      name: 'Section A',
      marksPerQuestion: 2,
      choiceRule: { enabled: false, internalChoiceCount: 0 },
      questions: [
        {
          id: 'q1',
          paperQuestionId: 'pq1',
          order: 0,
          type: 'short' as const,
          text: 'Question 1 original',
          answer: 'Ans 1',
          marks: 2,
          difficulty: 'easy' as const,
          bloom: 'remember' as const,
          topic: 'T1',
          origin: 'bank' as const,
          language: 'en' as const,
          hash: 'h1',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'q2',
          paperQuestionId: 'pq2',
          order: 1,
          type: 'short' as const,
          text: 'Question 2 original',
          answer: 'Ans 2',
          marks: 2,
          difficulty: 'medium' as const,
          bloom: 'understand' as const,
          topic: 'T2',
          origin: 'bank' as const,
          language: 'en' as const,
          hash: 'h2',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
  ];
  return {
    id: 'paper_edit_1',
    title: 'Sample Paper',
    blueprintSnapshot: bp,
    sections,
    sets: generateParallelSets(sections, 11),
    language: 'en',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('Paper Editor Operations & Version Repository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('edits header/questions, tracks live marks delta, reorders, swaps, adds, and deletes safely', () => {
    let paper = makePaper();
    expect(computePaperMarksSummary(paper)).toMatchObject({
      actualMarks: 4,
      targetMarks: 4,
      delta: 0,
      isMatched: true,
    });

    paper = updatePaperHeader(paper, {
      schoolName: 'National Public School',
      title: 'Midterm Science',
    });
    expect(paper.title).toBe('Midterm Science');
    expect(paper.blueprintSnapshot.header.schoolName).toBe('National Public School');

    paper = updateQuestionInPaper(paper, 'sec_a', 'pq1', { marks: 3, text: 'Question 1 updated' });
    expect(computePaperMarksSummary(paper)).toMatchObject({
      actualMarks: 5,
      targetMarks: 4,
      delta: 1,
      isMatched: false,
    });

    paper = reorderQuestionInSection(paper, 'sec_a', 0, 1);
    expect(paper.sections[0]?.questions.map((q) => q.paperQuestionId)).toEqual(['pq2', 'pq1']);
    expect(paper.sets[0]?.questionOrderBySection['sec_a']).toEqual(['pq2', 'pq1']);

    const replacement: QuestionRecord = {
      id: 'q_new',
      type: 'short',
      text: 'Swapped question text',
      answer: 'Swapped answer',
      marks: 2,
      difficulty: 'hard',
      bloom: 'analyze',
      topic: 'Optics',
      origin: 'bank',
      language: 'en',
      hash: 'h_new',
      createdAt: 2,
      updatedAt: 2,
    };
    paper = swapQuestionInSection(paper, 'sec_a', 'pq1', replacement);
    expect(paper.sections[0]?.questions[1]?.text).toBe('Swapped question text');
    const swappedPqId = paper.sections[0]!.questions[1]!.paperQuestionId;
    expect(paper.sets[0]?.questionOrderBySection['sec_a']).toContain(swappedPqId);

    paper = addQuestionToSection(paper, 'sec_a', {
      ...replacement,
      id: 'q_extra',
      text: 'Extra manual',
    });
    expect(paper.sections[0]?.questions).toHaveLength(3);

    paper = deleteQuestionFromSection(paper, 'sec_a', 'pq2');
    expect(paper.sections[0]?.questions).toHaveLength(2);

    const reshuffled = reshufflePaperSets(paper, 99);
    expect(reshuffled.sets).toHaveLength(3);
  });

  it('persists version snapshots, restores older snapshots, and duplicates papers', async () => {
    const p = makePaper();
    await repository.papersRepo.savePaper(p, 'v1 baseline');

    const edited = updateQuestionInPaper(p, 'sec_a', 'pq1', { text: 'Edited v2 stem' });
    await repository.papersRepo.savePaper(edited, 'v2 edited stem');

    const versions = await repository.papersRepo.listPaperVersions(p.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.versionNumber).toBe(2);

    const restored = await repository.papersRepo.restorePaperVersion(p.id, versions[1]!.id);
    expect(restored.sections[0]?.questions[0]?.text).toBe('Question 1 original');

    const dup = await repository.papersRepo.duplicatePaper(p.id);
    expect(dup.id).not.toBe(p.id);
    expect(dup.title).toContain('(Copy)');
    expect(dup.status).toBe('draft');
  });
});
