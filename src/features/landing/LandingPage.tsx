import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileDown,
  FolderLock,
  Layers,
  Languages,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/Button';
import { StudioHeroCanvas } from './scene/StudioHeroCanvas';
import {
  BOARD_META,
  STUDIO_PARTS,
  type BoardPreset,
  type CameraPreset,
  type SetFocusMode,
  type StudioPartId,
} from './scene/types';

const FAQ_ITEMS = [
  {
    q: 'Does EduPulse AI upload my textbooks or question banks to a server?',
    a: 'No. Your PDFs, extracted chapters, question banks, blueprints, and saved papers are stored locally in your browser (IndexedDB) and optionally synced to a folder on your own computer. There is no project-owned cloud database or user account.',
  },
  {
    q: 'What happens if I work without an internet connection?',
    a: 'Everything except optional AI question generation works completely offline. You can browse textbooks, manage chapters, edit question banks, build blueprints, assemble papers from your existing bank, edit papers, and export print-ready PDF or DOCX files offline.',
  },
  {
    q: 'How does AI question generation work with privacy?',
    a: 'You can use your own API key (Gemini, OpenAI, or Anthropic) stored only in local IndexedDB, or use bank-only mode with no AI key at all. When AI generation runs, only the minimal relevant textbook paragraphs for the selected chapter are sent to your chosen provider.',
  },
  {
    q: 'Which Indian school boards and languages are supported?',
    a: 'Built-in templates and workflows support CBSE, ICSE, and Maharashtra State Board patterns across Classes 1–12. The interface and question paper exports support English, Hindi (हिन्दी), and Marathi (मराठी) with proper Devanagari typography.',
  },
  {
    q: 'How do I make sure I never lose my files if I clear browser data?',
    a: 'In Chrome and Edge, connect a local "EduPulse Library" folder once so originals, JSON data, and exports auto-save to disk. On every browser (including Safari and Firefox), you can export a full ZIP backup in one click and restore it anytime.',
  },
];

function useDocumentDarkMode(): boolean {
  const [isDark, setIsDark] = React.useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  React.useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const target = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(target.classList.contains('dark'));
    });
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function LandingPage() {
  const isDark = useDocumentDarkMode();

  // Interactive 3D studio state
  const [boardPreset, setBoardPreset] = React.useState<BoardPreset>('cbse-en');
  const [setFocus, setSetFocus] = React.useState<SetFocusMode>('all');
  const [exploded, setExploded] = React.useState(false);
  const [cameraPreset, setCameraPreset] = React.useState<CameraPreset>('hero');
  const [cameraTriggerNonce, setCameraTriggerNonce] = React.useState(0);
  const [inspectedPart, setInspectedPart] = React.useState<StudioPartId | null>(null);
  const [hudCollapsed, setHudCollapsed] = React.useState(false);

  // Blueprint / Showcase / FAQ state
  const [mockupTab, setMockupTab] = React.useState<'paper' | 'blueprint'>('paper');
  const [showcaseTab, setShowcaseTab] = React.useState<'grounded' | 'sets' | 'devanagari'>(
    'grounded'
  );
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);

  const triggerCamera = (preset: CameraPreset) => {
    setCameraPreset(preset);
    setCameraTriggerNonce((n) => n + 1);
  };

  const handleToggleExplode = () => {
    setExploded((prev) => {
      const next = !prev;
      triggerCamera(next ? 'exploded' : 'hero');
      return next;
    });
  };

  const handleSelectSetFocus = (mode: SetFocusMode) => {
    setSetFocus(mode);
    if (mode !== 'all') {
      triggerCamera('sets');
    } else {
      triggerCamera(exploded ? 'exploded' : 'hero');
    }
  };

  const handleResetView = () => {
    setExploded(false);
    setSetFocus('all');
    setInspectedPart(null);
    triggerCamera('hero');
  };

  const inspectedMeta = inspectedPart ? STUDIO_PARTS[inspectedPart] : null;

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* 3-Zone Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-hairline)] bg-[var(--bg-page)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-extrabold text-base tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
          >
            <img
              src="/icon.svg"
              alt="EduPulse AI Logo"
              className="h-8 w-8 rounded-xl shadow-xs shrink-0"
            />
            <span>EduPulse AI</span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-semibold text-[var(--text-secondary)]"
          >
            <a
              href="#how-it-works"
              className="hover:text-[var(--text-primary)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              How it works
            </a>
            <a
              href="#features"
              className="hover:text-[var(--text-primary)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              Features
            </a>
            <a
              href="#privacy"
              className="hover:text-[var(--text-primary)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              Privacy
            </a>
            <a
              href="#faq"
              className="hover:text-[var(--text-primary)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link to="/app">
              <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                Open Workspace
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section with Interactive 3D Examination Studio Stage */}
        <section className="relative overflow-hidden border-b border-[var(--border-hairline)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.12),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_70%)]"
          />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              {/* Left Editorial Value Proposition */}
              <div className="lg:col-span-5 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/60 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-xs mb-3 self-start">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                  <span>Local-First Studio for Indian Teachers</span>
                  <span className="text-indigo-400">·</span>
                  <span className="text-[11px] font-normal">CBSE · ICSE · MSBSHSE</span>
                </div>

                <h1
                  className="font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.08]"
                  style={{ fontSize: 'clamp(2.35rem, 4vw, 3.5rem)', textWrap: 'balance' }}
                >
                  Turn your textbooks into <span className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 bg-clip-text text-transparent">exam-ready papers</span> in minutes
                </h1>
                <p className="mt-4 max-w-xl text-base text-[var(--text-secondary)] leading-relaxed">
                  Upload your own PDFs and past question banks, lock in exact section marks and
                  internal choices, and export print-ready question papers with answer keys—stored
                  100% locally on your device.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link to="/app">
                    <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Open Workspace
                    </Button>
                  </Link>
                  <Link to="/app?sample=1">
                    <Button size="lg" variant="outline">
                      Try Sample Class 10 Paper
                    </Button>
                  </Link>
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] font-medium">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    No sign-up or cloud database
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    English, हिन्दी &amp; मराठी
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <FolderLock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    Offline-ready PWA
                  </span>
                </div>
              </div>

              {/* Right Expansive Interactive 3D Studio Viewport */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="relative h-[430px] sm:h-[500px] lg:h-[560px] w-full overflow-hidden rounded-3xl border border-indigo-200/50 dark:border-indigo-900/40 bg-[var(--bg-subtle)] shadow-xl">
                  <StudioHeroCanvas
                    board={boardPreset}
                    setFocus={setFocus}
                    cameraPreset={cameraPreset}
                    cameraTriggerNonce={cameraTriggerNonce}
                    exploded={exploded}
                    isDark={isDark}
                    inspectedPart={inspectedPart}
                    onInspectPart={setInspectedPart}
                  />

                  {/* Bottom Interactive HUD Dock (opaque surface — no backdrop-blur over WebGL) */}
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-col items-center gap-2">
                    {inspectedMeta && !hudCollapsed && (
                      <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 shadow-sm">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {inspectedMeta.title}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] truncate">
                            {inspectedMeta.detail}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Clear inspected part"
                          onClick={() => setInspectedPart(null)}
                          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {hudCollapsed ? (
                      <button
                        type="button"
                        onClick={() => setHudCollapsed(false)}
                        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-sm hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                        <span>Studio Controls</span>
                      </button>
                    ) : (
                      <div
                        aria-label="3D Studio Controls"
                        className="pointer-events-auto flex w-full flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 shadow-sm"
                      >
                        {/* Board / Language selector */}
                        <div className="flex items-center gap-0.5" role="group" aria-label="Board texture preset">
                          {(Object.keys(BOARD_META) as BoardPreset[]).map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setBoardPreset(id)}
                              className={cn(
                                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap',
                                boardPreset === id
                                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-xs font-semibold'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                              )}
                            >
                              {BOARD_META[id].shortLabel}
                            </button>
                          ))}
                        </div>

                        {/* Parallel Set fan selector */}
                        <div className="flex items-center gap-0.5" role="group" aria-label="Set focus">
                          {(
                            [
                              ['all', 'All'],
                              ['A', 'Set A'],
                              ['B', 'Set B'],
                              ['C', 'Set C'],
                            ] as const
                          ).map(([mode, label]) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => handleSelectSetFocus(mode)}
                              className={cn(
                                'rounded-md px-1.5 py-1 text-[11px] font-mono font-medium transition-colors cursor-pointer whitespace-nowrap',
                                setFocus === mode
                                  ? 'bg-[var(--bg-muted)] text-[var(--text-primary)] font-semibold'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* View mode & Zen toggle */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            aria-pressed={exploded}
                            onClick={handleToggleExplode}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap',
                              exploded
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                            )}
                          >
                            <Layers className="h-3 w-3" />
                            <span>Explode</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => triggerCamera('overhead')}
                            className={cn(
                              'hidden sm:inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap',
                              cameraPreset === 'overhead'
                                ? 'bg-[var(--bg-muted)] text-[var(--text-primary)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                            )}
                          >
                            <Eye className="h-3 w-3" />
                            <span>Top</span>
                          </button>

                          <button
                            type="button"
                            aria-label="Reset 3D camera view"
                            onClick={handleResetView}
                            className="inline-flex items-center rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            aria-label="Hide studio controls"
                            onClick={() => setHudCollapsed(true)}
                            className="inline-flex items-center rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between px-1 text-[11px] text-[var(--text-muted)]">
                  <span>Drag to orbit · Scroll to zoom · Click any studio object to inspect</span>
                  <span className="font-mono">
                    {BOARD_META[boardPreset].label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mechanism: 3-Step Flow + Live Blueprint Math & Paper Preview Inspector */}
        <section id="how-it-works" className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  From raw textbook PDF to printed paper in three steps
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Built for school teachers preparing unit tests, terminal exams, and parallel
                  question sets without losing control of marks or syllabus accuracy.
                </p>
              </div>

              <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                <div className="p-5">
                  <div className="text-xs font-mono font-semibold text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                    01. Upload &amp; Organize
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-[var(--text-primary)]">
                    Ingest textbooks &amp; past papers
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    Drop PDF, DOCX, or EPUB files. Chapters and scanned pages (via local OCR) are
                    indexed right inside your browser so every question links back to its page.
                  </p>
                </div>

                <div className="p-5">
                  <div className="text-xs font-mono font-semibold text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                    02. Blueprint &amp; Select
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-[var(--text-primary)]">
                    Lock exact marks &amp; difficulty
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    Start from CBSE, ICSE, or Maharashtra Board patterns. Marks arithmetic, chapter
                    weightage, and internal choices are validated deterministically in code.
                  </p>
                </div>

                <div className="p-5">
                  <div className="text-xs font-mono font-semibold text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                    03. Edit &amp; Export
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-[var(--text-primary)]">
                    Refine &amp; export print-ready files
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    Swap questions, reorder sections, generate Sets A/B/C with matching answer keys,
                    and export crisp black-and-white PDFs and editable DOCX files.
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Paper Preview / Blueprint Math Switcher */}
            <div className="lg:col-span-6 flex flex-col">
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-sm overflow-hidden flex flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                    Class 10 Science · Pre-Board Blueprint
                  </span>
                  <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] p-0.5 border border-[var(--border-hairline)]">
                    <button
                      type="button"
                      onClick={() => setMockupTab('paper')}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                        mockupTab === 'paper'
                          ? 'bg-[#4338ca] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      Paper Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setMockupTab('blueprint')}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                        mockupTab === 'blueprint'
                          ? 'bg-[#4338ca] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      Blueprint Math
                    </button>
                  </div>
                </div>

                {mockupTab === 'paper' ? (
                  <div className="p-5 sm:p-6 space-y-4 text-xs flex-1">
                    <div className="border-b border-[var(--border-hairline)] pb-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">
                          Pre-Board Examination · Science (086)
                        </div>
                        <div className="mt-0.5 text-[var(--text-secondary)]">
                          Class X · Time: 3 Hours · Maximum Marks: 80
                        </div>
                      </div>
                      <div className="border border-[var(--border-strong)] rounded px-2.5 py-1 font-mono text-[11px] text-[var(--text-secondary)] shrink-0">
                        Roll No: [____]
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="font-semibold text-[var(--text-primary)]">
                        Section A — Objective Questions (1 Mark each)
                      </div>
                      <div className="space-y-2.5 text-[var(--text-secondary)]">
                        <div className="flex justify-between gap-3">
                          <div>
                            <span className="font-medium text-[var(--text-primary)]">Q1.</span>{' '}
                            Which gas is evolved when dilute HCl reacts with zinc granules?
                            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                              <span>(a) Oxygen</span>
                              <span>(b) Hydrogen</span>
                              <span>(c) Carbon dioxide</span>
                              <span>(d) Chlorine</span>
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-[var(--text-primary)] shrink-0">
                            [1]
                          </span>
                        </div>

                        <div className="flex justify-between gap-3 pt-2 border-t border-[var(--border-hairline)]">
                          <div>
                            <span className="font-medium text-[var(--text-primary)]">Q21.</span>{' '}
                            Write the balanced equation for thermal decomposition of ferrous
                            sulphate crystals.
                            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                              Source: NCERT Science Ch. 1 · Page 5
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-[var(--text-primary)] shrink-0">
                            [2]
                          </span>
                        </div>

                        <div className="flex justify-between gap-3 pt-2 border-t border-[var(--border-hairline)]">
                          <div>
                            <span className="font-medium text-[var(--text-primary)]">Q27.</span>{' '}
                            Draw a labelled ray diagram when an object is placed at 2F1 of a convex
                            lens.
                            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                              Internal OR · NCERT Light Reflection &amp; Refraction · Page 154
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-[var(--text-primary)] shrink-0">
                            [3]
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 sm:p-6 flex-1">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
                          <th className="py-2 text-left font-medium">Section</th>
                          <th className="py-2 text-left font-medium">Type</th>
                          <th className="py-2 text-right font-medium">Qs</th>
                          <th className="py-2 text-right font-medium">Marks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-hairline)] text-[var(--text-primary)]">
                        <tr>
                          <td className="py-2.5 font-medium">Section A</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">MCQ &amp; A/R</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">20</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">20</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">Section B</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">Very Short</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">6</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">12</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">Section C</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">Short Answer</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">7</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">21</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">Section D</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">Long Answer</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">3</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">15</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">Section E</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">Case Study</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">3</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">12</td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[var(--border-strong)] font-semibold">
                          <td className="pt-2.5" colSpan={2}>
                            Validated Blueprint Total
                          </td>
                          <td className="pt-2.5 text-right font-mono tabular-nums">39</td>
                          <td className="pt-2.5 text-right font-mono tabular-nums text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                            80
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Features — Asymmetric Bento Grid */}
        <section
          id="features"
          className="border-y border-[var(--border-hairline)] bg-[var(--bg-surface)]"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Designed around real Indian classroom workflows
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Marquee Card 1 (2 cols) */}
              <div className="lg:col-span-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
                    Deterministic Blueprint Math
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    Section totals, &ldquo;attempt any X of Y&rdquo; rules, and internal OR choices
                    are computed and verified in TypeScript—never guessed by an LLM.
                  </p>
                </div>
                <div className="mt-4 border-t border-[var(--border-hairline)] pt-3 flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
                  <span>39 Qs · 5 Sections</span>
                  <span className="text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                    80 / 80 Marks Verified
                  </span>
                </div>
              </div>

              {/* Standard Card 2 */}
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                  <Layers className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                  Sets A, B, and C in One Click
                </h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Shuffle question order and MCQ option order deterministically across parallel sets
                  while keeping every answer key synchronized.
                </p>
              </div>

              {/* Standard Card 3 */}
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                  <Languages className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                  English, Hindi &amp; Marathi
                </h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Full UI localization plus embedded Noto Sans Devanagari PDF rendering and OCR
                  support for Hindi and Marathi textbooks.
                </p>
              </div>

              {/* Standard Card 4 */}
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                  <FileDown className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                  Print-Ready PDF &amp; Editable DOCX
                </h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Export clean black-and-white papers with school header, roll-number box, section
                  instructions, and separate marking schemes.
                </p>
              </div>

              {/* Standard Card 5 */}
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                  <FolderLock className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                  Folder Sync &amp; ZIP Backups
                </h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Auto-save papers and exports directly into a chosen folder on Chrome/Edge, or
                  download validated full-workspace ZIP backups.
                </p>
              </div>

              {/* Marquee Card 6 (2 cols) */}
              <div className="lg:col-span-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
                    Strict Textbook Grounding
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    Bank items come first without repeats; any AI-generated gap item is grounded in
                    retrieved chapter text and records its source book and page number.
                  </p>
                </div>
                <div className="mt-4 border-t border-[var(--border-hairline)] pt-3 flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
                  <span>BM25 Local Search + Zod Schema</span>
                  <span>Zero Unverified Hallucinations</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product Showcase */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Built for speed, accuracy, and control
              </h2>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                Inspect how EduPulse AI handles grounded questions, multi-set shuffling, and
                Devanagari scripts.
              </p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1 self-start">
              {(
                [
                  ['grounded', 'Grounded Generation'],
                  ['sets', 'Sets A / B / C'],
                  ['devanagari', 'Hindi & Marathi'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setShowcaseTab(id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors',
                    showcaseTab === id
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
            {showcaseTab === 'grounded' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    Every question cites its chapter and page
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    When filling blueprint slots, EduPulse first pulls matching questions from your
                    existing bank without duplicates. If slots remain and you enable AI generation,
                    only the specific chapter chunks are passed to your model, validated with Zod,
                    and tagged with source book and page number.
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 text-xs space-y-2">
                  <div className="font-medium text-[var(--text-primary)]">
                    Q14. Why does dry HCl gas not change the colour of dry litmus paper? [2 Marks]
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    Marking Scheme: 1m for absence of H+ ions in dry state; 1m for dissociation
                    requiring aqueous medium.
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Chapter 2: Acids, Bases and Salts · Page 10 · Bloom: Understand · Bank Item
                  </div>
                </div>
              </div>
            )}

            {showcaseTab === 'sets' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    Anti-copying parallel sets with aligned answer keys
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    Generate Sets A, B, and C from the same approved paper. Question ordering within
                    sections and MCQ option sequences are shuffled per set, and separate answer keys
                    are automatically re-indexed to match each set code.
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 text-xs font-mono space-y-2">
                  <div className="flex justify-between">
                    <span>Set A · Q1 (b) Hydrogen</span>
                    <span className="text-[var(--text-secondary)]">Key: (b)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Set B · Q3 (d) Hydrogen</span>
                    <span className="text-[var(--text-secondary)]">Key: (d)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Set C · Q2 (a) Hydrogen</span>
                    <span className="text-[var(--text-secondary)]">Key: (a)</span>
                  </div>
                </div>
              </div>
            )}

            {showcaseTab === 'devanagari' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    Clean Devanagari rendering on screen and in print
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    Switch the workspace between English, Hindi, and Marathi at any time. Hindi and
                    Marathi papers embed Noto Sans Devanagari fonts during PDF export so matras and
                    conjunct characters never turn into blank boxes.
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 text-xs space-y-2">
                  <div className="font-semibold text-[var(--text-primary)]">
                    प्र. १ (अ) योग्य पर्याय निवडून विधाने पूर्ण करा. [५ गुण]
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    संतुलित रासायनिक समीकरणात अभिकारक आणि उत्पादित यांच्यातील अणूंची संख्या समान
                    असते.
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Privacy & Local-First Explanation */}
        <section
          id="privacy"
          className="border-y border-[var(--border-hairline)] bg-[var(--bg-surface)]"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Local-First Architecture</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  Your school&apos;s question papers stay on your device
                </h2>
                <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                  We do not run an account system or a central database. Everything you upload or
                  author lives inside your browser&apos;s IndexedDB and your chosen local folder.
                </p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    title: 'Zero cloud storage',
                    body: 'Textbooks, chapter chunks, logos, and draft papers are never uploaded to a project server.',
                  },
                  {
                    title: 'Minimal AI transmission',
                    body: 'Only when you run AI generation or tagging are small chapter excerpts sent to your chosen provider.',
                  },
                  {
                    title: 'Bank-only offline mode',
                    body: 'Skip AI keys altogether and assemble papers purely from your own curated question banks offline.',
                  },
                  {
                    title: 'Portable ZIP backups',
                    body: 'Export your entire workspace with files and metadata as a schema-validated ZIP archive anytime.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                      <Check className="h-4 w-4 text-[var(--success-text)] shrink-0" />
                      <span>{item.title}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Every exam format you run during the academic year
          </h2>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                title: '20-Mark Unit Tests',
                desc: 'Quick chapter-wise assessments built in minutes from 1–2 chapters.',
              },
              {
                title: '80-Mark Half-Yearly & Pre-Boards',
                desc: 'Full 5-section CBSE/ICSE blueprints with internal choices and case studies.',
              },
              {
                title: 'Chapter Practice Worksheets',
                desc: 'Topic-filtered mixed difficulty sheets with printable answer keys for classwork.',
              },
              {
                title: 'Parallel Sets A, B & C',
                desc: 'Shuffled question and option orders for classroom seating integrity.',
              },
            ].map((uc) => (
              <div
                key={uc.title}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
              >
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{uc.title}</h3>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                  {uc.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] text-center">
            Frequently asked questions
          </h2>
          <div className="mt-8 divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150',
                        isOpen && 'rotate-180'
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 py-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Ready to set your next question paper?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-secondary)]">
              Open the local workspace right in your browser—no login, no cloud lock-in, and a
              sample CBSE Class 10 Science pack ready to explore.
            </p>
            <div className="mt-6 flex justify-center">
              <Link to="/app">
                <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Open Workspace
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 py-6 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2 font-medium text-[var(--text-secondary)]">
            <img src="/icon.svg" alt="EduPulse AI Logo" className="h-5 w-5 rounded-md shrink-0 shadow-xs" />
            <span>EduPulse AI · Local-first question paper studio</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#how-it-works" className="hover:text-[var(--text-primary)]">
              How it works
            </a>
            <a href="#privacy" className="hover:text-[var(--text-primary)]">
              Privacy
            </a>
            <Link to="/app" className="hover:text-[var(--text-primary)]">
              Workspace
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
