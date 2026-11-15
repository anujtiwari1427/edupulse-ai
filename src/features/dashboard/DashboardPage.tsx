import * as React from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  FolderSync,
  GraduationCap,
  HardDrive,
  HelpCircle,
  LayoutTemplate,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '@/src/features/storage/db';
import { repository, type StorageUsageStats } from '@/src/features/storage/repository';
import { exportWorkspaceBackupZip, isBackupDue } from '@/src/features/storage/backup';
import {
  getSavedFolderHandle,
  type FolderSyncStatus,
} from '@/src/features/storage/folder-sync';
import { loadSampleClass10Library } from '@/src/features/storage/sample-data';
import { formatBytes, formatRelativeTime } from '@/src/lib/utils';
import { useUIStore } from '@/src/app/store';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  MetaLine,
  Progress,
} from '@/src/components/ui';

import type { BookRecord, PaperRecord } from '@/src/lib/zod-schemas';

const EMPTY_PAPERS: PaperRecord[] = [];
const EMPTY_BOOKS: BookRecord[] = [];

export function DashboardPage() {
  const { t } = useTranslation();
  const addToast = useUIStore((s) => s.addToast);

  const papers =
    useLiveQuery(() => repository.papersRepo.listPapers(), [], EMPTY_PAPERS) ?? EMPTY_PAPERS;
  const books =
    useLiveQuery(() => repository.libraryRepo.listBooks(), [], EMPTY_BOOKS) ?? EMPTY_BOOKS;
  const settings = useLiveQuery(() => repository.settingsRepo.get(), []);
  const backupMeta = useLiveQuery(() => repository.backupMetaRepo.get(), []);
  const questionCount = useLiveQuery(() => db.questions.count(), [], 0) ?? 0;
  const templateCount = useLiveQuery(() => db.templates.count(), [], 0) ?? 0;

  const [usageStats, setUsageStats] = React.useState<StorageUsageStats | null>(null);
  const [folderStatus, setFolderStatus] = React.useState<{
    folderName: string | null;
    status: FolderSyncStatus;
  }>({ folderName: null, status: 'not_configured' });
  const [exportingBackup, setExportingBackup] = React.useState(false);
  const [loadingSample, setLoadingSample] = React.useState(false);

  React.useEffect(() => {
    void repository.storageRepo.getUsageStats().then(setUsageStats);
    void getSavedFolderHandle().then((res) =>
      setFolderStatus({ folderName: res.folderName, status: res.status })
    );
  }, [papers.length, books.length, questionCount]);

  const backupDue = Boolean(backupMeta && settings && isBackupDue(backupMeta, settings));

  const handleExportBackup = async () => {
    setExportingBackup(true);
    try {
      const { blob, fileName } = await exportWorkspaceBackupZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      addToast({
        title: 'Backup ZIP saved',
        description: fileName,
        variant: 'success',
      });
    } catch {
      addToast({
        title: 'Could not export backup',
        variant: 'danger',
      });
    } finally {
      setExportingBackup(false);
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      const res = await loadSampleClass10Library();
      addToast({
        title: 'Sample Class 10 Science library loaded',
        description: `Added NCERT sample chapters and ${res.questionsAdded} questions.`,
        variant: 'success',
      });
    } catch {
      addToast({ title: 'Could not load sample library', variant: 'danger' });
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Cockpit Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-900/10 via-indigo-600/5 to-purple-600/10 p-6 sm:p-7 shadow-xs">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-indigo-500/10 blur-2xl"
        />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              <span className="flex items-center gap-1.5 rounded-full bg-indigo-100/80 dark:bg-indigo-950/70 px-2.5 py-0.5 border border-indigo-200 dark:border-indigo-800">
                <GraduationCap className="h-3.5 w-3.5" />
                {settings?.schoolName || 'School Examination Studio'}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-emerald-100/80 dark:bg-emerald-950/70 px-2.5 py-0.5 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                100% Local-First
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
              {t('dashboard.title')}
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              Design balanced question papers for CBSE, ICSE & Maharashtra State Board with deterministic marks arithmetic, multi-set generation, and instant print-ready exports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link to="/app/create">
              <Button size="lg" leftIcon={<FilePlus2 className="h-4 w-4" />}>
                {t('actions.createPaper')}
              </Button>
            </Link>
            {books.length === 0 && (
              <Button
                size="lg"
                variant="outline"
                loading={loadingSample}
                onClick={() => void handleLoadSample()}
                leftIcon={<Sparkles className="h-4 w-4" />}
              >
                Load Sample Pack
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Contextual Alerts */}
      {backupDue && (
        <Alert
          tone="warning"
          title="Local backup recommended"
          action={
            <Button
              size="sm"
              variant="outline"
              loading={exportingBackup}
              onClick={() => void handleExportBackup()}
              leftIcon={<Download className="h-3.5 w-3.5" />}
            >
              {t('actions.exportBackup')}
            </Button>
          }
        >
          You have created {backupMeta?.papersSinceLastBackup ?? 0} papers since your last backup.
          Export a ZIP archive so your work stays safe outside browser storage.
        </Alert>
      )}

      {usageStats?.isLowQuota && (
        <Alert
          tone="danger"
          title="Browser storage quota is running low"
          action={
            <Link to="/app/settings?tab=storage">
              <Button size="sm" variant="outline">
                Manage Storage
              </Button>
            </Link>
          }
        >
          Used {formatBytes(usageStats.usageBytes)} of {formatBytes(usageStats.quotaBytes)}.
          Export a backup ZIP and clear unused PDFs to free space.
        </Alert>
      )}

      {/* Modern KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Textbooks & Banks',
            value: books.length,
            to: '/app/library',
            icon: BookOpen,
            badge: 'NCERT / State',
            color: 'from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400',
          },
          {
            label: 'Question Bank',
            value: questionCount,
            to: '/app/library',
            icon: Sparkles,
            badge: 'Tagged & Indexed',
            color: 'from-purple-500/10 to-indigo-500/10 text-purple-600 dark:text-purple-400',
          },
          {
            label: 'Saved Papers',
            value: papers.length,
            to: '/app/papers',
            icon: FileText,
            badge: 'Sets A/B/C',
            color: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Board Blueprints',
            value: templateCount,
            to: '/app/templates',
            icon: LayoutTemplate,
            badge: 'CBSE / ICSE / SSC',
            color: 'from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400',
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className="group relative overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">{item.label}</span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} transition-transform group-hover:scale-110`}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
                  {item.value}
                </div>
                <span className="text-[10px] font-medium text-[var(--text-muted)] tracking-tight">
                  {item.badge}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Question Papers */}
        <div className="lg:col-span-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">{t('dashboard.continueDrafts')}</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Recent question papers authored or generated in this browser
                </p>
              </div>
              {papers.length > 0 && (
                <Link
                  to="/app/papers"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>View all ({papers.length})</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {papers.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-6 w-6" />}
                  title={t('dashboard.noDraftsTitle')}
                  description="You haven't created any question papers yet. Load our sample Class 10 Science library or create your first paper from scratch."
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <Button
                        size="md"
                        variant="primary"
                        loading={loadingSample}
                        onClick={() => void handleLoadSample()}
                        leftIcon={<Sparkles className="h-4 w-4" />}
                      >
                        {t('actions.loadSample')}
                      </Button>
                      <Link to="/app/library">
                        <Button size="md" variant="secondary" leftIcon={<BookOpen className="h-4 w-4" />}>
                          {t('actions.uploadTextbook')}
                        </Button>
                      </Link>
                    </div>
                  }
                />
              ) : (
                <div className="divide-y divide-[var(--border-hairline)]">
                  {papers.slice(0, 5).map((paper) => (
                    <div
                      key={paper.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0 hover:bg-[var(--bg-subtle)]/40 px-2 -mx-2 rounded-xl transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <Link
                          to={`/app/editor/${paper.id}`}
                          className="text-sm font-bold text-[var(--text-primary)] hover:text-indigo-600 dark:hover:text-indigo-400 truncate block transition-colors"
                        >
                          {paper.title}
                        </Link>
                        <MetaLine
                          items={[
                            paper.blueprintSnapshot.header.board,
                            `Class ${paper.blueprintSnapshot.header.classLevel}`,
                            paper.blueprintSnapshot.header.subject,
                            `${paper.blueprintSnapshot.totalMarks} Marks`,
                            `Updated ${formatRelativeTime(paper.updatedAt)}`,
                          ]}
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          tone={paper.status === 'finalized' ? 'success' : 'neutral'}
                          dot={paper.status === 'finalized'}
                        >
                          {paper.status === 'finalized' ? 'Finalized' : 'Draft'}
                        </Badge>
                        <Link to={`/app/editor/${paper.id}`}>
                          <Button size="sm" variant="outline" rightIcon={<ArrowRight className="h-3 w-3" />}>
                            Open Studio
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Storage & Quick Actions */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold">{t('dashboard.storageHealth')}</CardTitle>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">IndexedDB Local Space</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                <HardDrive className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {usageStats && (
                <Progress
                  value={usageStats.percentUsed}
                  label={`${formatBytes(usageStats.usageBytes)} used${
                    usageStats.quotaBytes > 0
                      ? ` of ${formatBytes(usageStats.quotaBytes)}`
                      : ''
                  }`}
                />
              )}

              <div className="space-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50 p-3 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Persistent Storage
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {usageStats?.isPersisted ? 'Granted' : 'Standard'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Folder auto-sync</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {folderStatus.status === 'granted' && folderStatus.folderName
                      ? folderStatus.folderName
                      : folderStatus.status === 'prompt'
                        ? 'Needs re-permission'
                        : folderStatus.status === 'unsupported'
                          ? 'ZIP fallback'
                          : 'Not linked'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last backup</span>
                  <span className="font-mono tabular-nums text-[var(--text-primary)]">
                    {backupMeta?.lastBackupAt
                      ? formatRelativeTime(backupMeta.lastBackupAt)
                      : 'Never'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  loading={exportingBackup}
                  onClick={() => void handleExportBackup()}
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                  className="w-full justify-center"
                >
                  {t('actions.exportBackup')}
                </Button>
                <Link to="/app/settings?tab=storage" className="block">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-center text-xs"
                    leftIcon={<FolderSync className="h-3.5 w-3.5" />}
                  >
                    Storage &amp; Folder Settings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">{t('dashboard.quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/app/library" className="block">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  leftIcon={<BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
                >
                  {t('actions.uploadTextbook')}
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                loading={loadingSample}
                onClick={() => void handleLoadSample()}
                leftIcon={<Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
              >
                {t('actions.loadSample')}
              </Button>
              <Link to="/app/templates" className="block">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  leftIcon={<LayoutTemplate className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                >
                  Browse Board Templates
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
