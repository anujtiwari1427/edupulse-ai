import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, BookOpen, CheckCircle2, FileText, Loader2, Sparkles, Zap } from 'lucide-react';
import { Alert, Badge, Button, Modal, Select } from '@/src/components/ui';
import { ChapterSelectDropdown } from './ChapterSelectDropdown';
import { db } from '@/src/features/storage/db';
import { repository } from '@/src/features/storage/repository';
import { generateQuestionPaperJob, type GenerationProgressUpdate } from '@/src/features/generation/generation-service';
import { createBlankBlueprint } from '@/src/features/blueprint/blueprint-engine';
import { BOGUS_OUTLINE_REGEX, applyAutoDetectedChaptersToBook } from '@/src/features/ingestion/chapter-detector';
import { generateId } from '@/src/lib/utils';
import { getErrorMessage } from '@/src/lib/errors';
import { useUIStore } from '@/src/app/store';
import type { BlueprintRecord, BookRecord, ChapterRecord, TemplateRecord } from '@/src/lib/zod-schemas';

export interface QuickGeneratePaperModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBook?: BookRecord | null;
}

const EXAM_FORMATS = [
  { id: 'unit_test_25', name: 'Unit Test / Class Assessment (25 Marks)', marks: 25, duration: 45 },
  { id: 'periodic_40', name: 'Periodic Test / Assessment (40 Marks)', marks: 40, duration: 90 },
  { id: 'term_50', name: 'Term Examination (50 Marks)', marks: 50, duration: 120 },
  { id: 'board_80', name: 'Board Pattern Examination (80 Marks)', marks: 80, duration: 180 },
];

export function QuickGeneratePaperModal({
  open,
  onOpenChange,
  initialBook = null,
}: QuickGeneratePaperModalProps) {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const books = useLiveQuery(() => db.books.filter((b) => b.sourceType === 'textbook').toArray(), [], []);
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);
  const settings = useLiveQuery(() => repository.settingsRepo.get(), [], null);

  const [selectedBookIdOverride, setSelectedBookIdOverride] = React.useState<string | null>(null);
  const selectedBookId = selectedBookIdOverride ?? initialBook?.id ?? books[0]?.id ?? '';
  const [selectedChapterIds, setSelectedChapterIds] = React.useState<string[]>([]);
  const [selectedFormatId, setSelectedFormatId] = React.useState<string>('unit_test_25');
  const [generating, setGenerating] = React.useState(false);
  const [progress, setProgress] = React.useState<GenerationProgressUpdate | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Load chapters for the selected book
  const chapters = useLiveQuery(
    () => (selectedBookId ? repository.libraryRepo.listChapters(selectedBookId) : Promise.resolve([])),
    [selectedBookId],
    []
  );

  const activeBook = React.useMemo(() => books.find((b) => b.id === selectedBookId) || null, [books, selectedBookId]);

  const [autoFixing, setAutoFixing] = React.useState(false);

  const hasBogusChapters = React.useMemo(() => {
    return chapters.some((c) => BOGUS_OUTLINE_REGEX.test(c.title.trim()));
  }, [chapters]);

  const handleAutoFixChapters = async () => {
    if (!selectedBookId) return;
    setAutoFixing(true);
    try {
      const fixed = await applyAutoDetectedChaptersToBook(selectedBookId);
      addToast({
        title: 'Chapters auto-fixed',
        description: `Extracted ${fixed.length} syllabus chapters from Table of Contents.`,
        variant: 'success',
      });
      setSelectedChapterIds([]);
    } catch (err) {
      addToast({
        title: 'Auto-fix failed',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    } finally {
      setAutoFixing(false);
    }
  };

  const handleGenerate = async () => {
    if (!activeBook) {
      setError('Please select a textbook.');
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress({ stage: 'Building customized paper blueprint…', progress: 10 });

    try {
      // Find matching template or construct one tailored to the exam format
      const format = EXAM_FORMATS.find((f) => f.id === selectedFormatId) || EXAM_FORMATS[0]!;
      const matchingTemplate = templates.find(
        (t) => t.board === activeBook.board && t.blueprint?.totalMarks === format.marks
      ) || templates[0];

      const chapterScope = selectedChapterIds.length > 0 ? selectedChapterIds : chapters.map((c) => c.id);
      const chapterTitles = chapters
        .filter((c) => chapterScope.includes(c.id))
        .map((c) => `Ch ${c.order}: ${c.title}`)
        .slice(0, 3)
        .join(', ');

      const titleSuffix = chapterTitles ? ` (${chapterTitles}${chapterScope.length > 3 ? '…' : ''})` : '';

      let blueprint: BlueprintRecord;

      if (matchingTemplate?.blueprint?.sections && Array.isArray(matchingTemplate.blueprint.sections)) {
        blueprint = {
          ...matchingTemplate.blueprint,
          id: generateId('bp'),
          title: `${activeBook.title} — ${format.name}${titleSuffix}`,
          language: activeBook.language,
          totalMarks: matchingTemplate.blueprint.totalMarks || format.marks,
          header: {
            ...matchingTemplate.blueprint.header,
            board: activeBook.board,
            classLevel: activeBook.classLevel,
            subject: activeBook.subject,
            examTitle: format.name,
            durationMinutes: format.duration,
          },
          sections: matchingTemplate.blueprint.sections.map((s) => ({
            ...s,
            id: generateId('sec'),
            chapterIds: chapterScope,
          })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      } else {
        const blank = createBlankBlueprint({
          board: activeBook.board,
          classLevel: activeBook.classLevel,
          subject: activeBook.subject,
          language: activeBook.language,
        });
        blueprint = {
          ...blank,
          title: `${activeBook.title} — ${format.name}${titleSuffix}`,
          totalMarks: format.marks,
          header: {
            ...blank.header,
            examTitle: format.name,
            durationMinutes: format.duration,
          },
          sections: blank.sections.map((s) => ({
            ...s,
            id: generateId('sec'),
            chapterIds: chapterScope,
          })),
        };
      }

      const savedBlueprint = await repository.papersRepo.saveBlueprint(blueprint);
      const genResult = await generateQuestionPaperJob(savedBlueprint, {
        title: blueprint.title,
        onProgress: (p) => setProgress(p),
      });

      addToast({
        title: 'Question paper generated successfully!',
        description: `Generated ${genResult.aiGeneratedCount + genResult.bankSelectedCount} questions for chosen chapters.`,
        variant: 'success',
      });

      onOpenChange(false);
      navigate(`/app/editor/${genResult.paper.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
      setGenerating(false);
    }
  };

  const handleOpenInStudio = () => {
    onOpenChange(false);
    const params = new URLSearchParams();
    if (selectedBookId) params.set('bookId', selectedBookId);
    if (selectedChapterIds.length > 0) params.set('chapters', selectedChapterIds.join(','));
    navigate(`/app/create?${params.toString()}`);
  };

  const providerDisplay = React.useMemo(() => {
    if (!settings) return 'Google Gemini (gemini-3.5-flash)';
    if (settings.aiProvider === 'ollama') {
      return `Local Ollama (${settings.aiModel || 'llama3.2'})`;
    }
    if (settings.aiProvider === 'groq') {
      return `Groq Cloud (${settings.aiModel || 'llama-3.3-70b-versatile'})`;
    }
    if (settings.aiProvider === 'openrouter') {
      return `OpenRouter (${settings.aiModel || 'meta-llama/llama-3.2-3b-instruct:free'})`;
    }
    if (settings.aiProvider === 'openai') {
      return `OpenAI (${settings.aiModel || 'gpt-4o-mini'})`;
    }
    if (settings.aiProvider === 'anthropic') {
      return `Anthropic Claude (${settings.aiModel || 'claude-3-5-haiku-latest'})`;
    }
    if (settings.aiProvider === 'proxy') {
      return `Stateless Proxy (${settings.aiModel || 'gemini-3.5-flash'})`;
    }
    return `Google Gemini (${settings.aiModel || 'gemini-3.5-flash'})`;
  }, [settings]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="⚡ Generate Question Paper from Chapters"
      description={`Select chapters from the dropdown menu and generate an exam paper with ${providerDisplay}.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={generating} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={generating}
            onClick={handleOpenInStudio}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
          >
            Open in Full Studio
          </Button>
          <Button
            size="sm"
            loading={generating}
            onClick={() => void handleGenerate()}
            leftIcon={<Sparkles className="h-3.5 w-3.5" />}
          >
            {generating ? 'Generating with AI…' : 'Generate Question Paper'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Textbook Selector */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
            Select Textbook / Source
          </label>
          <Select
            value={selectedBookId}
            onValueChange={(val) => {
              setSelectedBookIdOverride(val);
              setSelectedChapterIds([]);
            }}
            ariaLabel="Textbook"
            options={books.map((b) => ({
              value: b.id,
              label: `${b.title} (${b.board} · Class ${b.classLevel} · ${b.subject})`,
            }))}
          />
        </div>

        {/* Chapters Dropdown Menu */}
        <div className="space-y-2">
          <ChapterSelectDropdown
            chapters={chapters}
            selectedChapterIds={selectedChapterIds}
            onChange={setSelectedChapterIds}
            label="Syllabus Chapters (Dropdown Menu)"
            placeholder="Choose chapters to include in this exam…"
          />
          {hasBogusChapters && (
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200">
              <span className="text-[11px]">
                Detected printing plate tags (PRILIM/TEXT). Auto-fix with real chapters from TOC?
              </span>
              <Button
                size="sm"
                variant="outline"
                loading={autoFixing}
                onClick={() => void handleAutoFixChapters()}
                leftIcon={<Zap className="h-3 w-3 text-amber-500" />}
                className="text-xs h-7 px-2.5 shrink-0 bg-white dark:bg-zinc-900 font-medium"
              >
                ⚡ Auto-Fix Chapters
              </Button>
            </div>
          )}
        </div>

        {/* Exam Format / Pattern */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
            Exam Pattern &amp; Total Marks
          </label>
          <Select
            value={selectedFormatId}
            onValueChange={setSelectedFormatId}
            ariaLabel="Exam Format"
            options={EXAM_FORMATS.map((fmt) => ({
              value: fmt.id,
              label: `${fmt.name} — ${fmt.duration} mins`,
            }))}
          />
        </div>

        {/* AI Info pill */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-indigo-200/60 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20 text-xs text-indigo-950 dark:text-indigo-200">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
            <span>AI Provider: <strong>{providerDisplay}</strong></span>
          </div>
          <Badge tone="success" size="sm" dot>
            Ready
          </Badge>
        </div>

        {/* Live Progress Bar when generating */}
        {generating && progress && (
          <div className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-primary)] flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                {progress.stage}
              </span>
              <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                {progress.progress}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}
