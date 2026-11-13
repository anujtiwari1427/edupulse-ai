import { describe, expect, it } from 'vitest';
import {
  calculateBlueprintSummary,
  createBlankBlueprint,
  getSectionAttemptCount,
  getSectionGeneratedCount,
  getSectionMarks,
} from '../blueprint-engine';

describe('Blueprint Domain Engine & Marks Math', () => {
  it('computes attempt counts, generated counts, and marks across choice rules', () => {
    const bp = createBlankBlueprint({ board: 'ICSE', classLevel: 10, subject: 'Physics' });
    // Replace with compulsory 15x1, internal choice 5+2 OR x2, attempt 4 of 6 x10
    bp.sections = [
      {
        ...bp.sections[0]!,
        id: 's1',
        name: 'Section A',
        count: 15,
        marksPerQuestion: 1,
        choiceRule: { enabled: false, internalChoiceCount: 0 },
      },
      {
        ...bp.sections[1]!,
        id: 's2',
        name: 'Section B (Internal Choices)',
        count: 5,
        marksPerQuestion: 2,
        choiceRule: { enabled: true, internalChoiceCount: 2 },
      },
      {
        ...bp.sections[1]!,
        id: 's3',
        name: 'Section C (Attempt 4 of 6)',
        count: 4,
        marksPerQuestion: 10,
        choiceRule: { enabled: true, attemptCount: 4, totalCount: 6, internalChoiceCount: 0 },
      },
    ];

    expect(getSectionAttemptCount(bp.sections[0]!)).toBe(15);
    expect(getSectionGeneratedCount(bp.sections[0]!)).toBe(15);
    expect(getSectionMarks(bp.sections[0]!)).toBe(15);

    expect(getSectionAttemptCount(bp.sections[1]!)).toBe(5);
    expect(getSectionGeneratedCount(bp.sections[1]!)).toBe(7);
    expect(getSectionMarks(bp.sections[1]!)).toBe(10);

    expect(getSectionAttemptCount(bp.sections[2]!)).toBe(4);
    expect(getSectionGeneratedCount(bp.sections[2]!)).toBe(6);
    expect(getSectionMarks(bp.sections[2]!)).toBe(40);

    const summary = calculateBlueprintSummary(bp);
    expect(summary.isValid).toBe(true);
    expect(summary.totalMarks).toBe(65);
    expect(summary.totalAttemptQuestions).toBe(24);
    expect(summary.totalGeneratedQuestions).toBe(28);
  });

  it('rejects invalid difficulty splits, attemptCount > totalCount, and missing Bloom targets', () => {
    const bp = createBlankBlueprint();
    bp.sections[0] = {
      ...bp.sections[0]!,
      difficultySplit: { easy: 50, medium: 50, hard: 20 },
      bloomTargets: [],
      choiceRule: { enabled: true, attemptCount: 5, totalCount: 3, internalChoiceCount: 0 },
    };

    const summary = calculateBlueprintSummary(bp);
    expect(summary.isValid).toBe(false);
    expect(summary.errors.some((e) => e.includes('100%'))).toBe(true);
    expect(summary.errors.some((e) => e.includes('Bloom'))).toBe(true);
    expect(summary.errors.some((e) => e.includes('cannot exceed total questions'))).toBe(true);
  });
});
