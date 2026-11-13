import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  Download,
  FolderOpen,
  HardDrive,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FileDropzone,
  Input,
  Kbd,
  Label,
  Modal,
  Progress,
  RadioGroup,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/src/components/ui';
import {
  createDebouncedSave,
  repository,
  type StorageUsageStats,
} from '@/src/features/storage/repository';
import {
  applyValidatedBackup,
  exportWorkspaceBackupZip,
  parseAndValidateBackupZip,
  type BackupPreview,
  type RestoreMode,
} from '@/src/features/storage/backup';
import {
  disconnectLibraryFolder,
  getSavedFolderHandle,
  isFileSystemAccessSupported,
  pickLibraryFolder,
  requestSavedFolderPermission,
  type FolderSyncStatus,
} from '@/src/features/storage/folder-sync';
import { changeAppLanguage } from '@/src/lib/i18n';
import { exportErrorLogJson, getErrorMessage } from '@/src/lib/errors';
import { formatBytes, formatDateTime, generateId, sha256Hex } from '@/src/lib/utils';
import {
  DEFAULT_MODELS_BY_PROVIDER,
  testAIConnection,
} from '@/src/features/generation/ai-providers';
import type {
  AIProviderType,
  BoardType,
  LanguageCode,
  SettingsRecord,
  ThemePreference,
} from '@/src/lib/zod-schemas';
import { useUIStore } from '@/src/app/store';

export function SettingsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'profile';

  const settings = useLiveQuery(() => repository.settingsRepo.get(), []);
  const backupMeta = useLiveQuery(() => repository.backupMetaRepo.get(), []);
  const addToast = useUIStore((s) => s.addToast);
  const setTheme = useUIStore((s) => s.setTheme);

  const [usageStats, setUsageStats] = React.useState<StorageUsageStats | null>(null);
  const [folderInfo, setFolderInfo] = React.useState<{
    folderName: string | null;
    status: FolderSyncStatus;
  }>({ folderName: null, status: 'not_configured' });
  const [logoPreviewUrl, setLogoPreviewUrl] = React.useState<string | null>(null);

  const [exporting, setExporting] = React.useState(false);
  const [restorePreview, setRestorePreview] = React.useState<BackupPreview | null>(null);
  const [restoreMode, setRestoreMode] = React.useState<RestoreMode>('merge');
  const [restoreError, setRestoreError] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('');
  const [deletingAll, setDeletingAll] = React.useState(false);

  const [testingAi, setTestingAi] = React.useState(false);
  const [aiTestResult, setAiTestResult] = React.useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const debouncedSaveSettings = React.useMemo(
    () =>
      createDebouncedSave<Partial<Omit<SettingsRecord, 'id'>>>(async (patch) => {
        await repository.settingsRepo.update(patch);
      }, 500),
    []
  );

  const refreshStorageStats = React.useCallback(async () => {
    const [stats, folder] = await Promise.all([
      repository.storageRepo.getUsageStats(),
      getSavedFolderHandle(),
    ]);
    setUsageStats(stats);
    setFolderInfo({ folderName: folder.folderName, status: folder.status });
  }, []);

  React.useEffect(() => {
    let active = true;
    void Promise.all([
      repository.storageRepo.getUsageStats(),
      getSavedFolderHandle(),
    ]).then(([stats, folder]) => {
      if (!active) return;
      setUsageStats(stats);
      setFolderInfo({ folderName: folder.folderName, status: folder.status });
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let activeUrl: string | null = null;
    async function loadLogo() {
      if (!settings?.schoolLogoFileId) {
        setLogoPreviewUrl(null);
        return;
      }
      const file = await repository.libraryRepo.getFile(settings.schoolLogoFileId);
      if (file?.blob) {
        activeUrl = URL.createObjectURL(file.blob);
        setLogoPreviewUrl(activeUrl);
      }
    }
    void loadLogo();
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [settings?.schoolLogoFileId]);

  if (!settings) {
    return <div className="text-sm text-[var(--text-secondary)]">Loading settings…</div>;
  }

  const handleLogoUpload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const id = generateId('logo');
      await repository.libraryRepo.saveFile({
        id,
        name: file.name,
        mimeType: file.type || 'image/png',
        size: file.size,
        sha256: hash,
        category: 'logo',
        createdAt: Date.now(),
        blob: file,
      });
      await repository.settingsRepo.update({ schoolLogoFileId: id });
      addToast({ title: 'School logo saved locally', variant: 'success' });
    } catch (err) {
      addToast({ title: 'Logo upload failed', description: getErrorMessage(err), variant: 'danger' });
    }
  };

  const handleRequestPersistence = async () => {
    const granted = await repository.storageRepo.requestPersistence();
    await refreshStorageStats();
    addToast({
      title: granted ? 'Persistent storage granted' : 'Browser declined persistent storage',
      description: granted
        ? 'Your browser will protect IndexedDB data from automatic eviction.'
        : 'Use Folder Sync or regular ZIP backups to safeguard your files.',
      variant: granted ? 'success' : 'warning',
    });
  };

  const handlePickFolder = async () => {
    try {
      const res = await pickLibraryFolder();
      if (res) {
        await repository.settingsRepo.update({
          folderSyncEnabled: true,
          folderName: res.folderName,
        });
        await refreshStorageStats();
        addToast({
          title: 'Library folder linked',
          description: `Folder "${res.folderName}" is ready for auto-sync.`,
          variant: 'success',
        });
      }
    } catch (err) {
      addToast({
        title: 'Could not link folder',
        description: getErrorMessage(err),
        variant: 'warning',
      });
    }
  };

  const handleReauthorizeFolder = async () => {
    const ok = await requestSavedFolderPermission();
    await refreshStorageStats();
    addToast({
      title: ok ? 'Folder permission restored' : 'Permission still needed',
      variant: ok ? 'success' : 'warning',
    });
  };

  const handleDisconnectFolder = async () => {
    await disconnectLibraryFolder();
    await repository.settingsRepo.update({ folderSyncEnabled: false, folderName: undefined });
    await refreshStorageStats();
    addToast({ title: 'Folder sync disconnected', variant: 'default' });
  };

  const handleExportZip = async () => {
    setExporting(true);
    try {
      const { blob, fileName } = await exportWorkspaceBackupZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      await refreshStorageStats();
      addToast({ title: 'Backup ZIP exported', description: fileName, variant: 'success' });
    } catch (err) {
      addToast({ title: 'Backup failed', description: getErrorMessage(err), variant: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  const handleBackupZipSelected = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setRestoreError(null);
    try {
      const preview = await parseAndValidateBackupZip(file);
      setRestorePreview(preview);
    } catch (err) {
      setRestorePreview(null);
      setRestoreError(getErrorMessage(err));
    }
  };

  const handleApplyRestore = async () => {
    if (!restorePreview) return;
    setRestoring(true);
    try {
      await applyValidatedBackup(restorePreview, restoreMode);
      setRestorePreview(null);
      await refreshStorageStats();
      addToast({
        title: 'Backup restored successfully',
        description: `Applied in ${restoreMode} mode.`,
        variant: 'success',
      });
    } catch (err) {
      setRestoreError(getErrorMessage(err));
    } finally {
      setRestoring(false);
    }
  };

  const handleDownloadErrorLog = () => {
    const json = exportErrorLogJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edupulse-error-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAllData = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingAll(true);
    try {
      await repository.storageRepo.deleteAllUserData();
      setDeleteModalOpen(false);
      setDeleteConfirmText('');
      await refreshStorageStats();
      addToast({
        title: 'All local workspace data deleted',
        description: 'Built-in board templates remain available.',
        variant: 'default',
      });
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          {t('settings.title')}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('settings.subtitle')}</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          searchParams.set('tab', val);
          setSearchParams(searchParams, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="profile">{t('settings.tabs.profile')}</TabsTrigger>
          <TabsTrigger value="storage">{t('settings.tabs.storage')}</TabsTrigger>
          <TabsTrigger value="ai">{t('settings.tabs.ai')}</TabsTrigger>
          <TabsTrigger value="appearance">{t('settings.tabs.appearance')}</TabsTrigger>
          <TabsTrigger value="shortcuts">{t('settings.tabs.shortcuts')}</TabsTrigger>
        </TabsList>

        {/* Profile & School */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>School Header &amp; Teaching Defaults</CardTitle>
                <CardDescription>
                  Pre-fills headers when creating a new question paper blueprint. Changes autosave
                  locally.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="set-teacher">Teacher Name</Label>
                  <Input
                    id="set-teacher"
                    defaultValue={settings.teacherName}
                    onChange={(e) => debouncedSaveSettings({ teacherName: e.target.value })}
                    placeholder="e.g., Sunita Deshmukh"
                  />
                </div>
                <div>
                  <Label htmlFor="set-school">School Name</Label>
                  <Input
                    id="set-school"
                    defaultValue={settings.schoolName}
                    onChange={(e) => debouncedSaveSettings({ schoolName: e.target.value })}
                    placeholder="e.g., Saraswati Vidyalaya, Pune"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Default Board</Label>
                  <Select
                    value={settings.defaultBoard}
                    onValueChange={(v) =>
                      void repository.settingsRepo.update({ defaultBoard: v as BoardType })
                    }
                    ariaLabel="Default Board"
                    options={[
                      { value: 'CBSE', label: 'CBSE' },
                      { value: 'ICSE', label: 'ICSE' },
                      { value: 'MAHARASHTRA', label: 'Maharashtra State Board' },
                      { value: 'OTHER', label: 'Other' },
                    ]}
                  />
                </div>
                <div>
                  <Label>Default Class</Label>
                  <Select
                    value={String(settings.defaultClassLevel)}
                    onValueChange={(v) =>
                      void repository.settingsRepo.update({ defaultClassLevel: Number(v) })
                    }
                    ariaLabel="Default Class"
                    options={Array.from({ length: 12 }, (_, idx) => ({
                      value: String(idx + 1),
                      label: `Class ${idx + 1}`,
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="set-subject">Default Subject</Label>
                  <Input
                    id="set-subject"
                    defaultValue={settings.defaultSubject}
                    onChange={(e) => debouncedSaveSettings({ defaultSubject: e.target.value })}
                    placeholder="e.g., Science"
                  />
                </div>
              </div>

              <div className="border-t border-[var(--border-hairline)] pt-5">
                <Label>School Emblem / Logo (stored locally as Blob)</Label>
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-4">
                  {logoPreviewUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={logoPreviewUrl}
                        alt="School logo preview"
                        className="h-14 w-14 rounded-lg border border-[var(--border-hairline)] object-contain bg-white p-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void repository.settingsRepo.update({ schoolLogoFileId: undefined })
                        }
                      >
                        Remove Logo
                      </Button>
                    </div>
                  ) : (
                    <FileDropzone
                      accept={['.png', '.jpg', '.jpeg', '.webp', '.svg']}
                      maxSizeBytes={2 * 1024 * 1024}
                      onFilesSelected={(files) => void handleLogoUpload(files)}
                      onError={(msg) => addToast({ title: msg, variant: 'danger' })}
                      title="Upload school logo (PNG, JPG, SVG under 2 MB)"
                      className="w-full sm:max-w-md py-5"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage & Backup */}
        <TabsContent value="storage" className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>IndexedDB Usage &amp; Persistence</CardTitle>
                <CardDescription>
                  Monitor browser storage quota and lock persistent storage to prevent automatic
                  browser cleanup.
                </CardDescription>
              </div>
              <HardDrive className="h-4 w-4 text-[var(--text-muted)]" />
            </CardHeader>
            <CardContent className="space-y-4">
              {usageStats && (
                <>
                  <Progress
                    value={usageStats.percentUsed}
                    label={`${formatBytes(usageStats.usageBytes)} used${
                      usageStats.quotaBytes > 0
                        ? ` of ${formatBytes(usageStats.quotaBytes)}`
                        : ''
                    }`}
                  />
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                    <span>Books: {usageStats.counts.books}</span>
                    <span>Chapters: {usageStats.counts.chapters}</span>
                    <span>Chunks: {usageStats.counts.chunks}</span>
                    <span>Questions: {usageStats.counts.questions}</span>
                    <span>Papers: {usageStats.counts.papers}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
                    <div className="text-xs text-[var(--text-secondary)]">
                      Persistent storage status:{' '}
                      <strong className="text-[var(--text-primary)]">
                        {usageStats.isPersisted ? 'Persisted' : 'Best-effort'}
                      </strong>
                    </div>
                    {!usageStats.isPersisted && (
                      <Button size="sm" variant="outline" onClick={() => void handleRequestPersistence()}>
                        Request Persistent Storage
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Local Folder Auto-Sync (File System Access API)</CardTitle>
                <CardDescription>
                  Auto-save textbooks, question banks, papers, and PDF/DOCX exports directly into an
                  &ldquo;EduPulse Library&rdquo; folder on your computer.
                </CardDescription>
              </div>
              <Badge
                tone={
                  folderInfo.status === 'granted'
                    ? 'success'
                    : folderInfo.status === 'prompt'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {folderInfo.status === 'granted'
                  ? 'Connected'
                  : folderInfo.status === 'prompt'
                    ? 'Permission Expired'
                    : folderInfo.status === 'unsupported'
                      ? 'Browser Unsupported'
                      : 'Not Configured'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isFileSystemAccessSupported() ? (
                <Alert tone="info" title="Using browser ZIP backup mode">
                  Your current browser does not support direct folder access (supported in Chrome
                  and Edge). Exports auto-download directly, and you can use full ZIP backups below.
                </Alert>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-[var(--text-secondary)]">
                    {folderInfo.folderName
                      ? `Linked folder: "${folderInfo.folderName}"`
                      : 'No folder linked yet. Subfolders /Textbooks, /QuestionBanks, /Papers, and /Exports will be created automatically.'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {folderInfo.status === 'prompt' && (
                      <Button
                        size="sm"
                        onClick={() => void handleReauthorizeFolder()}
                        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                      >
                        Re-authorize Folder
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handlePickFolder()}
                      leftIcon={<FolderOpen className="h-3.5 w-3.5" />}
                    >
                      {folderInfo.folderName ? 'Change Folder' : 'Pick Library Folder'}
                    </Button>
                    {folderInfo.folderName && (
                      <Button size="sm" variant="ghost" onClick={() => void handleDisconnectFolder()}>
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Full Workspace Backup &amp; Validated Restore</CardTitle>
                <CardDescription>
                  Backups are schema-validated with Zod before modifying any existing local data.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
                <div className="text-xs text-[var(--text-secondary)]">
                  <div>
                    Last backup:{' '}
                    <strong className="text-[var(--text-primary)]">
                      {backupMeta?.lastBackupAt
                        ? formatDateTime(backupMeta.lastBackupAt)
                        : 'No backup exported yet'}
                    </strong>
                  </div>
                  <div className="mt-0.5">
                    Papers created since backup:{' '}
                    <span className="font-mono tabular-nums">
                      {backupMeta?.papersSinceLastBackup ?? 0}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  loading={exporting}
                  onClick={() => void handleExportZip()}
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                >
                  {t('actions.exportBackup')}
                </Button>
              </div>

              <div className="space-y-3">
                <Label>Restore from Backup ZIP</Label>
                <FileDropzone
                  accept={['.zip']}
                  maxSizeBytes={250 * 1024 * 1024}
                  onFilesSelected={(files) => void handleBackupZipSelected(files)}
                  onError={(msg) => setRestoreError(msg)}
                  title="Select an edupulse-backup-*.zip archive"
                  description="We validate manifest.json and every record before applying changes."
                />
                {restoreError && (
                  <Alert tone="danger" title="Invalid backup file">
                    {restoreError}
                  </Alert>
                )}

                {restorePreview && (
                  <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-page)] p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--success-text)]" />
                      <span>
                        Validated Backup (v{restorePreview.schemaVersion}, exported{' '}
                        {formatDateTime(restorePreview.exportedAt)})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                      <span>Books: {restorePreview.counts.books}</span>
                      <span>Questions: {restorePreview.counts.questions}</span>
                      <span>Papers: {restorePreview.counts.papers}</span>
                      <span>Files: {restorePreview.counts.files}</span>
                    </div>

                    <RadioGroup
                      value={restoreMode}
                      onValueChange={(v) => setRestoreMode(v as RestoreMode)}
                      options={[
                        {
                          value: 'merge',
                          label: 'Merge with existing workspace',
                          description: 'Keeps current items and updates/adds items from the backup.',
                        },
                        {
                          value: 'overwrite',
                          label: 'Overwrite entire workspace',
                          description: 'Clears current local database first, then restores backup.',
                        },
                      ]}
                    />

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        loading={restoring}
                        onClick={() => void handleApplyRestore()}
                        leftIcon={<Upload className="h-3.5 w-3.5" />}
                      >
                        Apply Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRestorePreview(null)}
                        disabled={restoring}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border-hairline)] pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    Diagnostics &amp; Danger Zone
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Download your local error log or permanently erase all device data.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleDownloadErrorLog}>
                    Export Error Log
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteModalOpen(true)}
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  >
                    Delete all my data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Provider */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>AI Provider Configuration (Optional)</CardTitle>
                <CardDescription>
                  EduPulse works offline in bank-only mode without any AI provider. Configure a
                  provider when you want AI-assisted question generation in Phase 3.
                </CardDescription>
              </div>
              <KeyRound className="h-4 w-4 text-[var(--text-muted)]" />
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert tone="warning" title="Restricted-key security notice">
                If you enter a personal BYOK API key, it is stored only in your browser&apos;s
                local IndexedDB and never sent to any EduPulse server. Use a spending-capped or
                restricted key and avoid saving personal keys on shared school computers.
              </Alert>

              <div>
                <Label>Generation Mode</Label>
                <Select
                  value={settings.aiProvider}
                  onValueChange={(v) => {
                    const provider = v as AIProviderType;
                    const defaultModel = DEFAULT_MODELS_BY_PROVIDER[provider][0] ?? settings.aiModel;
                    setAiTestResult(null);
                    void repository.settingsRepo.update({
                      aiProvider: provider,
                      aiModel: defaultModel,
                    });
                  }}
                  ariaLabel="AI Provider Mode"
                  options={[
                    { value: 'none', label: 'Offline / Bank-Only (No AI calls)' },
                    { value: 'gemini', label: 'Google Gemini (BYOK)' },
                    { value: 'openai', label: 'OpenAI (BYOK)' },
                    { value: 'anthropic', label: 'Anthropic Claude (BYOK)' },
                    { value: 'proxy', label: 'Stateless Server Proxy (/api/ai)' },
                  ]}
                />
              </div>

              {settings.aiProvider !== 'none' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="ai-model">Model Identifier</Label>
                      <Input
                        id="ai-model"
                        key={`${settings.aiProvider}-${settings.aiModel}`}
                        defaultValue={settings.aiModel}
                        onChange={(e) => debouncedSaveSettings({ aiModel: e.target.value })}
                        placeholder="gemini-4-hydrogen"
                      />
                      {DEFAULT_MODELS_BY_PROVIDER[settings.aiProvider].length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {DEFAULT_MODELS_BY_PROVIDER[settings.aiProvider].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                void repository.settingsRepo.update({ aiModel: preset })
                              }
                              className="rounded border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {settings.aiProvider === 'proxy' ? (
                      <div>
                        <Label htmlFor="ai-proxy">Stateless Proxy Endpoint</Label>
                        <Input
                          id="ai-proxy"
                          defaultValue={settings.proxyEndpoint}
                          onChange={(e) =>
                            debouncedSaveSettings({ proxyEndpoint: e.target.value })
                          }
                          placeholder="/api/ai/generate"
                        />
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="ai-key">
                          Provider API Key (stored locally in IndexedDB)
                        </Label>
                        <Input
                          id="ai-key"
                          type="password"
                          autoComplete="off"
                          defaultValue={settings.aiApiKey}
                          onChange={(e) => debouncedSaveSettings({ aiApiKey: e.target.value })}
                          placeholder="Paste restricted API key…"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={testingAi}
                      onClick={async () => {
                        setTestingAi(true);
                        setAiTestResult(null);
                        try {
                          const fresh = await repository.settingsRepo.get();
                          const res = await testAIConnection(fresh);
                          setAiTestResult({ ok: true, message: res.message });
                        } catch (err) {
                          setAiTestResult({ ok: false, message: getErrorMessage(err) });
                        } finally {
                          setTestingAi(false);
                        }
                      }}
                    >
                      Test Connection
                    </Button>
                  </div>

                  {aiTestResult && (
                    <Alert tone={aiTestResult.ok ? 'success' : 'danger'}>
                      {aiTestResult.message}
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance & Language */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Appearance &amp; Language</CardTitle>
                <CardDescription>
                  Preferences persist locally across sessions and apply across all workspace screens.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label>Color Theme</Label>
                  <Select
                    value={settings.theme}
                    onValueChange={(v) => {
                      const next = v as ThemePreference;
                      setTheme(next);
                      void repository.settingsRepo.update({ theme: next });
                    }}
                    ariaLabel="Color Theme"
                    options={[
                      { value: 'system', label: 'Follow System Preference' },
                      { value: 'light', label: 'Light Mode' },
                      { value: 'dark', label: 'Dark Mode' },
                    ]}
                  />
                </div>
                <div>
                  <Label>Workspace Language</Label>
                  <Select
                    value={settings.language}
                    onValueChange={(v) => {
                      const lang = v as LanguageCode;
                      changeAppLanguage(lang);
                      void repository.settingsRepo.update({ language: lang });
                    }}
                    ariaLabel="Workspace Language"
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'hi', label: 'हिन्दी (Hindi)' },
                      { value: 'mr', label: 'मराठी (Marathi)' },
                    ]}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shortcuts */}
        <TabsContent value="shortcuts">
          <Card>
            <CardHeader>
              <CardTitle>Keyboard Shortcuts</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-[var(--border-hairline)]">
              {[
                ['Open Quick Command Palette', 'Ctrl / Cmd + K'],
                ['Open Keyboard Shortcuts Modal', '?'],
                ['Close Dialogs or Menus', 'Esc'],
              ].map(([action, keys]) => (
                <div key={action} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-[var(--text-secondary)]">{action}</span>
                  <Kbd>{keys}</Kbd>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete All Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete all local workspace data?"
        description="This permanently removes all uploaded textbooks, question banks, blueprints, and saved papers from this browser."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deletingAll}
              disabled={deleteConfirmText !== 'DELETE'}
              onClick={() => void handleDeleteAllData()}
            >
              Permanently Delete All Data
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="danger" title="This action cannot be undone">
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5 inline" /> Export a backup ZIP first if you want
              to keep any files.
            </span>
          </Alert>
          <div>
            <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
            <Input
              id="confirm-delete"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
