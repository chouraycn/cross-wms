import { getLogger } from '../logger.js';
import { diagnosticSystem } from './diagnostic.js';

const logger = getLogger().child({ subsystem: 'diagnostic' });

let lastActivityAt = 0;

export const diagnosticLogger = {
  trace(...args: unknown[]): void {
    logger.trace('[diagnostic]', ...args);
  },
  debug(...args: unknown[]): void {
    logger.debug('[diagnostic]', ...args);
  },
  info(...args: unknown[]): void {
    logger.info('[diagnostic]', ...args);
  },
  warn(...args: unknown[]): void {
    logger.warn('[diagnostic]', ...args);
  },
  error(...args: unknown[]): void {
    logger.error('[diagnostic]', ...args);
  },
  fatal(...args: unknown[]): void {
    logger.fatal('[diagnostic]', ...args);
  },
  isEnabled(level: string): boolean {
    return true;
  },
};

export function markDiagnosticActivity(): void {
  lastActivityAt = Date.now();
}

export function getLastDiagnosticActivityAt(): number {
  return lastActivityAt;
}

export function hasRecentDiagnosticActivity(thresholdMs: number = 120000): boolean {
  return lastActivityAt > 0 && Date.now() - lastActivityAt <= thresholdMs;
}

export function resetDiagnosticActivityForTest(): void {
  lastActivityAt = 0;
}
