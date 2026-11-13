import * as React from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  Home,
  LayoutTemplate,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useUIStore } from '@/src/app/store';
import { exportWorkspaceBackupZip } from '@/src/features/storage/backup';
import { repository } from '@/src/features/storage/repository';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const navigate = useNavigate();
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${idx}`}>
            {idx > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            )}
            {item.to && !isLast ? (
              <button
                type="button"
                onClick={() => navigate(item.to!)}
                className="truncate text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={cn(
                  'truncate',
                  isLast
                    ? 'font-medium text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-1.5 font-mono text-[11px] font-medium text-[var(--text-secondary)]',
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUIStore.getState().commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  if (!open) return null;

  const runNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleQuickBackup = async () => {
    setOpen(false);
    try {
      const { blob, fileName } = await exportWorkspaceBackupZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      addToast({
        title: 'Backup ZIP exported',
        description: fileName,
        variant: 'success',
      });
    } catch {
      addToast({ title: 'Backup failed', variant: 'danger' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Palette">
          <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3.5">
            <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Jump to screen or run an action…"
              className="h-11 w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2 text-sm">
            <Command.Empty className="py-8 text-center text-xs text-[var(--text-muted)]">
              No matching commands.
            </Command.Empty>
            <Command.Group
              heading="Navigation"
              className="px-2 py-1.5 text-xs font-medium text-[var(--text-muted)]"
            >
              <CommandItem onSelect={() => runNav('/app')} icon={<Home className="h-4 w-4" />}>
                Dashboard
              </CommandItem>
              <CommandItem
                onSelect={() => runNav('/app/library')}
                icon={<BookOpen className="h-4 w-4" />}
              >
                Textbook & Question Library
              </CommandItem>
              <CommandItem
                onSelect={() => runNav('/app/create')}
                icon={<FilePlus2 className="h-4 w-4" />}
              >
                Create Question Paper
              </CommandItem>
              <CommandItem
                onSelect={() => runNav('/app/papers')}
                icon={<FileText className="h-4 w-4" />}
              >
                Saved Papers
              </CommandItem>
              <CommandItem
                onSelect={() => runNav('/app/templates')}
                icon={<LayoutTemplate className="h-4 w-4" />}
              >
                Board Templates
              </CommandItem>
              <CommandItem
                onSelect={() => runNav('/app/settings')}
                icon={<Settings className="h-4 w-4" />}
              >
                Settings & Backup
              </CommandItem>
            </Command.Group>

            <Command.Group
              heading="Workspace Actions"
              className="mt-2 px-2 py-1.5 text-xs font-medium text-[var(--text-muted)]"
            >
              <CommandItem onSelect={handleQuickBackup} icon={<Download className="h-4 w-4" />}>
                Export Full Backup ZIP
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  const next = theme === 'dark' ? 'light' : 'dark';
                  setTheme(next);
                  void repository.settingsRepo.update({ theme: next });
                  setOpen(false);
                }}
                icon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              >
                Switch to {theme === 'dark' ? 'Light' : 'Dark'} Appearance
              </CommandItem>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function CommandItem({
  children,
  icon,
  onSelect,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--text-primary)] cursor-pointer aria-selected:bg-[var(--bg-subtle)]"
    >
      <span className="text-[var(--text-secondary)]">{icon}</span>
      <span>{children}</span>
    </Command.Item>
  );
}
