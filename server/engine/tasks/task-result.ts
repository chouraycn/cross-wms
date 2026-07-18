/**
 * tasks/task-result.ts — 结果处理
 *
 * - 构造成功 / 失败 / 部分完成结果
 * - 聚合多个子任务结果
 */
import { nowIso } from './types.js';
import type { TaskResult, TaskStatus } from './types.js';

/** 构造成功结果。 */
export function okResult(
  output: unknown,
  startedAt: string,
  attempts = 1,
  completedAt: string = nowIso(),
): TaskResult {
  return {
    status: 'completed',
    output,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    attempts,
    startedAt,
    completedAt,
  };
}

/** 构造失败结果。 */
export function errorResult(
  error: string,
  startedAt: string,
  status: TaskStatus = 'failed',
  attempts = 1,
  completedAt: string = nowIso(),
): TaskResult {
  return {
    status,
    error,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    attempts,
    startedAt,
    completedAt,
  };
}

/** 部分完成：聚合多个子结果，若任一失败则标记为 partial。 */
export interface AggregatedResult {
  status: 'completed' | 'partial' | 'failed';
  outputs: unknown[];
  errors: string[];
  total: number;
  succeeded: number;
  failed: number;
}

/** 聚合子任务结果：
 * - 全部 completed -> completed
 * - 全部失败 -> failed
 * - 否则 -> partial
 */
export function aggregateResults(results: TaskResult[]): AggregatedResult {
  const outputs: unknown[] = [];
  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'completed') {
      succeeded++;
      if (r.output !== undefined) outputs.push(r.output);
    } else {
      failed++;
      if (r.error) errors.push(r.error);
    }
  }
  const total = results.length;
  let status: AggregatedResult['status'] = 'partial';
  if (total === 0) status = 'completed';
  else if (succeeded === total) status = 'completed';
  else if (failed === total) status = 'failed';
  return { status, outputs, errors, total, succeeded, failed };
}

/** 判断结果是否成功。 */
export function isSuccessfulResult(r: TaskResult): boolean {
  return r.status === 'completed';
}

/** 判断结果是否可重试（失败/超时）。 */
export function isRetryableResult(r: TaskResult | null): boolean {
  if (!r) return false;
  return r.status === 'failed' || r.status === 'timeout';
}
