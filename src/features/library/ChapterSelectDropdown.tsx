import * as React from 'react';
import { Check, ChevronDown, ListFilter, Search, X } from 'lucide-react';
import { Badge, Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui';
import { cn } from '@/src/lib/utils';
import type { ChapterRecord } from '@/src/lib/zod-schemas';

export interface ChapterSelectDropdownProps {
  chapters: ChapterRecord[];
  selectedChapterIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  showChips?: boolean;
}

export function ChapterSelectDropdown({
  chapters,
  selectedChapterIds,
  onChange,
  label = 'Select Chapters',
  placeholder = 'Choose syllabus chapters…',
  className,
  disabled = false,
  showChips = true,
}: ChapterSelectDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const selectedSet = React.useMemo(() => new Set(selectedChapterIds), [selectedChapterIds]);

  const filteredChapters = React.useMemo(() => {
    if (!searchQuery.trim()) return chapters;
    const q = searchQuery.toLowerCase();
    return chapters.filter(
      (ch) =>
        ch.title.toLowerCase().includes(q) ||
        String(ch.order).includes(q) ||
        ch.topics.some((t) => t.toLowerCase().includes(q))
    );
  }, [chapters, searchQuery]);

  const handleToggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedChapterIds.filter((cid) => cid !== id));
    } else {
      onChange([...selectedChapterIds, id]);
    }
  };

  const handleSelectAll = () => {
    onChange(chapters.map((c) => c.id));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const handleSelectOnly = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([id]);
  };

  const selectedCount = selectedChapterIds.length;
  const isAllSelected = chapters.length > 0 && selectedCount === chapters.length;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
          <span>{label}</span>
          <span className="text-[11px] font-normal text-[var(--text-muted)]">
            {selectedCount === 0
              ? 'All chapters included by default'
              : `${selectedCount} of ${chapters.length} selected`}
          </span>
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || chapters.length === 0}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-left text-xs transition-all duration-150',
              'hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-indigo-500/25',
              disabled && 'opacity-60 cursor-not-allowed',
              open && 'border-indigo-500/50 ring-2 ring-indigo-500/15'
            )}
          >
            <div className="flex items-center gap-2 truncate">
              <ListFilter className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              {chapters.length === 0 ? (
                <span className="text-[var(--text-muted)]">No chapters available</span>
              ) : selectedCount === 0 ? (
                <span className="font-medium text-[var(--text-primary)]">
                  {placeholder} <span className="text-[var(--text-muted)]">({chapters.length} total)</span>
                </span>
              ) : (
                <div className="flex items-center gap-1.5 truncate">
                  <Badge tone="brand" size="sm">
                    {selectedCount} selected
                  </Badge>
                  <span className="truncate text-[var(--text-secondary)]">
                    {chapters
                      .filter((c) => selectedSet.has(c.id))
                      .map((c) => `Ch ${c.order}`)
                      .join(', ')}
                  </span>
                </div>
              )}
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[var(--text-muted)] shrink-0 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[320px] sm:w-[420px] p-0 shadow-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-2xl overflow-hidden"
        >
          {/* Header toolbar */}
          <div className="p-3 border-b border-[var(--border-hairline)] space-y-2.5 bg-[var(--bg-subtle)]/40">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chapters or topics…"
                className="pl-8 h-8 text-xs bg-[var(--bg-surface)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] text-[var(--text-muted)]">
                {selectedCount} of {chapters.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-[var(--text-muted)]">·</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>

          {/* Chapters list */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1 divide-y divide-[var(--border-hairline)]/30">
            {filteredChapters.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                No matching chapters found.
              </div>
            ) : (
              filteredChapters.map((ch) => {
                const checked = selectedSet.has(ch.id);
                return (
                  <div
                    key={ch.id}
                    onClick={() => handleToggle(ch.id)}
                    className={cn(
                      'group flex items-start justify-between gap-3 p-2 rounded-xl cursor-pointer transition-colors',
                      checked
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 text-[var(--text-primary)]'
                        : 'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="pt-0.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => handleToggle(ch.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select Chapter ${ch.order}: ${ch.title}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                            #{ch.order}
                          </span>
                          <span className="text-xs font-semibold text-[var(--text-primary)] leading-tight">
                            {ch.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)]">
                          <span>Pages {ch.startPage}–{ch.endPage}</span>
                          {ch.topics.length > 0 && (
                            <>
                              <span>·</span>
                              <span>{ch.topics.length} topics</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleSelectOnly(ch.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 pt-0.5 transition-opacity"
                    >
                      Only this
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-muted)]">
              {selectedCount === 0 ? 'Using full syllabus' : `${selectedCount} chapter(s) scoped`}
            </span>
            <Button size="sm" onClick={() => setOpen(false)} className="h-7 text-xs px-3">
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected Chips */}
      {showChips && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {chapters
            .filter((c) => selectedSet.has(c.id))
            .map((ch) => (
              <span
                key={ch.id}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/70 dark:bg-indigo-950/40 px-2 py-0.5 text-[11px] font-medium text-indigo-900 dark:text-indigo-200"
              >
                <span>Ch {ch.order}: {ch.title}</span>
                <button
                  type="button"
                  onClick={() => handleToggle(ch.id)}
                  className="rounded-full p-0.5 hover:bg-indigo-200/60 dark:hover:bg-indigo-800/60 text-indigo-600 dark:text-indigo-400"
                  aria-label={`Remove chapter ${ch.order}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          {selectedCount > 1 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] font-medium text-[var(--text-muted)] hover:text-rose-500 transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
