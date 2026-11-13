import * as React from 'react';
import { Alert, Button, Input, Label, Modal, Select, Textarea } from '@/src/components/ui';
import { repository } from '@/src/features/storage/repository';
import { generateId, normalizeQuestionText, sha256Hex } from '@/src/lib/utils';
import {
  QuestionSchema,
  type BloomLevel,
  type ChapterRecord,
  type DifficultyLevel,
  type LanguageCode,
  type QuestionRecord,
  type QuestionType,
} from '@/src/lib/zod-schemas';
import { useUIStore } from '@/src/app/store';

export interface QuestionEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestion?: QuestionRecord | null;
  chapters: ChapterRecord[];
}

export function QuestionEditorModal(props: QuestionEditorModalProps) {
  if (!props.open) return null;
  return (
    <QuestionEditorModalInner key={props.initialQuestion?.id ?? 'new'} {...props} />
  );
}

function QuestionEditorModalInner({
  open,
  onOpenChange,
  initialQuestion,
  chapters,
}: QuestionEditorModalProps) {
  const addToast = useUIStore((s) => s.addToast);

  const [type, setType] = React.useState<QuestionType>(initialQuestion?.type ?? 'short');
  const [text, setText] = React.useState(initialQuestion?.text ?? '');
  const [optA, setOptA] = React.useState(initialQuestion?.options?.[0] ?? '');
  const [optB, setOptB] = React.useState(initialQuestion?.options?.[1] ?? '');
  const [optC, setOptC] = React.useState(initialQuestion?.options?.[2] ?? '');
  const [optD, setOptD] = React.useState(initialQuestion?.options?.[3] ?? '');
  const [answer, setAnswer] = React.useState(initialQuestion?.answer ?? '');
  const [markingScheme, setMarkingScheme] = React.useState(initialQuestion?.markingScheme ?? '');
  const [marks, setMarks] = React.useState(String(initialQuestion?.marks ?? 2));
  const [difficulty, setDifficulty] = React.useState<DifficultyLevel>(
    initialQuestion?.difficulty ?? 'medium'
  );
  const [bloom, setBloom] = React.useState<BloomLevel>(initialQuestion?.bloom ?? 'understand');
  const [topic, setTopic] = React.useState(initialQuestion?.topic ?? '');
  const [chapterId, setChapterId] = React.useState(
    initialQuestion?.chapterId ?? chapters[0]?.id ?? ''
  );
  const [language, setLanguage] = React.useState<LanguageCode>(initialQuestion?.language ?? 'en');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const needsOptions = type === 'mcq' || type === 'assertion_reason';

  const handleSave = async () => {
    setError(null);
    const trimmedText = text.trim();
    if (trimmedText.length < 4) {
      setError('Question text must be at least 4 characters.');
      return;
    }

    const opts = needsOptions
      ? [optA.trim(), optB.trim(), optC.trim(), optD.trim()]
      : undefined;
    if (needsOptions && opts?.some((o) => o.length === 0)) {
      setError('MCQ and Assertion-Reason questions require all 4 non-empty options.');
      return;
    }

    if (!answer.trim()) {
      setError('Please provide the model answer.');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const matchedChapter = chapters.find((c) => c.id === chapterId);
      const hash = await sha256Hex(normalizeQuestionText(trimmedText));

      const record = QuestionSchema.parse({
        id: initialQuestion?.id ?? generateId('q'),
        bookId: initialQuestion?.bookId ?? matchedChapter?.bookId,
        chapterId: chapterId || undefined,
        type,
        text: trimmedText,
        options: opts,
        answer: answer.trim(),
        markingScheme: markingScheme.trim() || undefined,
        marks: Math.max(0.5, Number(marks) || 1),
        difficulty,
        bloom,
        topic: topic.trim() || matchedChapter?.title || 'General',
        sourcePage: initialQuestion?.sourcePage,
        origin: initialQuestion?.origin ?? 'manual',
        language,
        hash,
        createdAt: initialQuestion?.createdAt ?? now,
        updatedAt: now,
      });

      await repository.libraryRepo.saveQuestions([record]);
      addToast({
        title: initialQuestion ? 'Question updated' : 'Question added to bank',
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid question fields.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={initialQuestion ? 'Edit Question' : 'Add Manual Question'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={() => void handleSave()}>
            Save Question
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Question Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as QuestionType)}
              ariaLabel="Question Type"
              options={[
                { value: 'mcq', label: 'MCQ (4 Options)' },
                { value: 'assertion_reason', label: 'Assertion-Reason' },
                { value: 'very_short', label: 'Very Short Answer' },
                { value: 'short', label: 'Short Answer' },
                { value: 'long', label: 'Long Answer' },
                { value: 'case_study', label: 'Case Study' },
                { value: 'fill_blank', label: 'Fill in the Blank' },
                { value: 'true_false', label: 'True / False' },
              ]}
            />
          </div>
          <div>
            <Label htmlFor="q-marks">Marks</Label>
            <Input
              id="q-marks"
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={marks}
              onChange={(e) => setMarks(e.target.value)}
            />
          </div>
          <div>
            <Label>Language</Label>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as LanguageCode)}
              ariaLabel="Language"
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'Hindi' },
                { value: 'mr', label: 'Marathi' },
              ]}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="q-text" requiredMark>
            Question Stem
          </Label>
          <Textarea
            id="q-text"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write the question clearly…"
          />
        </div>

        {needsOptions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="q-opta">Option (a)</Label>
              <Input id="q-opta" value={optA} onChange={(e) => setOptA(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="q-optb">Option (b)</Label>
              <Input id="q-optb" value={optB} onChange={(e) => setOptB(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="q-optc">Option (c)</Label>
              <Input id="q-optc" value={optC} onChange={(e) => setOptC(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="q-optd">Option (d)</Label>
              <Input id="q-optd" value={optD} onChange={(e) => setOptD(e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="q-answer" requiredMark>
              Answer
            </Label>
            <Textarea
              id="q-answer"
              rows={2}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="q-ms">Marking Scheme (optional)</Label>
            <Textarea
              id="q-ms"
              rows={2}
              value={markingScheme}
              onChange={(e) => setMarkingScheme(e.target.value)}
              placeholder="e.g., 1 mark for formula, 1 mark for calculation"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label>Difficulty</Label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as DifficultyLevel)}
              ariaLabel="Difficulty"
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
          </div>
          <div>
            <Label>Bloom Level</Label>
            <Select
              value={bloom}
              onValueChange={(v) => setBloom(v as BloomLevel)}
              ariaLabel="Bloom Level"
              options={[
                { value: 'remember', label: 'Remember' },
                { value: 'understand', label: 'Understand' },
                { value: 'apply', label: 'Apply' },
                { value: 'analyze', label: 'Analyze' },
                { value: 'evaluate', label: 'Evaluate' },
                { value: 'create', label: 'Create' },
              ]}
            />
          </div>
          <div>
            <Label htmlFor="q-topic">Topic</Label>
            <Input
              id="q-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., pH scale"
            />
          </div>
          <div>
            <Label>Chapter</Label>
            <Select
              value={chapterId || 'none'}
              onValueChange={(v) => setChapterId(v === 'none' ? '' : v)}
              ariaLabel="Chapter"
              options={[
                { value: 'none', label: 'Unassigned' },
                ...chapters.map((c) => ({ value: c.id, label: c.title })),
              ]}
            />
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}
