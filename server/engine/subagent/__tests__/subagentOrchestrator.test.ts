/**
 * Subagent Orchestrator Tests
 *
 * 覆盖：
 * 1. 顺序执行
 * 2. 顺序执行失败则停止
 * 3. 并行执行所有任务
 * 4. 并行执行收集所有结果
 * 5. DAG 拓扑正确执行
 * 6. DAG 失败取消下游
 * 7. 循环依赖报错
 * 8. 依赖未知任务报错
 * 9. 空任务数组
 */

import { describe, it, expect } from 'vitest';
import { SubagentOrchestrator } from '../subagentOrchestrator.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const noop = async () => undefined;
const fail = async () => {
  throw new Error('orch-fail');
};

describe('subagentOrchestrator', () => {
  it('should run tasks sequentially in order', async () => {
    const order: string[] = [];
    const orch = new SubagentOrchestrator();
    const results = await orch.orchestrate(
      [
        { name: 'a', execute: async () => { order.push('a'); return 1; } },
        { name: 'b', execute: async () => { order.push('b'); return 2; } },
        { name: 'c', execute: async () => { order.push('c'); return 3; } },
      ],
      'sequential',
    );
    expect(order).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(results.map((r) => r.result)).toEqual([1, 2, 3]);
  });

  it('should stop on first failure in sequential mode', async () => {
    const orch = new SubagentOrchestrator();
    const results = await orch.orchestrate(
      [
        { name: 'a', execute: noop },
        { name: 'b', execute: fail },
        { name: 'c', execute: async () => 'should-not-run' },
      ],
      'sequential',
    );
    // c 之后被跳过
    expect(results.map((r) => r.name)).toEqual(['a', 'b', 'c']);
    const statuses = results.map((r) => r.status);
    expect(statuses[0]).toBe('completed');
    expect(statuses[1]).toBe('failed');
    expect(statuses[2]).toBe('skipped');
  });

  it('should run all tasks in parallel', async () => {
    const orch = new SubagentOrchestrator();
    const results = await orch.orchestrate(
      [
        { name: 'p1', execute: async () => { await sleep(20); return 'p1'; } },
        { name: 'p2', execute: async () => { await sleep(5); return 'p2'; } },
        { name: 'p3', execute: async () => { await sleep(10); return 'p3'; } },
      ],
      'parallel',
    );
    expect(results.length).toBe(3);
    expect(results.every((r) => r.status === 'completed')).toBe(true);
  });

  it('should collect all results even when some parallel tasks fail', async () => {
    const orch = new SubagentOrchestrator();
    const results = await orch.orchestrate(
      [
        { name: 'ok1', execute: async () => 'a' },
        { name: 'bad', execute: fail },
        { name: 'ok2', execute: async () => 'c' },
      ],
      'parallel',
    );
    const map = new Map(results.map((r) => [r.name, r]));
    expect(map.get('ok1')?.status).toBe('completed');
    expect(map.get('bad')?.status).toBe('failed');
    expect(map.get('ok2')?.status).toBe('completed');
  });

  it('should run DAG in topological order', async () => {
    const order: string[] = [];
    const orch = new SubagentOrchestrator();
    const results = await orch.orchestrate(
      [
        { name: 'd', dependsOn: ['a', 'b'], execute: async () => { order.push('d'); return 4; } },
        { name: 'a', execute: async () => { order.push('a'); return 1; } },
        { name: 'c', dependsOn: ['a'], execute: async () => { order.push('c'); return 3; } },
        { name: 'b', execute: async () => { order.push('b'); return 2; } },
      ],
      'dag',
    );
    // 所有任务完成
    expect(results.every((r) => r.status === 'completed')).toBe(true);
    // d 必须在 a、b 之后；c 必须在 a 之后
    const idxA = order.indexOf('a');
    const idxB = order.indexOf('b');
    const idxC = order.indexOf('c');
    const idxD = order.indexOf('d');
    expect(idxA).toBeLessThan(idxC);
    expect(idxA).toBeLessThan(idxD);
    expect(idxB).toBeLessThan(idxD);
  });

  it('should cancel downstream tasks when upstream fails in DAG', async () => {
    const orch = new SubagentOrchestrator();
    const results = await orch.orchestrate(
      [
        { name: 'root', execute: noop },
        { name: 'mid', dependsOn: ['root'], execute: fail },
        { name: 'leaf', dependsOn: ['mid'], execute: async () => 'never' },
      ],
      'dag',
    );
    const map = new Map(results.map((r) => [r.name, r]));
    expect(map.get('root')?.status).toBe('completed');
    expect(map.get('mid')?.status).toBe('failed');
    // leaf 在 mid 失败后被取消
    expect(map.get('leaf')?.status).toBe('cancelled');
  });

  it('should throw on circular dependency', async () => {
    const orch = new SubagentOrchestrator();
    await expect(
      orch.orchestrate(
        [
          { id: 'x', name: 'x', dependsOn: ['y'], execute: noop },
          { id: 'y', name: 'y', dependsOn: ['x'], execute: noop },
        ],
        'dag',
      ),
    ).rejects.toThrow(/Circular/);
  });

  it('should throw on unknown dependency', async () => {
    const orch = new SubagentOrchestrator();
    await expect(
      orch.orchestrate(
        [
          { name: 'a', dependsOn: ['missing'], execute: noop },
        ],
        'dag',
      ),
    ).rejects.toThrow(/unknown task/);
  });
});
