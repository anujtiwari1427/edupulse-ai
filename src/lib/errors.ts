export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface ErrorLogEntry {
  id: string;
  timestamp: number;
  code: string;
  severity: ErrorSeverity;
  message: string;
  context?: string;
  stack?: string;
}

const ERROR_LOG_STORAGE_KEY = 'edupulse-local-error-log';
const MAX_ERROR_LOG_ENTRIES = 100;

export class AppError extends Error {
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly context?: string;

  constructor(
    message: string,
    options?: {
      code?: string;
      severity?: ErrorSeverity;
      context?: string;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = options?.code ?? 'APP_ERROR';
    this.severity = options?.severity ?? 'error';
    this.context = options?.context;
  }
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'An unexpected error occurred.';
}

export function readLocalErrorLog(): ErrorLogEntry[] {
  try {
    const raw = localStorage.getItem(ERROR_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ErrorLogEntry[];
  } catch {
    return [];
  }
}

export function clearLocalErrorLog(): void {
  try {
    localStorage.removeItem(ERROR_LOG_STORAGE_KEY);
  } catch {
    // Ignore storage unavailability
  }
}

export function captureError(
  error: unknown,
  context?: string,
  severity: ErrorSeverity = 'error'
): ErrorLogEntry {
  const entry: ErrorLogEntry = {
    id: `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    code: error instanceof AppError ? error.code : 'UNHANDLED_ERROR',
    severity: error instanceof AppError ? error.severity : severity,
    message: getErrorMessage(error),
    context: context ?? (error instanceof AppError ? error.context : undefined),
    stack: error instanceof Error ? error.stack : undefined,
  };

  try {
    const existing = readLocalErrorLog();
    const updated = [entry, ...existing].slice(0, MAX_ERROR_LOG_ENTRIES);
    localStorage.setItem(ERROR_LOG_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota issues while recording error
  }

  return entry;
}

export function exportErrorLogJson(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      entries: readLocalErrorLog(),
    },
    null,
    2
  );
}
