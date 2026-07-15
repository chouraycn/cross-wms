/**
 * Structured logger backed by Pino.
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

import pino from 'pino';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const isDev = process.env.NODE_ENV === 'development' || process.env.LOG_DEBUG === '1';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

const pinoInstance = pino({
  level: logLevel,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l' },
        },
      }
    : {}),
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

/** Format arguments for pino: extract Error stack/message, pass everything else through. */
function formatArgs(...args: unknown[]): [Record<string, unknown>, ...string[]] {
  const merged: Record<string, unknown> = {};
  const rest: string[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      merged.err = arg;
    } else {
      rest.push(typeof arg === 'string' ? arg : JSON.stringify(arg));
    }
  }

  return [merged, ...rest];
}

export interface Logger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  /** Check if a given level would produce output (useful for expensive formatting). */
  isLevelEnabled(level: LogLevel): boolean;
  /** Create a child logger with persistent bindings (e.g. sessionId, requestId) for request-scoped tracing. */
  child(bindings: Record<string, unknown>): Logger;
}

/** Build a Logger facade over a (possibly child) pino instance. */
function makeLogger(pinoLogger: pino.Logger): Logger {
  return {
    error(...args: unknown[]): void {
      const [merged, ...rest] = formatArgs(...args);
      pinoLogger.error(merged, ...rest);
    },
    warn(...args: unknown[]): void {
      const [merged, ...rest] = formatArgs(...args);
      pinoLogger.warn(merged, ...rest);
    },
    info(...args: unknown[]): void {
      const [merged, ...rest] = formatArgs(...args);
      pinoLogger.info(merged, ...rest);
    },
    debug(...args: unknown[]): void {
      const [merged, ...rest] = formatArgs(...args);
      pinoLogger.debug(merged, ...rest);
    },
    isLevelEnabled(level: LogLevel): boolean {
      const target = pinoLogger.levels.values[level];
      const current = pinoLogger.levels.values[pinoLogger.level as string];
      return typeof target === 'number' && typeof current === 'number' && current >= target;
    },
    child(bindings: Record<string, unknown>): Logger {
      return makeLogger(pinoLogger.child(bindings));
    },
  };
}

export const logger = makeLogger(pinoInstance);
