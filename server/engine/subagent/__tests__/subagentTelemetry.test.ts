/**
 * Subagent Telemetry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubagentTelemetry } from '../subagentTelemetry.js';

describe('subagentTelemetry', () => {
  let t: SubagentTelemetry;

  beforeEach(() => {
    t = new SubagentTelemetry();
  });

  it('should record start with metadata', () => {
    t.recordStart('sa-1', { kind: 'research' });
    const stats = t.getStats('sa-1');
    expect(stats.metadata).toEqual({ kind: 'research' });
    expect(stats.startedAt).toBeGreaterThan(0);
    expect(stats.endedAt).toBeUndefined();
  });

  it('should record multiple steps in order', () => {
    t.recordStart('sa-1');
    t.recordStep('sa-1', 'plan', 10);
    t.recordStep('sa-1', 'execute', 50);
    t.recordStep('sa-1', 'verify', 5);
    const stats = t.getStats('sa-1');
    expect(stats.steps.length).toBe(3);
    expect(stats.steps.map((s) => s.step)).toEqual([
      'plan',
      'execute',
      'verify',
    ]);
    expect(stats.steps[1].durationMs).toBe(50);
  });

  it('should record end with totalMs', async () => {
    t.recordStart('sa-1');
    await new Promise((r) => setTimeout(r, 5));
    const ok = t.recordEnd('sa-1', true, 1234);
    expect(ok).toBe(true);
    const stats = t.getStats('sa-1');
    expect(stats.success).toBe(true);
    expect(stats.totalMs).toBe(1234);
    expect(stats.endedAt).toBeGreaterThanOrEqual(stats.startedAt);
  });

  it('should compute totalMs from startedAt when not provided', async () => {
    t.recordStart('sa-1');
    await new Promise((r) => setTimeout(r, 10));
    t.recordEnd('sa-1', true);
    const stats = t.getStats('sa-1');
    expect(stats.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('should return false when calling recordEnd twice', () => {
    t.recordStart('sa-1');
    expect(t.recordEnd('sa-1', true, 100)).toBe(true);
    expect(t.recordEnd('sa-1', false, 200)).toBe(false);
    const stats = t.getStats('sa-1');
    expect(stats.success).toBe(true);
    expect(stats.totalMs).toBe(100);
  });

  it('should return false when ending a non-existent subagent', () => {
    expect(t.recordEnd('nope', false, 10)).toBe(false);
  });

  it('should get all stats', () => {
    t.recordStart('a');
    t.recordEnd('a', true, 10);
    t.recordStart('b');
    t.recordEnd('b', false, 20);
    t.recordStart('c'); // 未结束
    const all = t.getAllStats();
    expect(all.length).toBe(3);
    const ids = all.map((s) => s.subagentId).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('should compute aggregate from completed runs only', () => {
    t.recordStart('a');
    t.recordEnd('a', true, 100);
    t.recordStart('b');
    t.recordEnd('b', true, 300);
    t.recordStart('c');
    t.recordEnd('c', false, 200);
    t.recordStart('d'); // 未结束，不计入
    const agg = t.getAggregate();
    expect(agg.total).toBe(3);
    expect(agg.success).toBe(2);
    expect(agg.failed).toBe(1);
    expect(agg.avgDurationMs).toBe((100 + 300 + 200) / 3);
  });

  it('should auto-initialize on recordStep for unknown ids', () => {
    t.recordStep('auto', 'init', 1);
    const stats = t.getStats('auto');
    expect(stats.steps.length).toBe(1);
    expect(stats.startedAt).toBeGreaterThan(0);
  });
});
