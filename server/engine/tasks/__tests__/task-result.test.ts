import { describe, it, expect } from 'vitest';
import {
  okResult,
  errorResult,
  aggregateResults,
  isSuccessfulResult,
  isRetryableResult,
} from '../task-result.js';
import type { TaskResult } from '../types.js';

describe('task-result', () => {
  it('okResult 构造成功结果', () => {
    const started = new Date(Date.now() - 1000).toISOString();
    const r = okResult({ value: 1 }, started, 2);
    expect(r.status).toBe('completed');
    expect(r.output).toEqual({ value: 1 });
    expect(r.attempts).toBe(2);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('errorResult 构造失败结果', () => {
    const started = new Date().toISOString();
    const r = errorResult('boom', started, 'failed', 3);
    expect(r.status).toBe('failed');
    expect(r.error).toBe('boom');
    expect(r.attempts).toBe(3);
  });

  it('aggregateResults 全部成功 -> completed', () => {
    const results: TaskResult[] = [
      okResult('a', new Date().toISOString()),
      okResult('b', new Date().toISOString()),
    ];
    const agg = aggregateResults(results);
    expect(agg.status).toBe('completed');
    expect(agg.succeeded).toBe(2);
    expect(agg.failed).toBe(0);
    expect(agg.outputs).toEqual(['a', 'b']);
  });

  it('aggregateResults 部分失败 -> partial', () => {
    const results: TaskResult[] = [
      okResult('a', new Date().toISOString()),
      errorResult('e', new Date().toISOString()),
    ];
    const agg = aggregateResults(results);
    expect(agg.status).toBe('partial');
    expect(agg.errors).toEqual(['e']);
  });

  it('aggregateResults 全部失败 -> failed', () => {
    const results: TaskResult[] = [
      errorResult('e1', new Date().toISOString()),
      errorResult('e2', new Date().toISOString()),
    ];
    const agg = aggregateResults(results);
    expect(agg.status).toBe('failed');
  });

  it('aggregateResults 空数组 -> completed', () => {
    expect(aggregateResults([]).status).toBe('completed');
  });

  it('isSuccessfulResult / isRetryableResult', () => {
    expect(isSuccessfulResult(okResult('x', new Date().toISOString()))).toBe(true);
    expect(isRetryableResult(errorResult('e', new Date().toISOString(), 'timeout'))).toBe(true);
    expect(isRetryableResult(null)).toBe(false);
  });
});
