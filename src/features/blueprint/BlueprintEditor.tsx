import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, Scale, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Select,
  Textarea,
} from '@/src/components/ui';
import { generateId } from '@/src/lib/utils';
import type {
  BloomLevel,
  BlueprintRecord,
  BlueprintSection,
  BoardType,
  ChapterRecord,
  LanguageCode,
  QuestionType,
} from '@/src/lib/zod-schemas';
import {
  calculateBlueprintSummary,
  getSectionAttemptCount,
  getSectionGeneratedCount,
  getSectionMarks,
  recomputeBlueprintTotalMarks,
} from './blueprint-engine';

const ALL_BLOOM_LEVELS: Array<{ value: BloomLevel; label: string }> = [
  { value: 'remember', label: 'Remember' },
  { value: 'understand', label: 'Understand' },
  { value: 'apply', label: 'Apply' },
  { value: 'analyze', label: 'Analyze' },
  { value: 'evaluate', label: 'Evaluate' },
  { value: 'create', label: 'Create' },
];

export interface BlueprintEditorProps {
  blueprint: BlueprintRecord;
  onChange: (next: BlueprintRecord) => void;
  chapters?: ChapterRecord[];
  selectedBookChapterIds?: string[];
}

type ChoiceMode = 'none' | 'internal' | 'attempt_k_of_n';

function getChoiceMode(section: BlueprintSection): ChoiceMode {
  if (!section.choiceRule.enabled) return 'none';
  if (section.choiceRule.totalCount && section.choiceRule.attemptCount) return 'attempt_k_of_n';
  return 'internal';
}

export function BlueprintEditor({
  blueprint,
  onChange,
  chapters = [],
}: BlueprintEditorProps) {
  const summary = React.useMemo(() => calculateBlueprintSummary(blueprint), [blueprint]);

  const updateBlueprint = (updater: (prev: BlueprintRecord) => BlueprintRecord) => {
    const next = recomputeBlueprintTotalMarks(updater(blueprint));
    onChange(next);
  };

  const updateSection = (secId: string, patch: Partial<BlueprintSection>) => {
    updateBlueprint((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === secId ? { ...s, ...patch } : s)),
    }));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= blueprint.sections.length) return;
    updateBlueprint((prev) => {
      const copy = [...prev.sections];
      const item = copy[idx]!;
      copy[idx] = copy[target]!;
      copy[target] = item;
      return { ...prev, sections: copy };
    });
  };

  const addSection = () => {
    const nextLetter = String.fromCharCode(65 + blueprint.sections.length);
    const newSec: BlueprintSection = {
      id: generateId('sec'),
      name: `Section ${nextLetter} — Short Answer`,
      questionType: 'short',
      count: 4,
      marksPerQuestion: 3,
      choiceRule: { enabled: false, internalChoiceCount: 0 },
      sourceMode: 'mix',
      difficultySplit: { easy: 30, medium: 50, hard: 20 },
      bloomTargets: ['understand', 'apply'],
      chapterIds: [],
    };
    updateBlueprint((prev) => ({
      ...prev,
      sections: [...prev.sections, newSec],
    }));
  };

  const removeSection = (secId: string) => {
    if (blueprint.sections.length <= 1) return;
    updateBlueprint((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== secId),
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Blueprint Forms */}
      <div className="lg:col-span-8 space-y-6">
        {/* Header Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Paper Header &amp; Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bp-title" requiredMark>
                  Blueprint / Paper Title
                </Label>
                <Input
                  id="bp-title"
                  value={blueprint.title}
                  onChange={(e) =>
                    updateBlueprint((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="bp-school">School Name</Label>
                <Input
                  id="bp-school"
                  value={blueprint.header.schoolName}
                  onChange={(e) =>
                    updateBlueprint((prev) => ({
                      ...prev,
                      header: { ...prev.header, schoolName: e.target.value },
                    }))
                  }
                  placeholder="e.g., Kendriya Vidyalaya"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label>Board</Label>
                <Select
                  value={blueprint.header.board}
                  onValueChange={(v) =>
                    updateBlueprint((prev) => ({
                      ...prev,
                      header: { ...prev.header, board: v as BoardType },
                    }))
                  }
                  ariaLabel="Board"
                  options={[
                    { value: 'CBSE', label: 'CBSE' },
                    { value: 'ICSE', label: 'ICSE' },
                    { value: 'MAHARASHTRA', label: 'Maharashtra SSC/HSC' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
              </div>
              <div>
                <Label>Class</Label>
                <Select
                  value={String(blueprint.header.classLevel)}
                  onValueChange={(v) =>
                    updateBlueprint((prev) => ({
                      ...prev,
                      header: { ...prev.header, classLevel: Number(v) },
                    }))
                  }
                  ariaLabel="Class Level"
                  options={Array.from({ length: 12 }, (_, idx) => ({
                    value: String(idx + 1),
                    label: `Class ${idx + 1}`,
                  }))}
                />
              </div>
              <div>
                <Label htmlFor="bp-subject" requiredMark>
                  Subject
                </Label>
                <Input
                  id="bp-subject"
                  value={blueprint.header.subject}
                  onChange={(e) =>
                    updateBlueprint((prev) => ({
                      ...prev,
                      header: { ...prev.header, subject: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label>Paper Language</Label>
                <Select
                  value={blueprint.language}
                  onValueChange={(v) =>
                    updateBlueprint((prev) => ({ ...prev, language: v as LanguageCode }))
                  }
                  ariaLabel="Paper Language"
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'hi', label: 'हिन्दी (Hindi)' },
                    { value: 'mr', label: 'मराठी (Marathi)' },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="bp-exam" requiredMark>
                  Exam Name
                </Label>
                <Input
                  id="bp-exam"
                  value={blueprint.header.examTitle}
                  onChange={(e) =>
                    updateBlueprint((prev) => ({
                      ...prev,
                      header: { ...prev.header, examTitle: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="bp-date">Exam Date (optional)</Label>
                <Input
                  id="bp-date"
                  value={blueprint.header.examDate ?? ''}
                  onChange={(e) =>
                    updateBlueprint((prev) => ({
                      ...prev,
                      header: { ...prev.header, examDate: e.target.value || undefined },
                    }))
                  }
                  placeholder="e.g., 15 March 2026"
                />
              </div>
              <div>
                <Label htmlFor="bp-dur">Duration (minutes)</Label>
                <Input
                  id="bp-dur"
                  type="number"
                  min={10}
                  max={360}
                  value={blueprint.header.durationMinutes}
                  onChange={(e) =>
                    updateBlueprint((prev) => ({
                      ...prev,
                      header: {
                        ...prev.header,
                        durationMinutes: Math.max(10, Number(e.target.value) || 60),
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="bp-instr">General Instructions (one per line)</Label>
              <Textarea
                id="bp-instr"
                rows={3}
                value={blueprint.header.generalInstructions.join('\n')}
                onChange={(e) =>
                  updateBlueprint((prev) => ({
                    ...prev,
                    header: {
                      ...prev.header,
                      generalInstructions: e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean),
                    },
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Question Sections ({blueprint.sections.length})
            </h2>
            <Button size="sm" variant="outline" onClick={addSection} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              Add Section
            </Button>
          </div>

          {blueprint.sections.map((sec, idx) => {
            const choiceMode = getChoiceMode(sec);
            const diffSum =
              sec.difficultySplit.easy + sec.difficultySplit.medium + sec.difficultySplit.hard;
            const secMarks = getSectionMarks(sec);
            const genCount = getSectionGeneratedCount(sec);
            const attemptCount = getSectionAttemptCount(sec);

            return (
              <Card key={sec.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{sec.name || `Section ${idx + 1}`}</CardTitle>
                    <div className="mt-1 text-xs font-mono tabular-nums text-[var(--text-muted)]">
                      Attempt {attemptCount} · Generate {genCount} · {secMarks} Marks
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Move section up"
                      disabled={idx === 0}
                      onClick={() => moveSection(idx, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Move section down"
                      disabled={idx === blueprint.sections.length - 1}
                      onClick={() => moveSection(idx, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Remove section"
                      disabled={blueprint.sections.length <= 1}
                      onClick={() => removeSection(sec.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Section Title</Label>
                      <Input
                        value={sec.name}
                        onChange={(e) => updateSection(sec.id, { name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Question Type</Label>
                      <Select
                        value={sec.questionType}
                        onValueChange={(v) =>
                          updateSection(sec.id, { questionType: v as QuestionType })
                        }
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
                          { value: 'match', label: 'Match the Following' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <Label>Base Count</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={sec.count}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            count: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Marks / Question</Label>
                      <Input
                        type="number"
                        min={0.5}
                        max={50}
                        step={0.5}
                        value={sec.marksPerQuestion}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            marksPerQuestion: Math.max(0.5, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Choice Rule</Label>
                      <Select
                        value={choiceMode}
                        onValueChange={(v) => {
                          const mode = v as ChoiceMode;
                          if (mode === 'none') {
                            updateSection(sec.id, {
                              choiceRule: { enabled: false, internalChoiceCount: 0 },
                            });
                          } else if (mode === 'internal') {
                            updateSection(sec.id, {
                              choiceRule: {
                                enabled: true,
                                internalChoiceCount: Math.min(1, sec.count),
                              },
                            });
                          } else {
                            updateSection(sec.id, {
                              choiceRule: {
                                enabled: true,
                                attemptCount: sec.count,
                                totalCount: sec.count + 2,
                                internalChoiceCount: 0,
                              },
                            });
                          }
                        }}
                        ariaLabel="Choice Rule"
                        options={[
                          { value: 'none', label: 'No Choice (All Compulsory)' },
                          { value: 'internal', label: 'Internal OR Choices' },
                          { value: 'attempt_k_of_n', label: 'Attempt any K of N' },
                        ]}
                      />
                    </div>
                    <div>
                      <Label>Question Source</Label>
                      <Select
                        value={sec.sourceMode}
                        onValueChange={(v) =>
                          updateSection(sec.id, {
                            sourceMode: v as BlueprintSection['sourceMode'],
                          })
                        }
                        ariaLabel="Question Source"
                        options={[
                          { value: 'mix', label: 'Mix (Bank + Gemini AI)' },
                          { value: 'bank_only', label: 'Bank Only (Offline)' },
                          { value: 'ai_from_book', label: 'Gemini AI From Textbook' },
                        ]}
                      />
                    </div>
                  </div>

                  {choiceMode === 'internal' && (
                    <div className="max-w-xs">
                      <Label>Number of Internal OR Questions</Label>
                      <Input
                        type="number"
                        min={1}
                        max={sec.count}
                        value={sec.choiceRule.internalChoiceCount}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            choiceRule: {
                              enabled: true,
                              internalChoiceCount: Math.max(
                                1,
                                Math.min(sec.count, Number(e.target.value) || 1)
                              ),
                            },
                          })
                        }
                      />
                    </div>
                  )}

                  {choiceMode === 'attempt_k_of_n' && (
                    <div className="grid grid-cols-2 gap-3 max-w-sm">
                      <div>
                        <Label>Attempt Count (K)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={sec.choiceRule.totalCount ?? sec.count + 2}
                          value={sec.choiceRule.attemptCount ?? sec.count}
                          onChange={(e) => {
                            const attempt = Math.max(1, Number(e.target.value) || 1);
                            updateSection(sec.id, {
                              count: attempt,
                              choiceRule: {
                                enabled: true,
                                attemptCount: attempt,
                                totalCount: Math.max(attempt, sec.choiceRule.totalCount ?? attempt + 1),
                                internalChoiceCount: 0,
                              },
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Label>Total Provided (N)</Label>
                        <Input
                          type="number"
                          min={sec.choiceRule.attemptCount ?? sec.count}
                          max={50}
                          value={sec.choiceRule.totalCount ?? sec.count + 2}
                          onChange={(e) =>
                            updateSection(sec.id, {
                              choiceRule: {
                                enabled: true,
                                attemptCount: sec.choiceRule.attemptCount ?? sec.count,
                                totalCount: Math.max(
                                  sec.choiceRule.attemptCount ?? sec.count,
                                  Number(e.target.value) || sec.count
                                ),
                                internalChoiceCount: 0,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {/* Difficulty Split */}
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--text-primary)]">
                        Difficulty Split (must total 100%)
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge tone={Math.round(diffSum) === 100 ? 'success' : 'danger'}>
                          {Math.round(diffSum)}%
                        </Badge>
                        {Math.round(diffSum) !== 100 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const hard = Math.max(
                                0,
                                100 - sec.difficultySplit.easy - sec.difficultySplit.medium
                              );
                              updateSection(sec.id, {
                                difficultySplit: {
                                  ...sec.difficultySplit,
                                  hard,
                                },
                              });
                            }}
                            leftIcon={<Scale className="h-3 w-3" />}
                          >
                            Balance
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {(['easy', 'medium', 'hard'] as const).map((level) => (
                        <div key={level}>
                          <Label className="capitalize">{level} %</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={sec.difficultySplit[level]}
                            onChange={(e) =>
                              updateSection(sec.id, {
                                difficultySplit: {
                                  ...sec.difficultySplit,
                                  [level]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                                },
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bloom Targets */}
                  <div>
                    <Label>Bloom&apos;s Taxonomy Targets</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {ALL_BLOOM_LEVELS.map((b) => {
                        const active = sec.bloomTargets.includes(b.value);
                        return (
                          <button
                            key={b.value}
                            type="button"
                            onClick={() => {
                              const next = active
                                ? sec.bloomTargets.filter((x) => x !== b.value)
                                : [...sec.bloomTargets, b.value];
                              updateSection(sec.id, { bloomTargets: next });
                            }}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                              active
                                ? 'border-[var(--brand-600)] bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]'
                                : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                            }`}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Optional Chapter Scope */}
                  {chapters.length > 0 && (
                    <div>
                      <Label>
                        Chapter Weightage Scope{' '}
                        <span className="text-[var(--text-muted)] font-normal">
                          (leave unchecked to include all selected chapters)
                        </span>
                      </Label>
                      <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto rounded-lg border border-[var(--border-hairline)] p-2.5">
                        {chapters.map((ch) => (
                          <Checkbox
                            key={ch.id}
                            checked={sec.chapterIds.includes(ch.id)}
                            onCheckedChange={(checked) => {
                              const nextIds = checked
                                ? [...sec.chapterIds, ch.id]
                                : sec.chapterIds.filter((id) => id !== ch.id);
                              updateSection(sec.id, { chapterIds: nextIds });
                            }}
                            label={ch.title}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Live Sticky Blueprint Summary Sidebar */}
      <div className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Live Blueprint Summary</CardTitle>
            <Badge tone={summary.isValid ? 'success' : 'danger'}>
              {summary.isValid ? 'Valid' : 'Needs Fix'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  Total Marks
                </div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {summary.totalMarks}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  Questions
                </div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {summary.totalAttemptQuestions}
                  {summary.totalGeneratedQuestions > summary.totalAttemptQuestions && (
                    <span className="text-xs font-normal text-[var(--text-muted)] ml-1">
                      ({summary.totalGeneratedQuestions} w/ choices)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-[var(--text-primary)]">Section Breakdown</div>
              {summary.sectionBreakdown.map((sb) => (
                <div
                  key={sb.id}
                  className="flex items-center justify-between gap-2 text-[var(--text-secondary)] border-b border-[var(--border-hairline)] pb-1 last:border-0"
                >
                  <span className="truncate">{sb.name}</span>
                  <span className="font-mono tabular-nums shrink-0">
                    {sb.attemptCount}q · {sb.marks}m
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-[var(--text-primary)]">Weighted Difficulty</div>
              <div className="flex items-center justify-between font-mono tabular-nums text-[var(--text-secondary)]">
                <span>Easy {summary.difficultyPercentages.easy}%</span>
                <span>Medium {summary.difficultyPercentages.medium}%</span>
                <span>Hard {summary.difficultyPercentages.hard}%</span>
              </div>
            </div>

            {summary.errors.length > 0 && (
              <Alert tone="danger" title="Validation issues">
                <ul className="list-disc pl-4 space-y-1">
                  {summary.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {summary.warnings.length > 0 && (
              <Alert tone="warning" title="Pattern notes">
                <ul className="list-disc pl-4 space-y-1">
                  {summary.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
