import { logger } from '../../logger.js';

export type StartupLogEntry = {
  timestamp: number;
  stage: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

export type StartupLogSummary = {
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  stages: string[];
  warnings: number;
  errors: number;
  totalEntries: number;
  success: boolean;
};

const startupLog: StartupLogEntry[] = [];
let startupStartTime: number | null = null;
let startupEndTime: number | null = null;

export function logStartupEvent(
  stage: string,
  message: string,
  options?: {
    level?: StartupLogEntry['level'];
    durationMs?: number;
    metadata?: Record<string, unknown>;
  },
): void {
  const entry: StartupLogEntry = {
    timestamp: Date.now(),
    stage,
    message,
    level: options?.level ?? 'info',
    durationMs: options?.durationMs,
    metadata: options?.metadata,
  };

  startupLog.push(entry);

  const logMessage = `[Gateway][${stage}] ${message}`;
  switch (entry.level) {
    case 'error':
      logger.error(logMessage, entry.metadata);
      break;
    case 'warn':
      logger.warn(logMessage, entry.metadata);
      break;
    case 'debug':
      logger.debug(logMessage, entry.metadata);
      break;
    default:
      logger.info(logMessage, entry.metadata);
  }
}

export function startStartupLog(): void {
  startupStartTime = Date.now();
  startupEndTime = null;
  startupLog.length = 0;
  logStartupEvent('init', 'Gateway startup initiated');
}

export function endStartupLog(success: boolean): void {
  startupEndTime = Date.now();
  const duration = startupStartTime ? startupEndTime - startupStartTime : 0;
  logStartupEvent('complete', `Gateway startup ${success ? 'successful' : 'failed'}`, {
    durationMs: duration,
    metadata: { success },
  });
}

export function getStartupLog(): StartupLogEntry[] {
  return [...startupLog];
}

export function getStartupLogSummary(): StartupLogSummary {
  const warnings = startupLog.filter((e) => e.level === 'warn').length;
  const errors = startupLog.filter((e) => e.level === 'error').length;
  const stages = Array.from(new Set(startupLog.map((e) => e.stage)));

  return {
    startTime: startupStartTime ?? 0,
    endTime: startupEndTime ?? undefined,
    totalDurationMs: startupStartTime && startupEndTime ? startupEndTime - startupStartTime : undefined,
    stages,
    warnings,
    errors,
    totalEntries: startupLog.length,
    success: errors === 0,
  };
}

export function getStartupStageDuration(stage: string): number | undefined {
  const stageEntries = startupLog.filter((e) => e.stage === stage);
  if (stageEntries.length === 0) return undefined;

  const first = stageEntries[0];
  const last = stageEntries[stageEntries.length - 1];
  return last.timestamp - first.timestamp;
}

export function clearStartupLog(): void {
  startupLog.length = 0;
  startupStartTime = null;
  startupEndTime = null;
}

export function formatStartupLogSummary(summary: StartupLogSummary): string {
  const lines: string[] = [];
  lines.push('Gateway Startup Summary');
  lines.push('=======================');
  lines.push(`Status: ${summary.success ? 'SUCCESS' : 'FAILED'}`);
  lines.push(`Duration: ${summary.totalDurationMs ?? 'N/A'}ms`);
  lines.push(`Stages: ${summary.stages.join(', ')}`);
  lines.push(`Warnings: ${summary.warnings}`);
  lines.push(`Errors: ${summary.errors}`);
  lines.push(`Total entries: ${summary.totalEntries}`);
  return lines.join('\n');
}
