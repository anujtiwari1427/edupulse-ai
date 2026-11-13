import { db } from './db';
import { slugifyPathSegment } from '@/src/lib/utils';
import { logger } from '@/src/lib/logger';

export type FolderSyncStatus =
  | 'unsupported'
  | 'not_configured'
  | 'granted'
  | 'prompt'
  | 'denied';

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

interface PermissionHandle extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === 'function'
  );
}

export async function pickLibraryFolder(): Promise<{ folderName: string } | null> {
  if (!isFileSystemAccessSupported()) return null;
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;

  const handle = await picker({
    id: 'edupulse-library',
    mode: 'readwrite',
    startIn: 'documents',
  });

  await ensureSubfolders(handle);

  await db.fsHandles.put({
    id: 'library_root',
    folderName: handle.name,
    handle,
    updatedAt: Date.now(),
  });

  return { folderName: handle.name };
}

export async function getSavedFolderHandle(): Promise<{
  folderName: string | null;
  status: FolderSyncStatus;
  handle: FileSystemDirectoryHandle | null;
}> {
  if (!isFileSystemAccessSupported()) {
    return { folderName: null, status: 'unsupported', handle: null };
  }

  const record = await db.fsHandles.get('library_root');
  if (!record) {
    return { folderName: null, status: 'not_configured', handle: null };
  }

  try {
    const permHandle = record.handle as PermissionHandle;
    const state = permHandle.queryPermission
      ? await permHandle.queryPermission({ mode: 'readwrite' })
      : 'granted';

    return {
      folderName: record.folderName,
      status: state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt',
      handle: record.handle,
    };
  } catch (err) {
    logger.warn(`Failed to query folder permission: ${String(err)}`, 'folder-sync');
    return { folderName: record.folderName, status: 'prompt', handle: record.handle };
  }
}

export async function requestSavedFolderPermission(): Promise<boolean> {
  const record = await db.fsHandles.get('library_root');
  if (!record) return false;
  try {
    const permHandle = record.handle as PermissionHandle;
    if (!permHandle.requestPermission) return true;
    const result = await permHandle.requestPermission({ mode: 'readwrite' });
    if (result === 'granted') {
      await ensureSubfolders(record.handle);
      return true;
    }
    return false;
  } catch (err) {
    logger.warn(`Folder permission re-grant failed: ${String(err)}`, 'folder-sync');
    return false;
  }
}

export async function disconnectLibraryFolder(): Promise<void> {
  await db.fsHandles.delete('library_root');
}

async function ensureSubfolders(root: FileSystemDirectoryHandle): Promise<void> {
  await root.getDirectoryHandle('Textbooks', { create: true });
  await root.getDirectoryHandle('QuestionBanks', { create: true });
  await root.getDirectoryHandle('Papers', { create: true });
  await root.getDirectoryHandle('Exports', { create: true });
}

export async function writeFileToLibraryFolder(
  subPath: string[],
  fileName: string,
  content: Blob | string
): Promise<boolean> {
  const { status, handle } = await getSavedFolderHandle();
  if (status !== 'granted' || !handle) return false;

  try {
    let dir = handle;
    for (const segment of subPath) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    logger.error(err, 'folder-sync-write');
    return false;
  }
}

export function buildPaperFolderSegments(classLevel: number, subject: string): string[] {
  return ['Papers', `class-${classLevel}-${slugifyPathSegment(subject)}`];
}
