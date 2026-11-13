import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { repository } from '@/src/features/storage/repository';
import { normalizeQuestionText } from '@/src/lib/utils';
import type { QuestionRecord } from '@/src/lib/zod-schemas';
import { Button, Input, MetaLine, Modal, Select } from '@/src/components/ui';

const EMPTY_QUESTIONS: QuestionRecord[] = [];

interface BankSwapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPaperTexts: string[];
  preferredMarks?: number;
  onSelect: (question: QuestionRecord) => void;
}

export function BankSwapModal({
  open,
  onOpenChange,
  existingPaperTexts,
  preferredMarks,
  onSelect,
}: BankSwapModalProps) {
  const questions =
    useLiveQuery(() => repository.libraryRepo.listQuestions(), [], EMPTY_QUESTIONS) ??
    EMPTY_QUESTIONS;

  const [query, setQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');

  const existingNorms = React.useMemo(
    () => new Set(existingPaperTexts.map((t) => normalizeQuestionText(t))),
    [existingPaperTexts]
  );

  const filtered = React.useMemo(() => {
    const qLower = query.trim().toLowerCase();
    return questions.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (qLower) {
        const hay = `${item.text} ${item.topic} ${item.answer}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [questions, query, typeFilter]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Swap Question from Local Bank"
      description="Choose a verified question from your device's indexed Question Bank."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              aria-label="Search bank questions"
              placeholder="Search by keyword, topic, or answer..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leftAdornment={<Search className="h-4 w-4" />}
            />
          </div>
          <Select
            ariaLabel="Filter question type"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'mcq', label: 'MCQ' },
              { value: 'very_short', label: 'Very Short' },
              { value: 'short', label: 'Short Answer' },
              { value: 'long', label: 'Long Answer' },
              { value: 'case_study', label: 'Case Study' },
              { value: 'assertion_reason', label: 'Assertion-Reason' },
            ]}
          />
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-lg">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--text-secondary)]">
              No matching questions found in your local bank.
            </div>
          ) : (
            filtered.slice(0, 60).map((item) => {
              const alreadyOnPaper = existingNorms.has(normalizeQuestionText(item.text));
              const marksMatch = preferredMarks === undefined || item.marks === preferredMarks;
              return (
                <div
                  key={item.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)]"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-[var(--text-primary)] line-clamp-2">{item.text}</p>
                    <MetaLine
                      items={[
                        item.type.replace('_', ' '),
                        `${item.marks} Marks${marksMatch ? '' : ' (will adapt)'}`,
                        item.difficulty,
                        item.bloom,
                        item.topic,
                        alreadyOnPaper ? 'Already in paper' : item.origin.toUpperCase(),
                      ]}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={alreadyOnPaper ? 'ghost' : 'outline'}
                    onClick={() => {
                      onSelect(item);
                      onOpenChange(false);
                    }}
                  >
                    Use Question
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
