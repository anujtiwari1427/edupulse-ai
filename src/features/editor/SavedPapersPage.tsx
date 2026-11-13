import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Download, FilePlus2, FileText, History, Search, Trash2, Upload } from 'lucide-react';
import { useUIStore } from '@/src/app/store';
import { parseImportedPaperJson } from '@/src/features/export/json-exporter';
import { runPaperExport, type PaperExportFormat } from '@/src/features/export/export-service';
import { repository } from '@/src/features/storage/repository';
import { getErrorMessage } from '@/src/lib/errors';
import { formatRelativeTime } from '@/src/lib/utils';
import type { PaperRecord, PaperStatus, PaperVersionRecord } from '@/src/lib/zod-schemas';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Drawer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  MetaLine,
} from '@/src/components/ui';

const EMPTY_PAPERS: PaperRecord[] = [];

export function SavedPapersPage() {
  const navigate = useNavigate();
  const papers =
    useLiveQuery(() => repository.papersRepo.listPapers(), [], EMPTY_PAPERS) ?? EMPTY_PAPERS;
  const addToast = useUIStore((s) => s.addToast);

  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | PaperStatus>('all');
  const [historyPaper, setHistoryPaper] = React.useState<PaperRecord | null>(null);
  const [versions, setVersions] = React.useState<PaperVersionRecord[]>([]);
  const [exportingId, setExportingId] = React.useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return papers.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      const hay =
        `${p.title} ${p.blueprintSnapshot.header.subject} ${p.blueprintSnapshot.header.board}`.toLowerCase();
      return hay.includes(q);
    });
  }, [papers, query, statusFilter]);

  const handleDeletePaper = async (id: string, title: string) => {
    const existing = await repository.papersRepo.getPaper(id);
    if (!existing) return;
    await repository.papersRepo.deletePaper(id);
    addToast({
      title: `Deleted "${title}"`,
      variant: 'default',
      actionLabel: 'Undo',
      onAction: () => {
        void repository.papersRepo.savePaper(existing);
      },
    });
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await repository.papersRepo.duplicatePaper(id);
      addToast({
        title: `Duplicated as "${copy.title}"`,
        variant: 'success',
      });
    } catch (err) {
      addToast({ title: 'Duplicate failed', description: getErrorMessage(err), variant: 'danger' });
    }
  };

  const handleQuickExport = async (paper: PaperRecord, format: PaperExportFormat) => {
    setExportingId(paper.id);
    try {
      const res = await runPaperExport(paper, format, 'A');
      addToast({
        title: `Exported ${res.fileName}`,
        variant: 'success',
      });
    } catch (err) {
      addToast({ title: 'Export failed', description: getErrorMessage(err), variant: 'danger' });
    } finally {
      setExportingId(null);
    }
  };

  const handleOpenHistory = async (paper: PaperRecord) => {
    setHistoryPaper(paper);
    const list = await repository.papersRepo.listPaperVersions(paper.id);
    setVersions(list);
  };

  const handleRestoreVersion = async (paperId: string, version: PaperVersionRecord) => {
    try {
      await repository.papersRepo.restorePaperVersion(paperId, version.id);
      setHistoryPaper(null);
      addToast({
        title: `Restored Version ${version.versionNumber}`,
        variant: 'success',
      });
      navigate(`/app/editor/${paperId}`);
    } catch (err) {
      addToast({ title: 'Restore failed', description: getErrorMessage(err), variant: 'danger' });
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const imported = parseImportedPaperJson(raw);
      await repository.papersRepo.savePaper(imported, `Imported from ${file.name}`);
      addToast({
        title: `Imported "${imported.title}"`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Invalid paper JSON file',
        description: getErrorMessage(err),
        variant: 'danger',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Saved Question Papers
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            All locally authored and generated question papers stored on this device.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={importInputRef}
            type="file"
            aria-label="Import paper JSON file"
            accept=".json,application/json"
            onChange={(e) => void handleImportJson(e)}
            className="hidden"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            leftIcon={<Upload className="h-3.5 w-3.5" />}
          >
            Import JSON
          </Button>
          <Link to="/app/create">
            <Button leftIcon={<FilePlus2 className="h-4 w-4" />}>Create Paper</Button>
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      {papers.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="w-full sm:max-w-xs">
            <Input
              aria-label="Search saved papers"
              placeholder="Search title, subject, board..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leftAdornment={<Search className="h-4 w-4" />}
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] self-start">
            {(['all', 'draft', 'finalized', 'archived'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === status
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      )}

      {papers.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No saved papers yet"
          description="Create a blueprint or load the Class 10 Science sample pack from the Dashboard."
          action={
            <Link to="/app">
              <Button size="sm" variant="outline">
                Go to Dashboard
              </Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No papers match your filter"
          description="Clear the search box or switch the status filter tab."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((paper) => (
            <Card key={paper.id}>
              <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    to={`/app/editor/${paper.id}`}
                    className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--brand-700)] dark:hover:text-[var(--brand-500)]"
                  >
                    {paper.title}
                  </Link>
                  <MetaLine
                    className="mt-1"
                    items={[
                      paper.blueprintSnapshot.header.board,
                      `Class ${paper.blueprintSnapshot.header.classLevel}`,
                      paper.blueprintSnapshot.header.subject,
                      `${paper.blueprintSnapshot.totalMarks} Marks`,
                      `Updated ${formatRelativeTime(paper.updatedAt)}`,
                    ]}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Badge
                    tone={
                      paper.status === 'finalized'
                        ? 'success'
                        : paper.status === 'archived'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {paper.status}
                  </Badge>
                  <Link to={`/app/editor/${paper.id}`}>
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Version history for ${paper.title}`}
                    onClick={() => void handleOpenHistory(paper)}
                    title="Version History"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Duplicate ${paper.title}`}
                    onClick={() => void handleDuplicate(paper.id)}
                    title="Duplicate paper"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={exportingId === paper.id}
                        aria-label={`Quick export ${paper.title}`}
                        title="Quick export"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void handleQuickExport(paper, 'pdf')}>
                        Export PDF (Set A)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => void handleQuickExport(paper, 'answer_key_pdf')}
                      >
                        Export Answer Key PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void handleQuickExport(paper, 'docx')}>
                        Export DOCX (Set A)
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void handleQuickExport(paper, 'json')}>
                        Export Portable JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${paper.title}`}
                    onClick={() => void handleDeletePaper(paper.id, paper.title)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Version History Drawer */}
      <Drawer
        open={Boolean(historyPaper)}
        onOpenChange={(open) => {
          if (!open) setHistoryPaper(null);
        }}
        title={historyPaper ? `History — ${historyPaper.title}` : 'Version History'}
        description="Restore any saved revision snapshot."
      >
        {versions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No version snapshots recorded for this paper yet.
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
                  {historyPaper && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRestoreVersion(historyPaper.id, v)}
                    >
                      Restore &amp; Open
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
