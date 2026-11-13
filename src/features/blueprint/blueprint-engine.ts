import { generateId } from '@/src/lib/utils';
import type {
  BloomLevel,
  BoardType,
  BlueprintRecord,
  BlueprintSection,
  DifficultyLevel,
  LanguageCode,
} from '@/src/lib/zod-schemas';

export interface BlueprintSummary {
  totalMarks: number;
  totalAttemptQuestions: number;
  totalGeneratedQuestions: number;
  difficultyCounts: Record<DifficultyLevel, number>;
  difficultyPercentages: Record<DifficultyLevel, number>;
  bloomCoverage: BloomLevel[];
  sectionBreakdown: Array<{
    id: string;
    name: string;
    attemptCount: number;
    generatedCount: number;
    marks: number;
  }>;
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export function getSectionAttemptCount(section: BlueprintSection): number {
  if (section.choiceRule.enabled && section.choiceRule.attemptCount) {
    return Math.max(1, section.choiceRule.attemptCount);
  }
  return Math.max(1, section.count);
}

export function getSectionGeneratedCount(section: BlueprintSection): number {
  const attempt = getSectionAttemptCount(section);
  if (section.choiceRule.enabled && section.choiceRule.totalCount) {
    return Math.max(attempt, section.choiceRule.totalCount);
  }
  if (section.choiceRule.enabled && section.choiceRule.internalChoiceCount > 0) {
    return section.count + section.choiceRule.internalChoiceCount;
  }
  return section.count;
}

export function getSectionMarks(section: BlueprintSection): number {
  return Number((getSectionAttemptCount(section) * section.marksPerQuestion).toFixed(2));
}

export function recomputeBlueprintTotalMarks(blueprint: BlueprintRecord): BlueprintRecord {
  const totalMarks = Number(
    blueprint.sections.reduce((sum, s) => sum + getSectionMarks(s), 0).toFixed(2)
  );
  return {
    ...blueprint,
    totalMarks: Math.max(1, totalMarks),
  };
}

export function calculateBlueprintSummary(blueprint: BlueprintRecord): BlueprintSummary {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!blueprint.header.subject.trim()) {
    errors.push('Subject is required in paper header.');
  }
  if (!blueprint.header.examTitle.trim()) {
    errors.push('Exam title is required in paper header.');
  }
  if (blueprint.header.classLevel < 1 || blueprint.header.classLevel > 12) {
    errors.push('Class level must be between 1 and 12.');
  }
  if (blueprint.header.durationMinutes < 10 || blueprint.header.durationMinutes > 360) {
    errors.push('Duration must be between 10 and 360 minutes.');
  }
  if (blueprint.sections.length === 0) {
    errors.push('Add at least one section to the blueprint.');
  }

  let totalMarks = 0;
  let totalAttemptQuestions = 0;
  let totalGeneratedQuestions = 0;
  let weightedEasy = 0;
  let weightedMedium = 0;
  let weightedHard = 0;
  const bloomSet = new Set<BloomLevel>();

  const sectionBreakdown = blueprint.sections.map((section, idx) => {
    const label = section.name.trim() || `Section ${idx + 1}`;
    const attemptCount = getSectionAttemptCount(section);
    const generatedCount = getSectionGeneratedCount(section);
    const marks = getSectionMarks(section);

    if (!section.name.trim()) {
      errors.push(`Section ${idx + 1} needs a name.`);
    }
    if (section.marksPerQuestion <= 0) {
      errors.push(`${label}: Marks per question must be greater than 0.`);
    }
    if (section.count < 1) {
      errors.push(`${label}: Question count must be at least 1.`);
    }

    const diffSum =
      section.difficultySplit.easy +
      section.difficultySplit.medium +
      section.difficultySplit.hard;
    if (Math.round(diffSum) !== 100) {
      errors.push(
        `${label}: Difficulty split must sum to 100% (currently ${Math.round(diffSum)}%).`
      );
    }

    if (section.bloomTargets.length === 0) {
      errors.push(`${label}: Select at least one Bloom taxonomy level.`);
    }

    if (section.choiceRule.enabled) {
      if (
        section.choiceRule.attemptCount !== undefined &&
        section.choiceRule.totalCount !== undefined &&
        section.choiceRule.attemptCount > section.choiceRule.totalCount
      ) {
        errors.push(
          `${label}: Attempt count (${section.choiceRule.attemptCount}) cannot exceed total questions (${section.choiceRule.totalCount}).`
        );
      }
      if (section.choiceRule.internalChoiceCount > section.count) {
        errors.push(
          `${label}: Internal OR choices (${section.choiceRule.internalChoiceCount}) cannot exceed question count (${section.count}).`
        );
      }
    }

    if (section.questionType === 'mcq' && section.marksPerQuestion > 2) {
      warnings.push(`${label}: MCQs normally carry 1–2 marks per question.`);
    }

    totalMarks += marks;
    totalAttemptQuestions += attemptCount;
    totalGeneratedQuestions += generatedCount;

    weightedEasy += marks * (section.difficultySplit.easy / 100);
    weightedMedium += marks * (section.difficultySplit.medium / 100);
    weightedHard += marks * (section.difficultySplit.hard / 100);
    section.bloomTargets.forEach((b) => bloomSet.add(b));

    return {
      id: section.id,
      name: label,
      attemptCount,
      generatedCount,
      marks,
    };
  });

  const safeMarks = Math.max(1, totalMarks);
  const easyPct = Math.round((weightedEasy / safeMarks) * 100);
  const mediumPct = Math.round((weightedMedium / safeMarks) * 100);
  const hardPct = Math.max(0, 100 - easyPct - mediumPct);

  const easyCount = Math.round((totalGeneratedQuestions * easyPct) / 100);
  const mediumCount = Math.round((totalGeneratedQuestions * mediumPct) / 100);
  const hardCount = Math.max(0, totalGeneratedQuestions - easyCount - mediumCount);

  return {
    totalMarks: Number(totalMarks.toFixed(2)),
    totalAttemptQuestions,
    totalGeneratedQuestions,
    difficultyCounts: {
      easy: easyCount,
      medium: mediumCount,
      hard: hardCount,
    },
    difficultyPercentages: {
      easy: easyPct,
      medium: mediumPct,
      hard: hardPct,
    },
    bloomCoverage: Array.from(bloomSet),
    sectionBreakdown,
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

export function createBlankBlueprint(opts?: {
  schoolName?: string;
  board?: BoardType;
  classLevel?: number;
  subject?: string;
  language?: LanguageCode;
}): BlueprintRecord {
  const now = Date.now();
  return {
    id: generateId('bp'),
    title: `${opts?.board ?? 'CBSE'} Class ${opts?.classLevel ?? 10} ${opts?.subject ?? 'Science'} Paper`,
    language: opts?.language ?? 'en',
    totalMarks: 20,
    createdAt: now,
    updatedAt: now,
    header: {
      schoolName: opts?.schoolName ?? '',
      board: opts?.board ?? 'CBSE',
      classLevel: opts?.classLevel ?? 10,
      subject: opts?.subject ?? 'Science',
      examTitle: 'Periodic Assessment',
      durationMinutes: 60,
      generalInstructions: [
        'All questions are compulsory.',
        'Marks for each question are indicated against it.',
      ],
    },
    sections: [
      {
        id: generateId('sec'),
        name: 'Section A — Objective Questions',
        questionType: 'mcq',
        count: 5,
        marksPerQuestion: 1,
        choiceRule: { enabled: false, internalChoiceCount: 0 },
        sourceMode: 'mix',
        difficultySplit: { easy: 40, medium: 40, hard: 20 },
        bloomTargets: ['remember', 'understand'],
        chapterIds: [],
      },
      {
        id: generateId('sec'),
        name: 'Section B — Short Answer Questions',
        questionType: 'short',
        count: 5,
        marksPerQuestion: 3,
        choiceRule: { enabled: false, internalChoiceCount: 0 },
        sourceMode: 'mix',
        difficultySplit: { easy: 20, medium: 60, hard: 20 },
        bloomTargets: ['understand', 'apply'],
        chapterIds: [],
      },
    ],
  };
}
