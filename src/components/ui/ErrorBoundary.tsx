import * as React from 'react';
import { AlertTriangle, Download, RotateCcw } from 'lucide-react';
import { captureError, exportErrorLogJson, getErrorMessage } from '@/src/lib/errors';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: getErrorMessage(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureError(error, info.componentStack ?? 'ErrorBoundary', 'fatal');
  }

  handleDownloadLog = () => {
    const json = exportErrorLogJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edupulse-error-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-8 max-w-lg rounded-xl border border-[var(--danger-border)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--danger-bg)] text-[var(--danger-text)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {this.props.fallbackTitle ?? 'Something went wrong in this view'}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Your saved textbooks, question banks, and papers in local IndexedDB remain safe.
              </p>
              <p className="mt-2 rounded-lg bg-[var(--bg-subtle)] p-2.5 font-mono text-xs text-[var(--danger-text)] break-words">
                {this.state.errorMessage}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  Retry View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={this.handleDownloadLog}
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                >
                  Export Error Log
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
