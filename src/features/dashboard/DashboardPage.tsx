import * as React from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  BookOpen,
  Download,
  FilePlus2,
  FileText,
  FolderSync,
  HardDrive,
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
      {/* Header Row with single primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('dashboard.title')}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('dashboard.subtitle')}</p>
        </div>

        <Link to="/app/create">
          <Button leftIcon={<FilePlus2 className="h-4 w-4" />}>
            {t('actions.createPaper')}
          </Button>
        </Link>
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

      {/* Real Workspace Counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Textbooks & Banks', value: books.length, to: '/app/library' },
          { label: 'Indexed Questions', value: questionCount, to: '/app/library' },
          { label: 'Saved Papers', value: papers.length, to: '/app/papers' },
          { label: 'Board Templates', value: templateCount, to: '/app/templates' },
        ].map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 hover:border-[var(--border-strong)] transition-colors"
          >
            <div className="text-xs font-medium text-[var(--text-secondary)]">{item.label}</div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
              {item.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Question Papers */}
        <div className="lg:col-span-8">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t('dashboard.continueDrafts')}</CardTitle>
              </div>
              {papers.length > 0 && (
                <Link
                  to="/app/papers"
                  className="text-xs font-medium text-[var(--brand-700)] dark:text-[var(--brand-500)] hover:underline inline-flex items-center gap-1"
                >
                  <span>View all</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {papers.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-5 w-5" />}
                  title={t('dashboard.noDraftsTitle')}
                  description={t('dashboard.noDraftsDesc')}
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={loadingSample}
                        onClick={() => void handleLoadSample()}
                        leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                      >
                        {t('actions.loadSample')}
                      </Button>
                      <Link to="/app/library">
                        <Button size="sm" variant="secondary">
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
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/app/editor/${paper.id}`}
                          className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--brand-700)] dark:hover:text-[var(--brand-500)] truncate block"
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
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge tone={paper.status === 'finalized' ? 'success' : 'neutral'}>
                          {paper.status === 'finalized' ? 'Finalized' : 'Draft'}
                        </Badge>
                        <Link to={`/app/editor/${paper.id}`}>
                          <Button size="sm" variant="outline">
                            Open
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
            <CardHeader>
              <CardTitle>{t('dashboard.storageHealth')}</CardTitle>
              <HardDrive className="h-4 w-4 text-[var(--text-muted)]" />
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

              <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center justify-between">
                  <span>Persistent storage</span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {usageStats?.isPersisted ? 'Granted' : 'Standard'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Folder sync</span>
                  <span className="font-medium text-[var(--text-primary)]">
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
                >
                  {t('actions.exportBackup')}
                </Button>
                <Link to="/app/settings?tab=storage">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
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
              <CardTitle>{t('dashboard.quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/app/library" className="block">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  leftIcon={<BookOpen className="h-4 w-4" />}
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
                leftIcon={<Sparkles className="h-4 w-4" />}
              >
                {t('actions.loadSample')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
