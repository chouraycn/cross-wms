/**
 * Structured logger with level filtering.
 *
 * Levels (via LOG_LEVEL env var, default 'info'):
 *   error  — always printed (unrecoverable failures)
 *   warn   — always printed (degraded behavior, notable warnings)
 *   info   — lifecycle events (startup, shutdown, migrations)
 *   debug  — per-request / per-message hot-path traces (silenced by default)
 *
 * Usage:
 *   import { logger } from './logger.js';        // server root
 *   import { logger } from '../logger.js';       // server/routes, server/engine, etc.
 *
 *   logger.error('[DB] connection failed:', err);
 *   logger.info('[Server] started on port', port);
 *   logger.debug('[Chat API] message received:', msgId);
 */

/* eslint-disable no-console */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function resolveLevel(): number {
  const env = (process.env.LOG_LEVEL || '').toLowerCase().trim();
  if (env in LEVEL_PRIORITY) return LEVEL_PRIORITY[env as LogLevel];
  // Default: 'info' in production, 'debug' when LOG_DEBUG=1
  if (process.env.LOG_DEBUG === '1' || process.env.NODE_ENV === 'development') {
    return LEVEL_PRIORITY.debug;
  }
  return LEVEL_PRIORITY.info;
}

const currentLevel = resolveLevel();

function formatArg(arg: unknown): unknown {
  // Keep Error objects readable — console.error already handles them well,
  // but template literals sometimes stringify them as [object Object].
  if (arg instanceof Error) return arg.stack || arg.message;
  return arg;
}

export const logger = {
  error(...args: unknown[]): void {
    if (currentLevel >= LEVEL_PRIORITY.error) {
      console.error(...args.map(formatArg));
    }
  },

  warn(...args: unknown[]): void {
    if (currentLevel >= LEVEL_PRIORITY.warn) {
      console.warn(...args.map(formatArg));
    }
  },

  info(...args: unknown[]): void {
    if (currentLevel >= LEVEL_PRIORITY.info) {
      console.log(...args.map(formatArg));
    }
  },

  debug(...args: unknown[]): void {
    if (currentLevel >= LEVEL_PRIORITY.debug) {
      console.log(...args.map(formatArg));
    }
  },

  /** Check if a given level would produce output (useful for expensive formatting). */
  isLevelEnabled(level: LogLevel): boolean {
    return currentLevel >= LEVEL_PRIORITY[level];
  },
};

export type Logger = typeof logger;
