import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Check,
  FilePlus2,
  FileText,
  HelpCircle,
  Home,
  Languages,
  LayoutTemplate,
  Loader2,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
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
  Badge,
  Breadcrumbs,
  Button,
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
          'no-print hidden md:flex flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] transition-[width] duration-200 shrink-0 select-none shadow-xs',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--border-hairline)] px-4">
          {!sidebarCollapsed ? (
            <Link
              to="/"
              className="flex items-center gap-2.5 text-sm font-bold tracking-tight text-[var(--text-primary)] hover:opacity-90 transition-opacity"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-600 to-violet-500 text-white shadow-xs shadow-indigo-500/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="leading-tight font-extrabold tracking-tight">EduPulse AI</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)] tracking-wider uppercase">Studio v2.0</span>
              </div>
            </Link>
          ) : (
            <Link
              to="/"
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-600 to-violet-500 text-white shadow-xs shadow-indigo-500/30"
              title="EduPulse AI"
            >
              <Sparkles className="h-4 w-4" />
            </Link>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer transition-colors',
              sidebarCollapsed && 'hidden'
            )}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Action Button */}
        {!sidebarCollapsed && (
          <div className="p-3 pb-1">
            <Link to="/app/create" className="block">
              <Button
                size="sm"
                className="w-full justify-start text-xs font-semibold py-2"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                {t('actions.createPaper')}
              </Button>
            </Link>
          </div>
        )}

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 whitespace-nowrap',
                    isActive
                      ? 'bg-gradient-to-r from-indigo-50 to-indigo-50/40 text-indigo-700 dark:from-indigo-950/70 dark:to-indigo-950/20 dark:text-indigo-300 font-semibold shadow-xs border border-indigo-200/60 dark:border-indigo-800/50'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] border border-transparent',
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
          <div className="border-t border-[var(--border-hairline)] p-3.5 bg-gradient-to-b from-transparent to-[var(--bg-subtle)]/50">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2.5 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>100% Offline Privacy</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                IndexedDB storage · Zero cloud telemetry
              </p>
            </div>
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
                  className="inline-flex h-9 items-center gap-1.5 justify-center rounded-lg border border-[var(--border-hairline)] px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer transition-colors"
                >
                  <Languages className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{i18n.language === 'hi' ? 'हिन्दी' : i18n.language === 'mr' ? 'मराठी' : 'English'}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => handleLanguageSelect('en')} className="flex items-center justify-between">
                  <span className="font-medium">English</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-3">EN</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleLanguageSelect('hi')} className="flex items-center justify-between">
                  <span className="font-medium">हिन्दी (Hindi)</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-3">HI</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleLanguageSelect('mr')} className="flex items-center justify-between">
                  <span className="font-medium">मराठी (Marathi)</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-3">MR</span>
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
