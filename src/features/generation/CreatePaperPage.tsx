import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  LayoutTemplate,
  Sparkles,
  Square,
} from 'lucide-react';
import { db } from '@/src/features/storage/db';
import { repository } from '@/src/features/storage/repository';
import { loadSampleClass10Library } from '@/src/features/storage/sample-data';
import {
  calculateBlueprintSummary,
  createBlankBlueprint,
} from '@/src/features/blueprint/blueprint-engine';
import { BlueprintEditor } from '@/src/features/blueprint/BlueprintEditor';
import { ChapterSelectDropdown } from '@/src/features/library/ChapterSelectDropdown';
import { getErrorMessage } from '@/src/lib/errors';
import { cn, generateId } from '@/src/lib/utils';
import type {
  BlueprintRecord,
  BookRecord,
  ChapterRecord,
  ChunkRecord,
  QuestionRecord,
  TemplateRecord,
} from '@/src/lib/zod-schemas';
import { useUIStore } from '@/src/app/store';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  MetaLine,
  Progress,
} from '@/src/components/ui';
import { isAIConfigured } from './ai-providers';
import {
  cancelGenerationJob,
  generateQuestionPaperJob,
  type GenerationProgressUpdate,
  type GenerationResult,
} from './generation-service';
import { estimateGenerationTokens } from './paper-engine';

const EMPTY_BOOKS: BookRecord[] = [];
const EMPTY_CHAPTERS: ChapterRecord[] = [];
const EMPTY_CHUNKS: ChunkRecord[] = [];
const EMPTY_QUESTIONS: QuestionRecord[] = [];
const EMPTY_TEMPLATES: TemplateRecord[] = [];

const STEPS = [
  { id: 1, label: '1. Source & Chapters' },
  { id: 2, label: '2. Blueprint & Sections' },
  { id: 3, label: '3. Review & Estimate' },
  { id: 4, label: '4. Generate' },
] as const;

export function CreatePaperPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTemplateId = searchParams.get('templateId');
  const initialBookId = searchParams.get('bookId');
  const initialChapters = searchParams.get('chapters')?.split(',').filter(Boolean);
  const addToast = useUIStore((s) => s.addToast);

  const books = useLiveQuery(() => repository.libraryRepo.listBooks(), [], EMPTY_BOOKS);
  const chapters = useLiveQuery(() => db.chapters.orderBy('order').toArray(), [], EMPTY_CHAPTERS);
  const chunks = useLiveQuery(() => db.chunks.toArray(), [], EMPTY_CHUNKS);
  const questions = useLiveQuery(() => repository.libraryRepo.listQuestions(), [], EMPTY_QUESTIONS);
  const templates = useLiveQuery(() => repository.papersRepo.listTemplates(), [], EMPTY_TEMPLATES);
  const settings = useLiveQuery(() => repository.settingsRepo.get(), []);

  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(initialTemplateId ? 2 : 1);
  const [selectedBookIds, setSelectedBookIds] = React.useState<string[]>(() =>
    initialBookId ? [initialBookId] : []
  );
  const [selectedChapterIds, setSelectedChapterIds] = React.useState<string[]>(
    () => initialChapters ?? []
  );
  const [blueprint, setBlueprint] = React.useState<BlueprintRecord>(() => createBlankBlueprint());
  const [appliedTemplateId, setAppliedTemplateId] = React.useState<string>('blank');

  const [loadingSample, setLoadingSample] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<GenerationProgressUpdate>({
    stage: 'Ready',
    progress: 0,
  });
  const [genError, setGenError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GenerationResult | null>(null);

  const applyTemplate = React.useCallback(
    (tpl: TemplateRecord) => {
      const now = Date.now();
      const cloned: BlueprintRecord = {
        ...tpl.blueprint,
        id: generateId('bp'),
        title: tpl.blueprint.title,
        createdAt: now,
        updatedAt: now,
        header: {
          ...tpl.blueprint.header,
          schoolName: settings?.schoolName || tpl.blueprint.header.schoolName,
          logoFileId: settings?.schoolLogoFileId || tpl.blueprint.header.logoFileId,
        },
        sections: tpl.blueprint.sections.map((s) => ({
          ...s,
          id: generateId('sec'),
          chapterIds:
            selectedChapterIds.length > 0 ? [...selectedChapterIds] : [...s.chapterIds],
        })),
      };
      setBlueprint(cloned);
      setAppliedTemplateId(tpl.id);
    },
    [settings?.schoolName, settings?.schoolLogoFileId, selectedChapterIds]
  );

  // Pre-load template when arriving via /app/create?templateId=...
  React.useEffect(() => {
    if (!initialTemplateId) return;
    let active = true;
    void Promise.all([
      repository.papersRepo.listTemplates(),
      repository.settingsRepo.get(),
    ]).then(([list, curSettings]) => {
      if (!active) return;
      const found = list.find((t) => t.id === initialTemplateId);
      if (!found) return;
      const now = Date.now();
      setBlueprint({
        ...found.blueprint,
        id: generateId('bp'),
        title: found.blueprint.title,
        createdAt: now,
        updatedAt: now,
        header: {
          ...found.blueprint.header,
          schoolName: curSettings.schoolName || found.blueprint.header.schoolName,
          logoFileId: curSettings.schoolLogoFileId || found.blueprint.header.logoFileId,
        },
        sections: found.blueprint.sections.map((s) => ({
          ...s,
          id: generateId('sec'),
        })),
      });
      setAppliedTemplateId(found.id);
    });
    return () => {
      active = false;
    };
  }, [initialTemplateId]);

  const scopedChapters = React.useMemo(() => {
    if (selectedBookIds.length === 0) return chapters;
    const set = new Set(selectedBookIds);
    return chapters.filter((c) => set.has(c.bookId));
  }, [chapters, selectedBookIds]);

  const effectiveBlueprint = React.useMemo<BlueprintRecord>(() => {
    if (selectedChapterIds.length === 0) return blueprint;
    return {
      ...blueprint,
      sections: blueprint.sections.map((sec) => ({
        ...sec,
        chapterIds: sec.chapterIds.length > 0 ? sec.chapterIds : selectedChapterIds,
      })),
    };
  }, [blueprint, selectedChapterIds]);

  const summary = React.useMemo(
    () => calculateBlueprintSummary(effectiveBlueprint),
    [effectiveBlueprint]
  );

  const aiEnabled = settings ? isAIConfigured(settings) : false;

  const tokenEstimate = React.useMemo(
    () => estimateGenerationTokens(effectiveBlueprint, questions, chunks, chapters, aiEnabled),
    [effectiveBlueprint, questions, chunks, chapters, aiEnabled]
  );

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      const res = await loadSampleClass10Library();
      addToast({
        title: 'Sample Class 10 Science library loaded',
        description: `Added NCERT chapters and ${res.questionsAdded} questions.`,
        variant: 'success',
      });
    } finally {
      setLoadingSample(false);
    }
  };

  const handleStartGeneration = async () => {
    if (!summary.isValid) {
      addToast({
        title: 'Blueprint needs attention',
        description: summary.errors[0],
        variant: 'danger',
      });
      return;
    }

    setStep(4);
    setGenerating(true);
    setGenError(null);
    setResult(null);
    setProgress({ stage: 'Preparing sections and local bank selection…', progress: 8 });

    try {
      const savedBlueprint = await repository.papersRepo.saveBlueprint(effectiveBlueprint);
      const genResult = await generateQuestionPaperJob(savedBlueprint, {
        title: effectiveBlueprint.title,
        onJobCreated: (id) => setActiveJobId(id),
        onProgress: (upd) => setProgress(upd),
      });
      setResult(genResult);
      addToast({
        title: 'Question paper draft created',
        description: genResult.paper.title,
        variant: 'success',
      });
    } catch (err) {
      setGenError(getErrorMessage(err));
    } finally {
      setGenerating(false);
      setActiveJobId(null);
    }
  };

  const scopedQuestionCount = React.useMemo(() => {
    if (selectedChapterIds.length === 0 && selectedBookIds.length === 0) return questions.length;
    const bookSet = new Set(selectedBookIds);
    const chSet = new Set(selectedChapterIds);
    return questions.filter((q) => {
      if (chSet.size > 0 && q.chapterId) return chSet.has(q.chapterId);
      if (bookSet.size > 0 && q.bookId) return bookSet.has(q.bookId);
      return chSet.size === 0 && bookSet.size === 0;
    }).length;
  }, [questions, selectedBookIds, selectedChapterIds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Create Question Paper
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Choose syllabus chapters, configure your board blueprint, and generate a customizable paper.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {aiEnabled ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium shadow-xs">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>AI Engine: <strong>Google Gemini ({settings?.aiModel || 'gemini-3.5-flash'})</strong></span>
            </div>
          ) : (
            <Link to="/app/settings?tab=ai" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <span>AI Engine: <strong>Offline Bank Only</strong> (Click to enable Gemini)</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stepper */}
      <nav aria-label="Paper creation steps" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {STEPS.map((s) => {
          const isCurrent = step === s.id;
          const isDone = step > s.id || (s.id === 4 && Boolean(result));
          return (
            <button
              key={s.id}
              type="button"
              disabled={generating || (s.id === 4 && !result && !generating)}
              onClick={() => setStep(s.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border p-3 text-left text-xs font-semibold transition-all duration-150 cursor-pointer disabled:cursor-default',
                isCurrent
                  ? 'border-indigo-500 bg-indigo-50/80 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-600 shadow-xs ring-2 ring-indigo-500/20'
                  : isDone
                    ? 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 text-[var(--text-muted)]'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[var(--bg-muted)] text-[var(--text-muted)]'
                )}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.id}
              </span>
              <span className="truncate">{s.label.replace(/^\d+\.\s*/, '')}</span>
            </button>
          );
        })}
      </nav>

      {/* Step 1: Source & Chapters */}
      {step === 1 && (
        <div className="space-y-5">
          {books.length === 0 ? (
            <Alert tone="warning" title="Your local Library has no uploaded books yet">
              <div className="mt-1 flex flex-wrap items-center gap-2.5">
                <span>
                  Upload a textbook/question bank or load the NCERT Class 10 Science sample pack to
                  get started immediately.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={loadingSample}
                  onClick={() => void handleLoadSample()}
                  leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  Load Sample Class 10 Library
                </Button>
                <Link to="/app/library">
                  <Button size="sm" variant="ghost">
                    Go to Library
                  </Button>
                </Link>
              </div>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Select Sources ({books.length})</CardTitle>
                    <CardDescription>
                      Leave all unchecked to draw from your entire local library.
                    </CardDescription>
                  </div>
                  <BookOpen className="h-4 w-4 text-[var(--text-muted)]" />
                </CardHeader>
                <CardContent className="space-y-2.5 max-h-72 overflow-y-auto">
                  {books.map((book) => (
                    <Checkbox
                      key={book.id}
                      checked={selectedBookIds.includes(book.id)}
                      onCheckedChange={(checked) => {
                        setSelectedBookIds((prev) =>
                          checked ? [...prev, book.id] : prev.filter((id) => id !== book.id)
                        );
                      }}
                      label={book.title}
                      description={`${book.board} · Class ${book.classLevel} · ${book.subject}`}
                    />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Syllabus Chapters ({scopedChapters.length})</CardTitle>
                    <CardDescription>
                      Use the dropdown menu to select specific chapters or include the entire syllabus.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {scopedChapters.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      No chapters detected yet. You can still generate using bank questions.
                    </p>
                  ) : (
                    <ChapterSelectDropdown
                      chapters={scopedChapters}
                      selectedChapterIds={selectedChapterIds}
                      onChange={setSelectedChapterIds}
                      label="Select Chapters from Dropdown Menu"
                      placeholder="Choose chapters to test in this paper…"
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <MetaLine
                items={[
                  `${books.length} source(s)`,
                  `${scopedChapters.length} chapter(s)`,
                  `${scopedQuestionCount} matching bank question(s)`,
                  `${chunks.length} indexed chunk(s)`,
                ]}
              />
              <Button onClick={() => setStep(2)} rightIcon={<ArrowRight className="h-4 w-4" />}>
                Next: Blueprint &amp; Template
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Blueprint & Template */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Start From a Board Template</CardTitle>
                <CardDescription>
                  Pick a verified CBSE, ICSE, Maharashtra, or custom pattern, then customize every
                  section below.
                </CardDescription>
              </div>
              <LayoutTemplate className="h-4 w-4 text-[var(--text-muted)]" />
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {templates.map((tpl) => (
                <Button
                  key={tpl.id}
                  size="sm"
                  variant={appliedTemplateId === tpl.id ? 'primary' : 'outline'}
                  onClick={() => applyTemplate(tpl)}
                >
                  {tpl.name}
                </Button>
              ))}
              <Button
                size="sm"
                variant={appliedTemplateId === 'blank' ? 'primary' : 'outline'}
                onClick={() => {
                  setBlueprint(
                    createBlankBlueprint({
                      schoolName: settings?.schoolName,
                      board: settings?.defaultBoard,
                      classLevel: settings?.defaultClassLevel,
                      subject: settings?.defaultSubject,
                      language: settings?.language,
                    })
                  );
                  setAppliedTemplateId('blank');
                }}
              >
                Custom 20m Quick Pattern
              </Button>
            </CardContent>
          </Card>

          <BlueprintEditor
            blueprint={blueprint}
            onChange={setBlueprint}
            chapters={scopedChapters}
          />

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Back: Sources
            </Button>
            <Button
              disabled={!summary.isValid}
              onClick={() => setStep(3)}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Next: Review &amp; Estimate
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Token Estimate */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Paper Overview</CardTitle>
                <Badge tone="brand">{effectiveBlueprint.header.board}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {effectiveBlueprint.title}
                </div>
                <MetaLine
                  items={[
                    `Class ${effectiveBlueprint.header.classLevel}`,
                    effectiveBlueprint.header.subject,
                    `${effectiveBlueprint.header.durationMinutes} min`,
                    `${summary.totalMarks} Marks`,
                    `${summary.totalAttemptQuestions} Attempt / ${summary.totalGeneratedQuestions} Generated`,
                  ]}
                />
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-hairline)]">
                  {summary.sectionBreakdown.map((sec) => (
                    <div key={sec.id} className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">{sec.name}</span>
                      <span className="font-mono tabular-nums text-[var(--text-primary)]">
                        {sec.generatedCount}q · {sec.marks}m
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI &amp; Local Bank Execution Plan</CardTitle>
                <Badge tone={aiEnabled ? 'success' : 'neutral'}>
                  {aiEnabled ? settings?.aiProvider.toUpperCase() : 'OFFLINE BANK-ONLY'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-[var(--text-secondary)]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                    <div className="text-[11px] text-[var(--text-muted)]">From Local Bank</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
                      {tokenEstimate.bankQuestionCount} q
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                    <div className="text-[11px] text-[var(--text-muted)]">Via AI Provider</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
                      {tokenEstimate.aiQuestionCount} q
                    </div>
                  </div>
                </div>

                {aiEnabled ? (
                  <p>
                    Estimated context payload:{' '}
                    <strong className="font-mono tabular-nums text-[var(--text-primary)]">
                      ~{tokenEstimate.totalTokens.toLocaleString()} tokens
                    </strong>{' '}
                    (~${tokenEstimate.estimatedCostUsd.toFixed(4)} USD). Only top BM25 textbook
                    excerpts are sent directly to your configured provider ({settings?.aiModel}).
                  </p>
                ) : (
                  <Alert tone="info" title="Running in Offline / Bank-Only mode">
                    No AI API key is configured. EduPulse will assemble the paper purely from your
                    local question bank.{' '}
                    <Link to="/app/settings?tab=ai" className="underline font-medium">
                      Configure AI key
                    </Link>{' '}
                    if you want textbook-grounded AI generation.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Back: Edit Blueprint
            </Button>
            <Button
              onClick={() => void handleStartGeneration()}
              leftIcon={<FilePlus2 className="h-4 w-4" />}
            >
              Generate Question Paper
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Live Generation & Summary */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {generating
                ? 'Generating Question Paper…'
                : genError
                  ? 'Generation Stopped'
                  : 'Question Paper Ready'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {generating && (
              <div className="space-y-3">
                <Progress value={progress.progress} label={progress.stage} />
                {activeJobId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelGenerationJob(activeJobId)}
                    leftIcon={<Square className="h-3.5 w-3.5" />}
                  >
                    Cancel Generation
                  </Button>
                )}
              </div>
            )}

            {genError && (
              <Alert tone="danger" title="Could not complete paper generation">
                <p>{genError}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setStep(3)}>
                    Back to Review
                  </Button>
                </div>
              </Alert>
            )}

            {result && (
              <div className="space-y-4">
                <Alert tone="success" title={`Saved "${result.paper.title}" locally`}>
                  Selected {result.bankSelectedCount} question(s) from your local bank and generated{' '}
                  {result.aiGeneratedCount} question(s) via AI. Sets A, B, and C have been prepared
                  with synchronized answer keys.
                </Alert>

                {result.shortfalls.length > 0 && (
                  <Alert tone="warning" title="Some sections had fewer matching questions">
                    <ul className="list-disc pl-4 space-y-1 mt-1">
                      {result.shortfalls.map((sf) => (
                        <li key={sf.sectionId}>
                          <strong>{sf.sectionName}:</strong> fulfilled {sf.fulfilled} of{' '}
                          {sf.requested} — {sf.reason}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}

                {result.lowGroundingWarnings > 0 && (
                  <Alert tone="info" title="Grounding notice">
                    {result.lowGroundingWarnings} AI-generated item(s) had low keyword overlap with
                    your uploaded excerpts. Please review them in the Paper Editor.
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button onClick={() => navigate(`/app/editor/${result.paper.id}`)}>
                    Open in Paper Editor
                  </Button>
                  <Link to="/app/papers">
                    <Button variant="outline">View Saved Papers</Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
