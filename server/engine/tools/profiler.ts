import { logger } from '../../logger.js';

export interface ToolExecutionRecord {
  toolName: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  args?: Record<string, unknown>;
  resultSize?: number;
}

const recentExecutions: ToolExecutionRecord[] = [];
const MAX_HISTORY = 1000;

export function recordToolExecution(record: ToolExecutionRecord): void {
  recentExecutions.push(record);
  if (recentExecutions.length > MAX_HISTORY) {
    recentExecutions.shift();
  }
}

export function startToolExecution(toolName: string, args?: Record<string, unknown>): ToolExecutionRecord {
  const record: ToolExecutionRecord = {
    toolName,
    startedAt: Date.now(),
    success: false,
    args,
  };
  recordToolExecution(record);
  return record;
}

export function finishToolExecution(record: ToolExecutionRecord, success: boolean, error?: string, resultSize?: number): void {
  record.finishedAt = Date.now();
  record.durationMs = record.finishedAt - record.startedAt;
  record.success = success;
  record.error = error;
  record.resultSize = resultSize;
  logger.debug(`[Tools:Profiler] ${record.toolName} ${success ? 'OK' : 'FAILED'} (${record.durationMs}ms)`);
}

export function getToolExecutionHistory(toolName?: string, limit: number = 100): ToolExecutionRecord[] {
  const filtered = toolName ? recentExecutions.filter((r) => r.toolName === toolName) : recentExecutions;
  return filtered.slice(-limit);
}

export function getToolAverageDuration(toolName: string): number {
  const records = recentExecutions.filter((r) => r.toolName === toolName && r.durationMs !== undefined);
  if (records.length === 0) return 0;
  const total = records.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
  return total / records.length;
}

export function getToolSuccessRate(toolName: string): number {
  const records = recentExecutions.filter((r) => r.toolName === toolName);
  if (records.length === 0) return 0;
  const successCount = records.filter((r) => r.success).length;
  return successCount / records.length;
}

export function clearToolExecutionHistory(): void {
  recentExecutions.length = 0;
}
