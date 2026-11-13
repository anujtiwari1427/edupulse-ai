import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Checkbox } from './Controls';
import { Button } from './Button';

export interface DataColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  bulkActions?: React.ReactNode;
  pageSize?: number;
  emptyState?: React.ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  searchPlaceholder = 'Filter rows…',
  searchFilter,
  selectable = false,
  selectedIds,
  onSelectedIdsChange,
  bulkActions,
  pageSize = 10,
  emptyState,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState('');
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchFilter) return rows;
    return rows.filter((r) => searchFilter(r, q));
  }, [rows, query, searchFilter]);

  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const getter = col.sortValue;
    return [...filtered].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const allPageSelected =
    selectable &&
    pageRows.length > 0 &&
    selectedIds !== undefined &&
    pageRows.every((r) => selectedIds.has(getRowId(r)));

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleAllOnPage = (checked: boolean) => {
    if (!onSelectedIdsChange || !selectedIds) return;
    const next = new Set(selectedIds);
    for (const row of pageRows) {
      const id = getRowId(row);
      if (checked) next.add(id);
      else next.delete(id);
    }
    onSelectedIdsChange(next);
  };

  const toggleRow = (id: string, checked: boolean) => {
    if (!onSelectedIdsChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedIdsChange(next);
  };

  return (
    <div className="space-y-3">
      {(searchFilter || (selectable && selectedIds && selectedIds.size > 0 && bulkActions)) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {searchFilter && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          )}
          {selectable && selectedIds && selectedIds.size > 0 && bulkActions && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="font-mono tabular-nums font-medium">{selectedIds.size} selected</span>
              {bulkActions}
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 && emptyState ? (
        emptyState
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)]">
                {selectable && (
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={Boolean(allPageSelected)}
                      onCheckedChange={toggleAllOnPage}
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5 whitespace-nowrap',
                      col.align === 'right' && 'text-right',
                      col.className
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <span>{col.header}</span>
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {pageRows.map((row) => {
                const id = getRowId(row);
                const isSelected = Boolean(selectedIds?.has(id));
                return (
                  <tr
                    key={id}
                    className={cn(
                      'transition-colors hover:bg-[var(--bg-subtle)]',
                      isSelected && 'bg-[var(--brand-50)]/40'
                    )}
                  >
                    {selectable && (
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleRow(id, checked)}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-2.5 align-middle text-[var(--text-primary)]',
                          col.align === 'right' && 'text-right font-mono tabular-nums',
                          col.className
                        )}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          totalItems={sorted.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, totalItems, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs text-[var(--text-secondary)]">
      <span className="font-mono tabular-nums">
        Page {page} of {totalPages} ({totalItems} items)
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
