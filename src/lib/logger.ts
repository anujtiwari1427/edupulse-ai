import { captureError } from './errors';

export const logger = {
  info(message: string, context?: string): void {
    if (import.meta.env.DEV) {
      console.info(context ? `[${context}] ${message}` : message);
    }
  },
  warn(message: string, context?: string): void {
    captureError(new Error(message), context, 'warning');
    if (import.meta.env.DEV) {
      console.warn(context ? `[${context}] ${message}` : message);
    }
  },
  error(err: unknown, context?: string): void {
    captureError(err, context, 'error');
    if (import.meta.env.DEV) {
      console.error(context ? `[${context}]` : '[EduPulse]', err);
    }
  },
};
