import * as React from 'react';
import { GitMerge, Scissors, Sparkles } from 'lucide-react';
import { Button, Input, Modal } from '@/src/components/ui';
import {
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

  React.useEffect(() => {
    if (!open || !book) return;
    void repository.libraryRepo.listChapters(book.id).then(setChapters);
  }, [open, book]);

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
      description="Rename chapters, fix page ranges, split long sections, or merge adjacent chapters."
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-indigo-200/60 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20">
          <div>
            <div className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              AI Syllabus &amp; Chapter Understanding
            </div>
            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400/80 mt-0.5">
              Analyze document TOC, syllabus pages, and section markers with Gemini 3.5 Flash.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            loading={aiScanning}
            onClick={() => void handleAiDetectChapters()}
            leftIcon={<Sparkles className="h-3.5 w-3.5 text-indigo-500" />}
            className="shrink-0 bg-white dark:bg-zinc-900"
          >
            AI Chapter Scan
          </Button>
        </div>

        {chapters.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No chapters found for this book.</p>
        ) : (
          <div className="space-y-3">
            {chapters.map((ch, idx) => {
            const canSplit = ch.endPage > ch.startPage;
            const midPage = Math.floor((ch.startPage + ch.endPage) / 2) + 1;
            return (
              <div
                key={ch.id}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 space-y-2.5"
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
                </div>

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
                        onClick={() =>
                          setChapters((prev) => mergeChapters(prev, ch.id, 'next'))
                        }
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
