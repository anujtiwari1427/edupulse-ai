import * as React from 'react';
import { AlertCircle, GitMerge, Scissors, Sparkles, Zap } from 'lucide-react';
import { Button, Input, Modal } from '@/src/components/ui';
import {
  BOGUS_OUTLINE_REGEX,
  applyAutoDetectedChaptersToBook,
  mergeChapters,
  reassignChunksToChapters,
  renameChapter,
  splitChapterAtPage,
  updateChapterRange,
} from '@/src/features/ingestion/chapter-detector';
import { applyAIChaptersToBook } from '@/src/features/ingestion/ai-chapter-service';
import { repository } from '@/src/features/storage/repository';
import { getErrorMessage } from '@/src/lib/errors';
import type { BookRecord, ChapterRecord } from '@/src/lib/zod-schemas';
import { useUIStore } from '@/src/app/store';

export interface ChapterManagerModalProps {
  book: BookRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChapterManagerModal({ book, open, onOpenChange }: ChapterManagerModalProps) {
  const addToast = useUIStore((s) => s.addToast);
  const [chapters, setChapters] = React.useState<ChapterRecord[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [aiScanning, setAiScanning] = React.useState(false);
  const [tocScanning, setTocScanning] = React.useState(false);

  React.useEffect(() => {
    if (!open || !book) return;
    void repository.libraryRepo.listChapters(book.id).then(setChapters);
  }, [open, book]);

  const hasBogusChapters = React.useMemo(() => {
    return chapters.some((ch) => BOGUS_OUTLINE_REGEX.test(ch.title.trim()));
  }, [chapters]);

  const handleAutoDetectFromTOC = async () => {
    if (!book) return;
    setTocScanning(true);
    try {
      const detected = await applyAutoDetectedChaptersToBook(book.id);
      setChapters(detected);
      addToast({
        title: 'TOC Chapter Detection Complete',
        description: `Extracted ${detected.length} syllabus chapters from Table of Contents & headings.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Auto-detection failed',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    } finally {
      setTocScanning(false);
    }
  };

  const handleAiDetectChapters = async () => {
    if (!book) return;
    setAiScanning(true);
    try {
      const detected = await applyAIChaptersToBook(book.id);
      setChapters(detected);
      addToast({
        title: 'AI Chapter Understanding complete',
        description: `Gemini detected ${detected.length} chapters and sub-topics from the document.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'AI Chapter Detection failed',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    } finally {
      setAiScanning(false);
    }
  };

  const handleSave = async () => {
    if (!book) return;
    setSaving(true);
    try {
      const existingChunks = await repository.libraryRepo.listAllChunks(book.id);
      const reassigned = reassignChunksToChapters(existingChunks, chapters);
      await repository.libraryRepo.saveBookChaptersAndReassignChunks(
        book.id,
        chapters,
        reassigned
      );
      addToast({
        title: 'Chapters updated',
        description: `Saved ${chapters.length} chapters and re-indexed chunks.`,
        variant: 'success',
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={book ? `Chapter Manager — ${book.title}` : 'Chapter Manager'}
      description="Rename chapters, fix page ranges, split long sections, or re-detect chapters from Table of Contents."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={() => void handleSave()}>
            Save Chapters
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {hasBogusChapters && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-semibold block">DTP Printer Artifacts Detected</span>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Book contains printing plate labels (e.g. PRILIM, TEXT, COVER). Click{' '}
                <strong>⚡ Auto-Detect (Fast TOC)</strong> or <strong>✨ AI Chapter Scan</strong> below to replace them with real curriculum chapters.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-indigo-200/60 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20">
          <div>
            <div className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              Smart Chapter &amp; Syllabus Detection
            </div>
            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400/80 mt-0.5">
              Auto-detect chapters from the Table of Contents, or run deep AI syllabus analysis with Gemini.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              loading={tocScanning}
              onClick={() => void handleAutoDetectFromTOC()}
              leftIcon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
              className="bg-white dark:bg-zinc-900 font-medium"
              title="Fast 0.1s Table of Contents (Index) extraction"
            >
              ⚡ Fast TOC Scan
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={aiScanning}
              onClick={() => void handleAiDetectChapters()}
              leftIcon={<Sparkles className="h-3.5 w-3.5 text-indigo-500" />}
              className="bg-white dark:bg-zinc-900 font-medium"
              title="Gemini AI syllabus & sub-topics analysis"
            >
              AI Chapter Scan
            </Button>
          </div>
        </div>

        {chapters.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">No chapters found for this book.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleAutoDetectFromTOC()}
              leftIcon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
            >
              Scan Table of Contents
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {chapters.map((ch, idx) => {
              const canSplit = ch.endPage > ch.startPage;
              const midPage = Math.floor((ch.startPage + ch.endPage) / 2) + 1;
              const isBogus = BOGUS_OUTLINE_REGEX.test(ch.title.trim());

              return (
                <div
                  key={ch.id}
                  className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                    isBogus
                      ? 'border-red-500/40 bg-red-500/5'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-mono text-xs text-[var(--text-muted)] w-8 shrink-0">
                      #{ch.order}
                    </span>
                    <Input
                      value={ch.title}
                      onChange={(e) =>
                        setChapters((prev) => renameChapter(prev, ch.id, e.target.value))
                      }
                      aria-label={`Chapter ${ch.order} title`}
                    />
                    {isBogus && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 shrink-0">
                        DTP Plate
                      </span>
                    )}
                  </div>

                  {ch.topics && ch.topics.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-10">
                      <span className="text-[10px] text-[var(--text-muted)] font-medium">Topics:</span>
                      {ch.topics.slice(0, 5).map((topic, tIdx) => (
                        <span
                          key={tIdx}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)]"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pl-0 sm:pl-10">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span>Pages</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, book?.pageCount ?? 9999)}
                        value={ch.startPage}
                        aria-label={`Chapter ${ch.order} start page`}
                        onChange={(e) =>
                          setChapters((prev) =>
                            updateChapterRange(prev, ch.id, Number(e.target.value), ch.endPage)
                          )
                        }
                        className="h-8 w-20 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 font-mono text-xs tabular-nums"
                      />
                      <span>to</span>
                      <input
                        type="number"
                        min={ch.startPage}
                        max={Math.max(ch.startPage, book?.pageCount ?? 9999)}
                        value={ch.endPage}
                        aria-label={`Chapter ${ch.order} end page`}
                        onChange={(e) =>
                          setChapters((prev) =>
                            updateChapterRange(prev, ch.id, ch.startPage, Number(e.target.value))
                          )
                        }
                        className="h-8 w-20 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 font-mono text-xs tabular-nums"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canSplit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setChapters((prev) => splitChapterAtPage(prev, ch.id, midPage))
                          }
                          leftIcon={<Scissors className="h-3.5 w-3.5" />}
                        >
                          Split at p.{midPage}
                        </Button>
                      )}
                      {idx < chapters.length - 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const nextCh = chapters[idx + 1];
                            if (nextCh) {
                              setChapters((prev) => mergeChapters(prev, ch.id, nextCh.id));
                            }
                          }}
                          leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                        >
                          Merge Next
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
