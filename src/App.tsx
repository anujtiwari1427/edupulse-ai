import * as React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/src/lib/i18n';
import { ErrorBoundary, TooltipProvider } from '@/src/components/ui';
import { LandingPage } from '@/src/features/landing/LandingPage';

const AppShell = React.lazy(() =>
  import('@/src/app/AppShell').then((m) => ({ default: m.AppShell }))
);
const DashboardPage = React.lazy(() =>
  import('@/src/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const SettingsPage = React.lazy(() =>
  import('@/src/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const LibraryPage = React.lazy(() =>
  import('@/src/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const CreatePaperPage = React.lazy(() =>
  import('@/src/features/generation/CreatePaperPage').then((m) => ({
    default: m.CreatePaperPage,
  }))
);
const SavedPapersPage = React.lazy(() =>
  import('@/src/features/editor/SavedPapersPage').then((m) => ({ default: m.SavedPapersPage }))
);
const TemplatesPage = React.lazy(() =>
  import('@/src/features/blueprint/TemplatesPage').then((m) => ({
    default: m.TemplatesPage,
  }))
);
const PaperEditorPreviewPage = React.lazy(() =>
  import('@/src/features/editor/PaperEditorPage').then((m) => ({ default: m.PaperEditorPage }))
);
const NotFoundPage = React.lazy(() =>
  import('@/src/app/WorkspaceViews').then((m) => ({ default: m.NotFoundPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)] text-xs text-[var(--text-secondary)]">
      Loading workspace…
    </div>
  );
}

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <ErrorBoundary fallbackTitle="EduPulse AI encountered an unexpected error">
          <BrowserRouter>
            <React.Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/app" element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="library" element={<LibraryPage />} />
                  <Route path="create" element={<CreatePaperPage />} />
                  <Route path="papers" element={<SavedPapersPage />} />
                  <Route path="templates" element={<TemplatesPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="editor/:paperId" element={<PaperEditorPreviewPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route path="/index.html" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </React.Suspense>
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </I18nextProvider>
  );
}
