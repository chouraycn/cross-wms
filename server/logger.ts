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

export const logger = {
  error(...args: unknown[]): void {
    const [merged, ...rest] = formatArgs(...args);
    pinoInstance.error(merged, ...rest);
  },

  warn(...args: unknown[]): void {
    const [merged, ...rest] = formatArgs(...args);
    pinoInstance.warn(merged, ...rest);
  },

  info(...args: unknown[]): void {
    const [merged, ...rest] = formatArgs(...args);
    pinoInstance.info(merged, ...rest);
  },

  debug(...args: unknown[]): void {
    const [merged, ...rest] = formatArgs(...args);
    pinoInstance.debug(merged, ...rest);
  },

  /** Check if a given level would produce output (useful for expensive formatting). */
  isLevelEnabled(level: LogLevel): boolean {
    const pinoLevel = pinoInstance.levels.values[level];
    const currentPinoLevel = pinoInstance.levels.values[pinoInstance.level as string];
    return typeof pinoLevel === 'number' && typeof currentPinoLevel === 'number' && currentPinoLevel >= pinoLevel;
  },
};

export type Logger = typeof logger;
