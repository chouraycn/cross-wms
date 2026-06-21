import * as Sentry from '@sentry/node';

let initialized = false;

/** Initialize Sentry for server-side error monitoring */
export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] SENTRY_DSN not set, error monitoring disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || 'unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0,
    // Filter out noisy errors
    ignoreErrors: [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'fetch failed',
    ],
  });

  initialized = true;
  console.log('[Sentry] Error monitoring initialized');
}

/** Capture an error with optional context */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, { extra: context });
}

/** Set user context for error reports */
export function setUser(user: { id?: string; email?: string; username?: string }): void {
  if (!initialized) return;
  Sentry.setUser(user);
}
