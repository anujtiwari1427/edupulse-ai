import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  GripVertical,
  History,
  Pencil,
  Plus,
  Printer,
  Redo2,
  RefreshCw,
  Repeat,
  Save,
  Shuffle,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useUIStore } from '@/src/app/store';
import { isAIConfigured } from '@/src/features/generation/ai-providers';
import { regenerateSingleQuestionWithAI } from '@/src/features/generation/generation-service';
import { resolvePaperForSet } from '@/src/features/generation/paper-engine';
import { runPaperExport, type PaperExportFormat } from '@/src/features/export/export-service';
import { repository } from '@/src/features/storage/repository';
import { getErrorMessage } from '@/src/lib/errors';
import { formatRelativeTime } from '@/src/lib/utils';
import type {
  BloomLevel,
  DifficultyLevel,
  PaperQuestion,
  PaperRecord,
  PaperStatus,
  PaperVersionRecord,
  QuestionRecord,
} from '@/src/lib/zod-schemas';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Drawer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  MetaLine,
  Modal,
  Select,
  Textarea,
} from '@/src/components/ui';
import { BankSwapModal } from './BankSwapModal';
import { ManualQuestionModal } from './ManualQuestionModal';
import {
  addQuestionToSection,
  computePaperMarksSummary,
  deleteQuestionFromSection,
  reorderQuestionInSection,
  reshufflePaperSets,
  swapQuestionInSection,
  updatePaperHeader,
  updateQuestionInPaper,
} from './paper-editor-ops';

const MAX_UNDO_HISTORY = 35;

export function PaperEditorPage() {
  const { paperId } = useParams<{ paperId: string }>();
  const [loadedPaper, setLoadedPaper] = React.useState<PaperRecord | null | undefined>(undefined);

  React.useEffect(() => {
    let active = true;
    if (!paperId) {
      Promise.resolve().then(() => {
        if (active) setLoadedPaper(null);
      });
      return () => {
        active = false;
      };
    }

    repository.papersRepo
      .getPaper(paperId)
      .then((rec) => {
        if (active) setLoadedPaper(rec ?? null);
      })
      .catch(() => {
        if (active) setLoadedPaper(null);
      });

    return () => {
      active = false;
    };
  }, [paperId]);

  if (loadedPaper === undefined) {
    return (
      <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
        Loading question paper…
      </div>
    );
  }

  if (loadedPaper === null) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="Paper not found"
        description="This question paper may have been deleted from local IndexedDB."
        action={
          <Link to="/app/papers">
            <Button size="sm" variant="outline">
              Back to Saved Papers
            </Button>
          </Link>
        }
      />
    );
  }

  return <PaperEditorInner key={loadedPaper.id} initialPaper={loadedPaper} />;
}

function PaperEditorInner({ initialPaper }: { initialPaper: PaperRecord }) {
  const addToast = useUIStore((s) => s.addToast);
  const setSaveState = useUIStore((s) => s.setSaveState);

  const [paper, setPaper] = React.useState<PaperRecord>(initialPaper);
  const [undoStack, setUndoStack] = React.useState<PaperRecord[]>([]);
  const [redoStack, setRedoStack] = React.useState<PaperRecord[]>([]);

  const [activeSet, setActiveSet] = React.useState<'A' | 'B' | 'C'>('A');
  const [previewMode, setPreviewMode] = React.useState<'paper' | 'answer_key'>('paper');
  const [mobileTab, setMobileTab] = React.useState<'edit' | 'preview'>('edit');
  const [editingHeader, setEditingHeader] = React.useState(false);
  const [editingQuestionId, setEditingQuestionId] = React.useState<string | null>(null);
  const [dragState, setDragState] = React.useState<{ sectionId: string; index: number } | null>(
    null
  );

  // Modals & Drawers
  const [swapTarget, setSwapTarget] = React.useState<{
    sectionId: string;
    paperQuestionId: string;
    marks: number;
  } | null>(null);
  const [manualTarget, setManualTarget] = React.useState<{
    sectionId: string;
    sectionName: string;
    defaultMarks: number;
  } | null>(null);
  const [snapshotOpen, setSnapshotOpen] = React.useState(false);
  const [snapshotNote, setSnapshotNote] = React.useState('');
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [versions, setVersions] = React.useState<PaperVersionRecord[]>([]);

  // Async action states
  const [exportingFormat, setExportingFormat] = React.useState<PaperExportFormat | null>(null);
  const [regeneratingId, setRegeneratingId] = React.useState<string | null>(null);

  const autosaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPaperRef = React.useRef(paper);
  const undoStackRef = React.useRef<PaperRecord[]>(undoStack);
  const redoStackRef = React.useRef<PaperRecord[]>(redoStack);

  React.useEffect(() => {
    latestPaperRef.current = paper;
  }, [paper]);

  const scheduleAutosave = React.useCallback(
    (nextPaper: PaperRecord) => {
      setSaveState('saving');
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null;
        void repository.papersRepo
          .savePaper(nextPaper)
          .then(() => {
            setSaveState('saved', Date.now());
          })
          .catch(() => {
            setSaveState('error');
          });
      }, 650);
    },
    [setSaveState]
  );

  React.useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
        void repository.papersRepo.savePaper(latestPaperRef.current).catch(() => undefined);
      }
    };
  }, []);

  const applyEdit = React.useCallback(
    (updater: (current: PaperRecord) => PaperRecord) => {
      const prev = latestPaperRef.current;
      const next = updater(prev);
      if (next === prev) return;
      const nextUndo = [...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), prev];
      undoStackRef.current = nextUndo;
      redoStackRef.current = [];
      latestPaperRef.current = next;
      setUndoStack(nextUndo);
      setRedoStack([]);
      setPaper(next);
      scheduleAutosave(next);
    },
    [scheduleAutosave]
  );

  const handleUndo = React.useCallback(() => {
    const hist = undoStackRef.current;
    if (hist.length === 0) return;
    const previous = hist[hist.length - 1]!;
    const nextUndo = hist.slice(0, -1);
    const nextRedo = [...redoStackRef.current, latestPaperRef.current];
    undoStackRef.current = nextUndo;
    redoStackRef.current = nextRedo;
    latestPaperRef.current = previous;
    setUndoStack(nextUndo);
    setRedoStack(nextRedo);
    setPaper(previous);
    scheduleAutosave(previous);
  }, [scheduleAutosave]);

  const handleRedo = React.useCallback(() => {
    const hist = redoStackRef.current;
    if (hist.length === 0) return;
    const restored = hist[hist.length - 1]!;
    const nextRedo = hist.slice(0, -1);
    const nextUndo = [...undoStackRef.current, latestPaperRef.current];
    redoStackRef.current = nextRedo;
    undoStackRef.current = nextUndo;
    latestPaperRef.current = restored;
    setRedoStack(nextRedo);
    setUndoStack(nextUndo);
    setPaper(restored);
    scheduleAutosave(restored);
  }, [scheduleAutosave]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTextInput) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const marksSummary = React.useMemo(() => computePaperMarksSummary(paper), [paper]);
  const resolvedSections = React.useMemo(
    () => resolvePaperForSet(paper, activeSet),
    [paper, activeSet]
  );
  const allPaperTexts = React.useMemo(
    () => paper.sections.flatMap((s) => s.questions.map((q) => q.text)),
    [paper.sections]
  );

  const handleExport = async (format: PaperExportFormat) => {
    setExportingFormat(format);
    try {
      await repository.papersRepo.savePaper(paper);
      const res = await runPaperExport(paper, format, activeSet);
      addToast({
        title: `Exported ${res.fileName}`,
        description: res.savedToLibraryFolder
          ? 'Saved to your Library /Exports folder and downloaded.'
          : 'Downloaded locally to your device.',
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Export failed',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleSaveSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = snapshotNote.trim() || `Manual snapshot (${marksSummary.actualMarks} marks)`;
    try {
      const saved = await repository.papersRepo.savePaper(paper, note);
      latestPaperRef.current = saved;
      setPaper(saved);
      setSaveState('saved', Date.now());
      setSnapshotNote('');
      setSnapshotOpen(false);
      addToast({ title: 'Version snapshot saved', description: note, variant: 'success' });
    } catch (err) {
      addToast({
        title: 'Could not save snapshot',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    }
  };

  const openVersionHistory = async () => {
    setHistoryOpen(true);
    const list = await repository.papersRepo.listPaperVersions(paper.id);
    setVersions(list);
  };

  const handleRestoreVersion = async (version: PaperVersionRecord) => {
    try {
      const restored = await repository.papersRepo.restorePaperVersion(paper.id, version.id);
      const nextUndo = [
        ...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)),
        latestPaperRef.current,
      ];
      undoStackRef.current = nextUndo;
      redoStackRef.current = [];
      latestPaperRef.current = restored;
      setUndoStack(nextUndo);
      setRedoStack([]);
      setPaper(restored);
      setHistoryOpen(false);
      addToast({
        title: `Restored Version ${version.versionNumber}`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Restore failed',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    }
  };

  const handleAIRegenerateQuestion = async (sectionId: string, q: PaperQuestion) => {
    const settings = await repository.settingsRepo.get();
    if (!isAIConfigured(settings)) {
      addToast({
        title: 'AI provider not configured',
        description:
          'Add a provider key in Settings to regenerate individual questions with AI, or use Swap from Bank.',
        variant: 'warning',
      });
      return;
    }

    const blueprintSection = paper.blueprintSnapshot.sections.find((s) => s.id === sectionId);
    if (!blueprintSection) return;

    setRegeneratingId(q.paperQuestionId);
    try {
      const replacement = await regenerateSingleQuestionWithAI(
        paper.blueprintSnapshot,
        blueprintSection,
        allPaperTexts,
        settings
      );
      applyEdit((cur) => swapQuestionInSection(cur, sectionId, q.paperQuestionId, replacement));
      addToast({ title: 'Question regenerated with AI', variant: 'success' });
    } catch (err) {
      addToast({
        title: 'AI regeneration failed',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Editor Action Bar */}
      <div className="no-print flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link to="/app/papers" className="mt-0.5 shrink-0">
            <Button size="sm" variant="ghost" aria-label="Back to saved papers">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <input
              aria-label="Paper title"
              value={paper.title}
              onChange={(e) =>
                applyEdit((cur) => updatePaperHeader(cur, { title: e.target.value }))
              }
              className="w-full max-w-xl bg-transparent text-lg font-bold tracking-tight text-[var(--text-primary)] border-b border-transparent focus:border-[var(--brand-600)] outline-none py-0.5"
            />
            <MetaLine
              className="mt-1"
              items={[
                paper.blueprintSnapshot.header.board,
                `Class ${paper.blueprintSnapshot.header.classLevel}`,
                paper.blueprintSnapshot.header.subject,
                `${marksSummary.actualMarks} / ${marksSummary.targetMarks} Marks`,
                `${marksSummary.totalQuestions} Questions`,
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="w-32">
            <Select
              ariaLabel="Paper status"
              value={paper.status}
              onValueChange={(v) =>
                applyEdit((cur) => ({ ...cur, status: v as PaperStatus, updatedAt: Date.now() }))
              }
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'finalized', label: 'Finalized' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setSnapshotOpen(true)}
            leftIcon={<Save className="h-3.5 w-3.5" />}
          >
            Snapshot
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void openVersionHistory()}
            leftIcon={<History className="h-3.5 w-3.5" />}
          >
            History
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            leftIcon={<Printer className="h-3.5 w-3.5" />}
          >
            Print
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                loading={exportingFormat !== null}
                leftIcon={<Download className="h-3.5 w-3.5" />}
              >
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void handleExport('pdf')}>
                Question Paper PDF (Set {activeSet})
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport('answer_key_pdf')}>
                Answer Key &amp; Scheme PDF (Set {activeSet})
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport('docx')}>
                Question Paper DOCX (Set {activeSet})
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport('answer_key_docx')}>
                Answer Key DOCX (Set {activeSet})
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport('json')}>
                Portable Paper JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Live Marks Divergence Warning */}
      {!marksSummary.isMatched && (
        <div className="no-print">
          <Alert tone="warning" title="Total marks differ from blueprint target">
            Current paper totals{' '}
            <span className="font-mono tabular-nums font-semibold">{marksSummary.actualMarks}</span>{' '}
            marks vs blueprint target{' '}
            <span className="font-mono tabular-nums font-semibold">{marksSummary.targetMarks}</span>{' '}
            marks ({marksSummary.delta > 0 ? `+${marksSummary.delta}` : marksSummary.delta} marks).
          </Alert>
        </div>
      )}

      {/* Mobile View Switcher */}
      <div className="no-print flex lg:hidden items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
        <button
          type="button"
          onClick={() => setMobileTab('edit')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
            mobileTab === 'edit'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          Edit Questions
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
            mobileTab === 'preview'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          A4 Print Preview (Set {activeSet})
        </button>
      </div>

      {/* Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: Interactive Paper & Question Editor */}
        <div
          className={`no-print lg:col-span-6 space-y-5 ${
            mobileTab === 'preview' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Header & Instructions Editor */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Header &amp; General Instructions</CardTitle>
                <MetaLine
                  className="mt-0.5"
                  items={[
                    paper.blueprintSnapshot.header.schoolName || 'School name not set',
                    paper.blueprintSnapshot.header.examTitle,
                    `${paper.blueprintSnapshot.header.durationMinutes} min`,
                  ]}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingHeader((v) => !v)}
                leftIcon={<Pencil className="h-3.5 w-3.5" />}
              >
                {editingHeader ? 'Done' : 'Edit Header'}
              </Button>
            </CardHeader>

            {editingHeader && (
              <CardContent className="space-y-3 border-t border-[var(--border-hairline)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="hdr-school">School / Institution Name</Label>
                    <Input
                      id="hdr-school"
                      value={paper.blueprintSnapshot.header.schoolName}
                      onChange={(e) =>
                        applyEdit((cur) => updatePaperHeader(cur, { schoolName: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="hdr-exam">Exam Title</Label>
                    <Input
                      id="hdr-exam"
                      value={paper.blueprintSnapshot.header.examTitle}
                      onChange={(e) =>
                        applyEdit((cur) => updatePaperHeader(cur, { examTitle: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="hdr-subject">Subject</Label>
                    <Input
                      id="hdr-subject"
                      value={paper.blueprintSnapshot.header.subject}
                      onChange={(e) =>
                        applyEdit((cur) => updatePaperHeader(cur, { subject: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="hdr-duration">Duration (min)</Label>
                      <Input
                        id="hdr-duration"
                        type="number"
                        min={10}
                        max={360}
                        value={String(paper.blueprintSnapshot.header.durationMinutes)}
                        onChange={(e) =>
                          applyEdit((cur) =>
                            updatePaperHeader(cur, {
                              durationMinutes: Math.max(10, Number(e.target.value) || 60),
                            })
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="hdr-date">Exam Date</Label>
                      <Input
                        id="hdr-date"
                        value={paper.blueprintSnapshot.header.examDate ?? ''}
                        placeholder="Optional"
                        onChange={(e) =>
                          applyEdit((cur) => updatePaperHeader(cur, { examDate: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="hdr-instructions">General Instructions (one per line)</Label>
                  <Textarea
                    id="hdr-instructions"
                    rows={4}
                    value={paper.blueprintSnapshot.header.generalInstructions.join('\n')}
                    onChange={(e) =>
                      applyEdit((cur) =>
                        updatePaperHeader(cur, {
                          generalInstructions: e.target.value
                            .split('\n')
                            .map((l) => l.trim())
                            .filter(Boolean),
                        })
                      )
                    }
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Sections & Questions */}
          {paper.sections.map((section) => (
            <Card key={section.id}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>{section.name}</CardTitle>
                  <MetaLine
                    className="mt-0.5"
                    items={[
                      `${section.questions.length} items`,
                      `${section.marksPerQuestion} marks each`,
                      section.choiceRule.enabled && section.choiceRule.attemptCount
                        ? `Attempt ${section.choiceRule.attemptCount} of ${section.choiceRule.totalCount ?? section.questions.length}`
                        : section.choiceRule.enabled && section.choiceRule.internalChoiceCount > 0
                          ? `${section.choiceRule.internalChoiceCount} OR choice(s)`
                          : 'All compulsory',
                    ]}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setManualTarget({
                      sectionId: section.id,
                      sectionName: section.name,
                      defaultMarks: section.marksPerQuestion,
                    })
                  }
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                >
                  Add
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {section.questions.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] py-3 text-center">
                    No questions in this section yet. Click Add to insert one.
                  </p>
                ) : (
                  section.questions.map((q, idx) => {
                    const isEditing = editingQuestionId === q.paperQuestionId;
                    const primaryIndex = section.questions
                      .slice(0, idx + 1)
                      .filter((item) => !item.alternativeToId).length;
                    const qLabel = q.alternativeToId ? `Q${primaryIndex} (OR)` : `Q${primaryIndex}`;

                    return (
                      <div
                        key={q.paperQuestionId}
                        draggable
                        onDragStart={() => setDragState({ sectionId: section.id, index: idx })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragState && dragState.sectionId === section.id) {
                            applyEdit((cur) =>
                              reorderQuestionInSection(cur, section.id, dragState.index, idx)
                            );
                          }
                          setDragState(null);
                        }}
                        onDragEnd={() => setDragState(null)}
                        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              aria-hidden="true"
                              className="mt-0.5 text-[var(--text-muted)] cursor-grab shrink-0"
                              title="Drag to reorder"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 space-y-1">
                              <MetaLine
                                items={[
                                  qLabel,
                                  `${q.marks} Marks`,
                                  q.difficulty,
                                  q.bloom,
                                  q.origin.toUpperCase(),
                                ]}
                              />
                              {!isEditing && (
                                <p className="text-sm text-[var(--text-primary)] whitespace-pre-line">
                                  {q.text}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={idx === 0}
                              aria-label={`Move ${qLabel} up`}
                              onClick={() =>
                                applyEdit((cur) =>
                                  reorderQuestionInSection(cur, section.id, idx, idx - 1)
                                )
                              }
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={idx === section.questions.length - 1}
                              aria-label={`Move ${qLabel} down`}
                              onClick={() =>
                                applyEdit((cur) =>
                                  reorderQuestionInSection(cur, section.id, idx, idx + 1)
                                )
                              }
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
                            <div>
                              <Label htmlFor={`q-stem-${q.paperQuestionId}`}>Question Text</Label>
                              <Textarea
                                id={`q-stem-${q.paperQuestionId}`}
                                rows={3}
                                value={q.text}
                                onChange={(e) =>
                                  applyEdit((cur) =>
                                    updateQuestionInPaper(cur, section.id, q.paperQuestionId, {
                                      text: e.target.value,
                                    })
                                  )
                                }
                              />
                            </div>

                            {q.options && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {q.options.map((opt, optIdx) => (
                                  <div key={optIdx}>
                                    <Label htmlFor={`q-opt-${q.paperQuestionId}-${optIdx}`}>
                                      Option ({String.fromCharCode(97 + optIdx)})
                                    </Label>
                                    <Input
                                      id={`q-opt-${q.paperQuestionId}-${optIdx}`}
                                      value={opt}
                                      onChange={(e) => {
                                        const updatedOpts = [...(q.options ?? [])];
                                        updatedOpts[optIdx] = e.target.value;
                                        applyEdit((cur) =>
                                          updateQuestionInPaper(
                                            cur,
                                            section.id,
                                            q.paperQuestionId,
                                            {
                                              options: updatedOpts,
                                            }
                                          )
                                        );
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <Label htmlFor={`q-marks-${q.paperQuestionId}`}>Marks</Label>
                                <Input
                                  id={`q-marks-${q.paperQuestionId}`}
                                  type="number"
                                  step="0.5"
                                  min="0.5"
                                  value={String(q.marks)}
                                  onChange={(e) =>
                                    applyEdit((cur) =>
                                      updateQuestionInPaper(cur, section.id, q.paperQuestionId, {
                                        marks: Math.max(0.5, Number(e.target.value) || 1),
                                      })
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <Label>Difficulty</Label>
                                <Select
                                  ariaLabel="Difficulty"
                                  value={q.difficulty}
                                  onValueChange={(v) =>
                                    applyEdit((cur) =>
                                      updateQuestionInPaper(cur, section.id, q.paperQuestionId, {
                                        difficulty: v as DifficultyLevel,
                                      })
                                    )
                                  }
                                  options={[
                                    { value: 'easy', label: 'Easy' },
                                    { value: 'medium', label: 'Medium' },
                                    { value: 'hard', label: 'Hard' },
                                  ]}
                                />
                              </div>
                              <div>
                                <Label>Bloom</Label>
                                <Select
                                  ariaLabel="Bloom"
                                  value={q.bloom}
                                  onValueChange={(v) =>
                                    applyEdit((cur) =>
                                      updateQuestionInPaper(cur, section.id, q.paperQuestionId, {
                                        bloom: v as BloomLevel,
                                      })
                                    )
                                  }
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
                              <Label htmlFor={`q-ans-${q.paperQuestionId}`}>Answer</Label>
                              <Input
                                id={`q-ans-${q.paperQuestionId}`}
                                value={q.answer}
                                onChange={(e) =>
                                  applyEdit((cur) =>
                                    updateQuestionInPaper(cur, section.id, q.paperQuestionId, {
                                      answer: e.target.value,
                                    })
                                  )
                                }
                              />
                            </div>

                            <div>
                              <Label htmlFor={`q-scheme-${q.paperQuestionId}`}>
                                Marking Scheme
                              </Label>
                              <Textarea
                                id={`q-scheme-${q.paperQuestionId}`}
                                rows={2}
                                value={q.markingScheme ?? ''}
                                onChange={(e) =>
                                  applyEdit((cur) =>
                                    updateQuestionInPaper(cur, section.id, q.paperQuestionId, {
                                      markingScheme: e.target.value,
                                    })
                                  )
                                }
                              />
                            </div>
                          </div>
                        ) : (
                          q.options && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-6 text-xs text-[var(--text-secondary)]">
                              {q.options.map((opt, oi) => (
                                <span key={`${q.paperQuestionId}-${oi}`}>
                                  ({String.fromCharCode(97 + oi)}) {opt}
                                </span>
                              ))}
                            </div>
                          )
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setEditingQuestionId(isEditing ? null : q.paperQuestionId)
                            }
                            leftIcon={<Pencil className="h-3.5 w-3.5" />}
                          >
                            {isEditing ? 'Done' : 'Edit'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setSwapTarget({
                                sectionId: section.id,
                                paperQuestionId: q.paperQuestionId,
                                marks: q.marks,
                              })
                            }
                            leftIcon={<Repeat className="h-3.5 w-3.5" />}
                          >
                            Swap from Bank
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={regeneratingId === q.paperQuestionId}
                            onClick={() => void handleAIRegenerateQuestion(section.id, q)}
                            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                          >
                            AI Regen
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Delete ${qLabel}`}
                            onClick={() =>
                              applyEdit((cur) =>
                                deleteQuestionFromSection(cur, section.id, q.paperQuestionId)
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* RIGHT PANE: Live A4 Print Sheet & Set A/B/C Preview */}
        <div
          className={`lg:col-span-6 lg:sticky lg:top-6 space-y-3 ${
            mobileTab === 'edit' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Preview Controls */}
          <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)]">
              {(['A', 'B', 'C'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveSet(code)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeSet === code
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Set {code}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)]">
              <button
                type="button"
                onClick={() => setPreviewMode('paper')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  previewMode === 'paper'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Question Paper
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('answer_key')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  previewMode === 'answer_key'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Answer Key
              </button>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                applyEdit((cur) => reshufflePaperSets(cur));
                addToast({ title: 'Reshuffled Sets B & C', variant: 'success' });
              }}
              leftIcon={<Shuffle className="h-3.5 w-3.5" />}
            >
              Reshuffle Sets
            </Button>
          </div>

          {/* Printable A4 Sheet */}
          <div className="print-sheet rounded-xl border border-[var(--border-hairline)] bg-white text-neutral-900 p-6 sm:p-8 space-y-5 shadow-sm">
            <div className="border-b-2 border-neutral-800 pb-3 text-center space-y-1">
              <div className="text-base font-bold uppercase tracking-wide">
                {paper.blueprintSnapshot.header.schoolName || 'QUESTION PAPER'}
              </div>
              <div className="text-sm font-semibold">
                {paper.blueprintSnapshot.header.examTitle}
              </div>
              {previewMode === 'answer_key' && (
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                  Answer Key &amp; Marking Scheme — Set {activeSet}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 font-medium">
                <span>
                  {paper.blueprintSnapshot.header.board} · Class{' '}
                  {paper.blueprintSnapshot.header.classLevel} ·{' '}
                  {paper.blueprintSnapshot.header.subject}
                  {paper.blueprintSnapshot.header.examDate
                    ? ` · ${paper.blueprintSnapshot.header.examDate}`
                    : ''}
                </span>
                <span className="font-mono tabular-nums">
                  Set {activeSet} · Time: {paper.blueprintSnapshot.header.durationMinutes} min · Max
                  Marks: {marksSummary.actualMarks}
                </span>
              </div>
            </div>

            {previewMode === 'paper' &&
              paper.blueprintSnapshot.header.generalInstructions.length > 0 && (
                <div className="border-b border-neutral-300 pb-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wide">
                    General Instructions:
                  </div>
                  <ol className="list-decimal pl-5 text-xs space-y-0.5 text-neutral-800">
                    {paper.blueprintSnapshot.header.generalInstructions.map((inst, i) => (
                      <li key={i}>{inst}</li>
                    ))}
                  </ol>
                </div>
              )}

            <div className="space-y-5">
              {resolvedSections.map((sec) => (
                <div key={sec.id} className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2 border-b border-neutral-300 pb-1">
                    <h2 className="text-xs sm:text-sm font-bold">{sec.name}</h2>
                    {sec.choiceRule.enabled &&
                      sec.choiceRule.attemptCount &&
                      sec.choiceRule.totalCount && (
                        <span className="text-xs italic text-neutral-700 shrink-0">
                          Attempt any {sec.choiceRule.attemptCount} of {sec.choiceRule.totalCount}
                        </span>
                      )}
                  </div>

                  {previewMode === 'paper' ? (
                    <div className="space-y-3 text-xs sm:text-sm">
                      {sec.questions.map((q) => (
                        <div key={q.paperQuestionId} className="space-y-1">
                          {q.alternativeToId && (
                            <div className="text-center text-[11px] font-bold tracking-widest text-neutral-700 py-0.5">
                              OR
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-4">
                            <span className="whitespace-pre-line">
                              <strong className="font-semibold">
                                {q.alternativeToId ? '' : `${q.displayNumber}. `}
                              </strong>
                              {q.text}
                            </span>
                            <span className="font-mono tabular-nums text-xs shrink-0">
                              [{q.marks}]
                            </span>
                          </div>
                          {q.resolvedOptions && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-5 text-xs text-neutral-800">
                              {q.resolvedOptions.map((opt, idx) => (
                                <span key={`${q.paperQuestionId}-opt-${idx}`}>
                                  ({String.fromCharCode(97 + idx)}) {opt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-xs sm:text-sm">
                      {sec.questions.map((q) => (
                        <div
                          key={q.paperQuestionId}
                          className="border-b border-neutral-200 pb-2 last:border-none"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold">
                              {q.alternativeToId
                                ? `Q${q.displayNumber} (OR)`
                                : `Q${q.displayNumber}`}
                              . {q.resolvedAnswerLabel ?? q.answer}
                            </span>
                            <span className="font-mono tabular-nums text-xs shrink-0">
                              [{q.marks}m]
                            </span>
                          </div>
                          {q.markingScheme && (
                            <p className="text-xs text-neutral-700 mt-0.5">
                              Scheme: {q.markingScheme}
                            </p>
                          )}
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {q.topic} · {q.difficulty} · {q.bloom}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bank Swap Modal */}
      {swapTarget && (
        <BankSwapModal
          open={Boolean(swapTarget)}
          onOpenChange={(open) => {
            if (!open) setSwapTarget(null);
          }}
          existingPaperTexts={allPaperTexts}
          preferredMarks={swapTarget.marks}
          onSelect={(replacement) => {
            applyEdit((cur) =>
              swapQuestionInSection(
                cur,
                swapTarget.sectionId,
                swapTarget.paperQuestionId,
                replacement
              )
            );
            addToast({ title: 'Swapped question from bank', variant: 'success' });
          }}
        />
      )}

      {/* Manual Question Modal */}
      {manualTarget && (
        <ManualQuestionModal
          open={Boolean(manualTarget)}
          onOpenChange={(open) => {
            if (!open) setManualTarget(null);
          }}
          defaultMarks={manualTarget.defaultMarks}
          language={paper.language}
          sectionName={manualTarget.sectionName}
          onAdd={(question: QuestionRecord) => {
            applyEdit((cur) => addQuestionToSection(cur, manualTarget.sectionId, question));
            addToast({ title: 'Added question to section', variant: 'success' });
          }}
        />
      )}

      {/* Save Snapshot Modal */}
      <Modal
        open={snapshotOpen}
        onOpenChange={setSnapshotOpen}
        size="sm"
        title="Save Version Snapshot"
        description="Bookmark this revision in your local Version History so you can restore it anytime."
      >
        <form onSubmit={(e) => void handleSaveSnapshot(e)} className="space-y-4">
          <div>
            <Label htmlFor="snapshot-note">Revision Note</Label>
            <Input
              id="snapshot-note"
              placeholder="e.g. Verified CBSE marks & Hindi phrasing"
              value={snapshotNote}
              onChange={(e) => setSnapshotNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSnapshotOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Snapshot</Button>
          </div>
        </form>
      </Modal>

      {/* Version History Drawer */}
      <Drawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="Version History"
        description="Restore any saved snapshot of this paper. Restoring creates a fresh backup snapshot first."
      >
        {versions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No named snapshots yet. Click Snapshot in the toolbar to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {versions.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-[var(--border-hairline)] p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    Version {v.versionNumber}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                    {formatRelativeTime(v.createdAt)}
                  </span>
                </div>
                {v.note && <p className="text-xs text-[var(--text-secondary)]">{v.note}</p>}
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => void handleRestoreVersion(v)}>
                    Restore Version
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
