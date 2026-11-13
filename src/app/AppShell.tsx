import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Check,
  FilePlus2,
  FileText,
  HelpCircle,
  Home,
  LayoutTemplate,
  Loader2,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, formatRelativeTime } from '@/src/lib/utils';
import { applyThemeToDom, useUIStore } from '@/src/app/store';
import { changeAppLanguage } from '@/src/lib/i18n';
import type { LanguageCode, ThemePreference } from '@/src/lib/zod-schemas';
import { ensureBuiltInTemplatesSeeded, repository } from '@/src/features/storage/repository';
import { loadSampleClass10Library } from '@/src/features/storage/sample-data';
import {
  Breadcrumbs,
  CommandPalette,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorBoundary,
  Kbd,
  Modal,
  OfflineIndicator,
  PWAInstallButton,
  ToastRegion,
} from '@/src/components/ui';
import { OnboardingModal } from '@/src/features/onboarding/OnboardingModal';

const ROUTE_TITLES: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/library': 'Library',
  '/app/create': 'Create Paper',
  '/app/papers': 'Saved Papers',
  '/app/templates': 'Templates',
  '/app/settings': 'Settings',
};

export function AppShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const shortcutsModalOpen = useUIStore((s) => s.shortcutsModalOpen);
  const setShortcutsModalOpen = useUIStore((s) => s.setShortcutsModalOpen);
  const onboardingOpen = useUIStore((s) => s.onboardingOpen);
  const setOnboardingOpen = useUIStore((s) => s.setOnboardingOpen);
  const saveState = useUIStore((s) => s.saveState);
  const lastSavedAt = useUIStore((s) => s.lastSavedAt);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const addToast = useUIStore((s) => s.addToast);

  React.useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      await ensureBuiltInTemplatesSeeded();
      const settings = await repository.settingsRepo.get();
      if (cancelled) return;

      setTheme(settings.theme);
      applyThemeToDom(settings.theme);
      if (settings.language !== i18n.language) {
        changeAppLanguage(settings.language);
      }

      if (searchParams.get('sample') === '1') {
        await loadSampleClass10Library();
        await repository.settingsRepo.update({ onboardingCompleted: true });
        searchParams.delete('sample');
        setSearchParams(searchParams, { replace: true });
        addToast({
          title: 'Sample Class 10 Science pack ready',
          description: 'Loaded NCERT sample chapters, 10 questions, and 1 unit test draft.',
          variant: 'success',
        });
      } else if (!settings.onboardingCompleted) {
        setOnboardingOpen(true);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
    // Run once on workspace mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && !(e.target as HTMLElement)?.isContentEditable) {
          e.preventDefault();
          setShortcutsModalOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setShortcutsModalOpen]);

  const navItems = [
    { to: '/app', label: t('nav.dashboard'), icon: Home, end: true },
    { to: '/app/library', label: t('nav.library'), icon: BookOpen, end: false },
    { to: '/app/create', label: t('nav.create'), icon: FilePlus2, end: false },
    { to: '/app/papers', label: t('nav.papers'), icon: FileText, end: false },
    { to: '/app/templates', label: t('nav.templates'), icon: LayoutTemplate, end: false },
    { to: '/app/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  const currentTitle =
    ROUTE_TITLES[location.pathname] ??
    (location.pathname.startsWith('/app/editor') ? 'Paper Editor' : 'Workspace');

  const handleThemeSelect = (next: ThemePreference) => {
    setTheme(next);
    void repository.settingsRepo.update({ theme: next });
  };

  const handleLanguageSelect = (lang: LanguageCode) => {
    changeAppLanguage(lang);
    void repository.settingsRepo.update({ language: lang });
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Workspace navigation"
        className={cn(
          'no-print hidden md:flex flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] transition-[width] duration-150 shrink-0',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--border-hairline)] px-3.5">
          {!sidebarCollapsed && (
            <Link
              to="/"
              className="text-sm font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap"
            >
              EduPulse AI
            </Link>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]',
                    sidebarCollapsed && 'justify-center px-0'
                  )
                }
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="border-t border-[var(--border-hairline)] p-3 text-[11px] text-[var(--text-muted)] leading-snug">
            {t('status.localOnlyNotice')}
          </div>
        )}
      </aside>

      {/* Mobile Drawer Nav */}
      {mobileNavOpen && (
        <div
          className="no-print fixed inset-0 z-50 bg-black/45 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <aside
            className="h-full w-64 bg-[var(--bg-surface)] border-r border-[var(--border-hairline)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between border-b border-[var(--border-hairline)] px-4">
              <span className="text-sm font-bold text-[var(--text-primary)]">EduPulse AI</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                        isActive
                          ? 'bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex md:hidden h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Breadcrumbs
              items={[
                { label: 'Workspace', to: '/app' },
                ...(currentTitle !== 'Dashboard' ? [{ label: currentTitle }] : []),
              ]}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden sm:inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Quick jump…</span>
              <Kbd>Ctrl K</Kbd>
            </button>

            {/* Autosave Status */}
            <div
              aria-live="polite"
              title={lastSavedAt ? `Last saved ${formatRelativeTime(lastSavedAt)}` : undefined}
              className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-[var(--text-secondary)]"
            >
              {saveState === 'saving' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand-600)]" />
                  <span>{t('status.saving')}</span>
                </>
              ) : saveState === 'error' ? (
                <span className="text-[var(--danger-text)]">{t('status.saveError')}</span>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 text-[var(--success-text)]" />
                  <span>{t('status.savedLocally')}</span>
                </>
              )}
            </div>

            <PWAInstallButton />

            {/* Language Picker */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Change language"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border-hairline)] px-2.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {i18n.language === 'hi' ? 'हिं' : i18n.language === 'mr' ? 'मर' : 'EN'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => handleLanguageSelect('en')}>
                  English (EN)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleLanguageSelect('hi')}>
                  हिन्दी (Hindi)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleLanguageSelect('mr')}>
                  मराठी (Marathi)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Toggle color theme"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {theme === 'dark' ? (
                    <Moon className="h-4 w-4" />
                  ) : theme === 'light' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => handleThemeSelect('light')}>
                  <Sun className="h-4 w-4" /> Light
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleThemeSelect('dark')}>
                  <Moon className="h-4 w-4" /> Dark
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleThemeSelect('system')}>
                  <Monitor className="h-4 w-4" /> System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              aria-label="Keyboard shortcuts and help"
              onClick={() => setShortcutsModalOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-6 py-6 pb-24 md:pb-8 max-w-6xl w-full mx-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation (44px touch targets, compact height < 15% viewport) */}
      <nav
        aria-label="Mobile navigation"
        className="no-print fixed bottom-0 inset-x-0 z-30 flex md:hidden items-center justify-around border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] h-14 px-1"
      >
        {[
          { to: '/app', label: 'Home', icon: Home, end: true },
          { to: '/app/library', label: 'Library', icon: BookOpen, end: false },
          { to: '/app/create', label: 'Create', icon: FilePlus2, end: false },
          { to: '/app/papers', label: 'Papers', icon: FileText, end: false },
          { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center min-w-[56px] h-11 rounded-lg text-[11px] font-medium',
                  isActive
                    ? 'text-[var(--brand-700)] dark:text-[var(--brand-500)]'
                    : 'text-[var(--text-secondary)]'
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="mt-0.5">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Global Overlays */}
      <CommandPalette />
      <ToastRegion />
      <OfflineIndicator />
      <OnboardingModal open={onboardingOpen} onComplete={() => setOnboardingOpen(false)} />

      <Modal
        open={shortcutsModalOpen}
        onOpenChange={setShortcutsModalOpen}
        title="Keyboard Shortcuts & Help"
        description="Navigate your local workspace rapidly without lifting your hands."
        size="sm"
      >
        <div className="space-y-2.5 text-sm">
          {[
            ['Open Command Palette', 'Ctrl / Cmd + K'],
            ['Show Keyboard Shortcuts', '?'],
            ['Close Active Modal / Palette', 'Esc'],
          ].map(([label, keys]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-2 last:border-0"
            >
              <span className="text-[var(--text-secondary)]">{label}</span>
              <Kbd>{keys}</Kbd>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
