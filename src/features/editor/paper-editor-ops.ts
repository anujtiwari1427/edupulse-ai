import { generateParallelSets } from '@/src/features/generation/paper-engine';
import { generateId } from '@/src/lib/utils';
import type {
  BlueprintHeader,
  PaperQuestion,
  PaperRecord,
  PaperSet,
  QuestionRecord,
} from '@/src/lib/zod-schemas';

export interface PaperMarksSummary {
  actualMarks: number;
  targetMarks: number;
  delta: number;
  isMatched: boolean;
  totalQuestions: number;
}

export function computePaperMarksSummary(paper: PaperRecord): PaperMarksSummary {
  let actualMarks = 0;
  let totalQuestions = 0;

  for (const sec of paper.sections) {
    const primaries = sec.questions.filter((q) => !q.alternativeToId);
    totalQuestions += primaries.length;

    if (sec.choiceRule.enabled && sec.choiceRule.attemptCount) {
      const attemptCount = Math.min(sec.choiceRule.attemptCount, primaries.length);
      for (let i = 0; i < attemptCount; i++) {
        actualMarks += primaries[i]?.marks ?? sec.marksPerQuestion;
      }
    } else {
      for (const q of primaries) {
        actualMarks += q.marks;
      }
    }
  }

  actualMarks = Number(actualMarks.toFixed(2));
  const targetMarks = Number(paper.blueprintSnapshot.totalMarks.toFixed(2));
  const delta = Number((actualMarks - targetMarks).toFixed(2));

  return {
    actualMarks,
    targetMarks,
    delta,
    isMatched: Math.abs(delta) < 0.01,
    totalQuestions,
  };
}

export function updatePaperHeader(
  paper: PaperRecord,
  patch: Partial<BlueprintHeader> & { title?: string }
): PaperRecord {
  const { title, ...headerPatch } = patch;
  return {
    ...paper,
    title: title ?? paper.title,
    blueprintSnapshot: {
      ...paper.blueprintSnapshot,
      header: {
        ...paper.blueprintSnapshot.header,
        ...headerPatch,
      },
      updatedAt: Date.now(),
    },
    updatedAt: Date.now(),
  };
}

export function updateQuestionInPaper(
  paper: PaperRecord,
  sectionId: string,
  paperQuestionId: string,
  patch: Partial<PaperQuestion>
): PaperRecord {
  return {
    ...paper,
    sections: paper.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        questions: sec.questions.map((q) =>
          q.paperQuestionId === paperQuestionId ? { ...q, ...patch, updatedAt: Date.now() } : q
        ),
      };
    }),
    updatedAt: Date.now(),
  };
}

export function reorderQuestionInSection(
  paper: PaperRecord,
  sectionId: string,
  fromIndex: number,
  toIndex: number
): PaperRecord {
  if (fromIndex === toIndex) return paper;
  let reorderedIds: string[] = [];

  const nextSections = paper.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= sec.questions.length ||
      toIndex >= sec.questions.length
    ) {
      reorderedIds = sec.questions.map((q) => q.paperQuestionId);
      return sec;
    }
    const copy = [...sec.questions];
    const [moved] = copy.splice(fromIndex, 1);
    if (!moved) {
      reorderedIds = sec.questions.map((q) => q.paperQuestionId);
      return sec;
    }
    copy.splice(toIndex, 0, moved);
    const normalized = copy.map((q, idx) => ({ ...q, order: idx }));
    reorderedIds = normalized.map((q) => q.paperQuestionId);
    return { ...sec, questions: normalized };
  });

  const nextSets: PaperSet[] = paper.sets.map((s) =>
    s.code === 'A'
      ? {
          ...s,
          questionOrderBySection: {
            ...s.questionOrderBySection,
            [sectionId]: reorderedIds,
          },
        }
      : s
  );

  return {
    ...paper,
    sections: nextSections,
    sets: nextSets,
    updatedAt: Date.now(),
  };
}

export function swapQuestionInSection(
  paper: PaperRecord,
  sectionId: string,
  oldPaperQuestionId: string,
  replacement: QuestionRecord
): PaperRecord {
  const newPaperQuestionId = generateId('pq');

  const nextSections = paper.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;
    return {
      ...sec,
      questions: sec.questions.map((q) => {
        if (q.paperQuestionId === oldPaperQuestionId) {
          return {
            ...replacement,
            paperQuestionId: newPaperQuestionId,
            order: q.order,
            marks: q.marks,
            alternativeToId: q.alternativeToId,
          };
        }
        if (q.alternativeToId === oldPaperQuestionId) {
          return {
            ...q,
            alternativeToId: newPaperQuestionId,
          };
        }
        return q;
      }),
    };
  });

  const nextSets: PaperSet[] = paper.sets.map((s) => {
    const existingOrder = s.questionOrderBySection[sectionId] ?? [];
    const updatedOrder = existingOrder.map((id) =>
      id === oldPaperQuestionId ? newPaperQuestionId : id
    );
    const nextOptionOrder = { ...s.optionOrderByQuestion };
    delete nextOptionOrder[oldPaperQuestionId];
    if (replacement.options && replacement.options.length === 4) {
      nextOptionOrder[newPaperQuestionId] =
        s.code === 'A' ? [0, 1, 2, 3] : s.code === 'B' ? [2, 0, 3, 1] : [3, 1, 0, 2];
    }
    return {
      ...s,
      questionOrderBySection: {
        ...s.questionOrderBySection,
        [sectionId]: updatedOrder,
      },
      optionOrderByQuestion: nextOptionOrder,
    };
  });

  return {
    ...paper,
    sections: nextSections,
    sets: nextSets,
    updatedAt: Date.now(),
  };
}

export function addQuestionToSection(
  paper: PaperRecord,
  sectionId: string,
  question: QuestionRecord
): PaperRecord {
  const newPaperQuestionId = generateId('pq');

  const nextSections = paper.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;
    const nextItem: PaperQuestion = {
      ...question,
      paperQuestionId: newPaperQuestionId,
      order: sec.questions.length,
    };
    return {
      ...sec,
      questions: [...sec.questions, nextItem],
    };
  });

  const nextSets: PaperSet[] = paper.sets.map((s) => {
    const existingOrder = s.questionOrderBySection[sectionId] ?? [];
    const nextOptionOrder = { ...s.optionOrderByQuestion };
    if (question.options && question.options.length === 4) {
      nextOptionOrder[newPaperQuestionId] =
        s.code === 'A' ? [0, 1, 2, 3] : s.code === 'B' ? [1, 3, 0, 2] : [2, 0, 3, 1];
    }
    return {
      ...s,
      questionOrderBySection: {
        ...s.questionOrderBySection,
        [sectionId]: [...existingOrder, newPaperQuestionId],
      },
      optionOrderByQuestion: nextOptionOrder,
    };
  });

  return {
    ...paper,
    sections: nextSections,
    sets: nextSets,
    updatedAt: Date.now(),
  };
}

export function deleteQuestionFromSection(
  paper: PaperRecord,
  sectionId: string,
  paperQuestionId: string
): PaperRecord {
  const nextSections = paper.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;
    const filtered = sec.questions
      .filter((q) => q.paperQuestionId !== paperQuestionId)
      .map((q, idx) => ({
        ...q,
        order: idx,
        alternativeToId: q.alternativeToId === paperQuestionId ? undefined : q.alternativeToId,
      }));
    return {
      ...sec,
      questions: filtered,
    };
  });

  const nextSets: PaperSet[] = paper.sets.map((s) => {
    const existingOrder = s.questionOrderBySection[sectionId] ?? [];
    const nextOptionOrder = { ...s.optionOrderByQuestion };
    delete nextOptionOrder[paperQuestionId];
    return {
      ...s,
      questionOrderBySection: {
        ...s.questionOrderBySection,
        [sectionId]: existingOrder.filter((id) => id !== paperQuestionId),
      },
      optionOrderByQuestion: nextOptionOrder,
    };
  });

  return {
    ...paper,
    sections: nextSections,
    sets: nextSets,
    updatedAt: Date.now(),
  };
}

export function reshufflePaperSets(paper: PaperRecord, seed?: number): PaperRecord {
  return {
    ...paper,
    sets: generateParallelSets(paper.sections, seed ?? Math.floor(Date.now() % 100000)),
    updatedAt: Date.now(),
  };
}
