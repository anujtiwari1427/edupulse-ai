import { create } from 'zustand';
import type { ThemePreference } from '@/src/lib/zod-schemas';

export type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'warning' | 'danger';
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  shortcutsModalOpen: boolean;
  onboardingOpen: boolean;
  saveState: SaveIndicatorState;
  lastSavedAt: number | null;
  theme: ThemePreference;
  toasts: ToastItem[];

  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setShortcutsModalOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
  setSaveState: (state: SaveIndicatorState, savedAt?: number) => void;
  setTheme: (theme: ThemePreference) => void;
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
}

function readInitialTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem('edupulse-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Ignore storage unavailability
  }
  return 'system';
}

export function applyThemeToDom(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
  try {
    localStorage.setItem('edupulse-theme', theme);
  } catch {
    // Ignore
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandPaletteOpen: false,
  shortcutsModalOpen: false,
  onboardingOpen: false,
  saveState: 'saved',
  lastSavedAt: null,
  theme: readInitialTheme(),
  toasts: [],

  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setShortcutsModalOpen: (shortcutsModalOpen) => set({ shortcutsModalOpen }),
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
  setSaveState: (saveState, savedAt) =>
    set((s) => ({
      saveState,
      lastSavedAt: savedAt ?? (saveState === 'saved' ? Date.now() : s.lastSavedAt),
    })),
  setTheme: (theme) => {
    applyThemeToDom(theme);
    set({ theme });
  },
  addToast: (toast) => {
    const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const next: ToastItem = { ...toast, id };
    set((s) => ({ toasts: [...s.toasts, next].slice(-4) }));
    const duration = toast.durationMs ?? 4500;
    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, duration);
    }
    return id;
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
