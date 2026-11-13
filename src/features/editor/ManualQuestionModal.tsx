import * as React from 'react';
import { repository } from '@/src/features/storage/repository';
import { generateId, normalizeQuestionText, sha256Hex } from '@/src/lib/utils';
import type {
  BloomLevel,
  DifficultyLevel,
  LanguageCode,
  QuestionRecord,
  QuestionType,
} from '@/src/lib/zod-schemas';
import { Button, Checkbox, Input, Label, Modal, Select, Textarea } from '@/src/components/ui';

interface ManualQuestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMarks: number;
  language: LanguageCode;
  sectionName: string;
  onAdd: (question: QuestionRecord) => void;
}

export function ManualQuestionModal({
  open,
  onOpenChange,
  defaultMarks,
  language,
  sectionName,
  onAdd,
}: ManualQuestionModalProps) {
  const [type, setType] = React.useState<QuestionType>('short');
  const [text, setText] = React.useState('');
  const [optA, setOptA] = React.useState('');
  const [optB, setOptB] = React.useState('');
  const [optC, setOptC] = React.useState('');
  const [optD, setOptD] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [markingScheme, setMarkingScheme] = React.useState('');
  const [marks, setMarks] = React.useState(String(defaultMarks));
  const [difficulty, setDifficulty] = React.useState<DifficultyLevel>('medium');
  const [bloom, setBloom] = React.useState<BloomLevel>('understand');
  const [topic, setTopic] = React.useState('General');
  const [saveToBank, setSaveToBank] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const needsOptions = type === 'mcq' || type === 'assertion_reason';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (text.trim().length < 5) {
      setError('Enter the question text (at least 5 characters).');
      return;
    }
    const opts = [optA.trim(), optB.trim(), optC.trim(), optD.trim()];
    if (needsOptions && opts.some((o) => !o)) {
      setError('All 4 options are required for MCQ / Assertion-Reason questions.');
      return;
    }
    if (!answer.trim()) {
      setError('Enter the answer or key solution.');
      return;
    }

    const numericMarks = Math.max(0.5, Number(marks) || defaultMarks);
    const now = Date.now();
    const hash = await sha256Hex(normalizeQuestionText(text));

    const record: QuestionRecord = {
      id: generateId('q'),
      type,
      text: text.trim(),
      options: needsOptions ? opts : undefined,
      answer: answer.trim(),
      markingScheme: markingScheme.trim() || undefined,
      marks: numericMarks,
      difficulty,
      bloom,
      topic: topic.trim() || 'General',
      origin: 'manual',
      language,
      hash,
      createdAt: now,
      updatedAt: now,
    };

    if (saveToBank) {
      await repository.libraryRepo.saveQuestions([record]);
    }

    onAdd(record);
    setText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setAnswer('');
    setMarkingScheme('');
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Add Question to ${sectionName}`}
      description="Author a custom question directly on this paper."
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label>Type</Label>
            <Select
              ariaLabel="Type"
              value={type}
              onValueChange={(v) => setType(v as QuestionType)}
              options={[
                { value: 'mcq', label: 'MCQ' },
                { value: 'very_short', label: 'Very Short' },
                { value: 'short', label: 'Short Answer' },
                { value: 'long', label: 'Long Answer' },
                { value: 'case_study', label: 'Case Study' },
                { value: 'assertion_reason', label: 'Assertion-Reason' },
                { value: 'fill_blank', label: 'Fill in the Blank' },
              ]}
            />
          </div>
          <div>
            <Label htmlFor="mq-marks">Marks</Label>
            <Input
              id="mq-marks"
              type="number"
              step="0.5"
              min="0.5"
              max="50"
              value={marks}
              onChange={(e) => setMarks(e.target.value)}
            />
          </div>
          <div>
            <Label>Difficulty</Label>
            <Select
              ariaLabel="Difficulty"
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as DifficultyLevel)}
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
              ariaLabel="Bloom Level"
              value={bloom}
              onValueChange={(v) => setBloom(v as BloomLevel)}
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
        </div>

        <div>
          <Label htmlFor="mq-stem">Question Stem</Label>
          <Textarea
            id="mq-stem"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write the full question..."
          />
        </div>

        {needsOptions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mq-opt-a">Option (a)</Label>
              <Input id="mq-opt-a" value={optA} onChange={(e) => setOptA(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mq-opt-b">Option (b)</Label>
              <Input id="mq-opt-b" value={optB} onChange={(e) => setOptB(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mq-opt-c">Option (c)</Label>
              <Input id="mq-opt-c" value={optC} onChange={(e) => setOptC(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mq-opt-d">Option (d)</Label>
              <Input id="mq-opt-d" value={optD} onChange={(e) => setOptD(e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mq-answer">Correct Answer</Label>
            <Input
              id="mq-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={needsOptions ? 'Exact text of the correct option' : 'Expected answer'}
            />
          </div>
          <div>
            <Label htmlFor="mq-topic">Topic</Label>
            <Input
              id="mq-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Chemical Reactions"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="mq-scheme">Marking Scheme / Value Points (Optional)</Label>
          <Textarea
            id="mq-scheme"
            rows={2}
            value={markingScheme}
            onChange={(e) => setMarkingScheme(e.target.value)}
            placeholder="Stepwise mark breakdown for answer key..."
          />
        </div>

        <Checkbox
          checked={saveToBank}
          onCheckedChange={setSaveToBank}
          label="Also save a copy to my local Question Bank for future papers"
        />

        {error && <p className="text-xs font-medium text-[var(--danger-text)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Add Question</Button>
        </div>
      </form>
    </Modal>
  );
}
