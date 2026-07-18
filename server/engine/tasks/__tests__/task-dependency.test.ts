import { describe, it, expect } from 'vitest';
import {
  createGraph,
  addEdge,
  removeEdge,
  buildGraphFromTasks,
  hasCycle,
  topologicalSort,
  getReadyTasks,
  getLayers,
  getAncestors,
  getDescendants,
  ensureNode,
} from '../task-dependency.js';
import type { Task } from '../types.js';

function makeTask(id: string, deps: string[] = [], status: Task['status'] = 'pending'): Task {
  return {
    id, name: id, status, priority: 'medium', dependencies: deps,
    timeoutMs: 0, maxRetries: 0, retryCount: 0, tags: [], metadata: {},
    createdAt: new Date().toISOString(), queuedAt: null, startedAt: null,
    completedAt: null, progress: null, result: null, error: null,
  };
}

describe('task-dependency', () => {
  it('addEdge 添加依赖且自环返回 false', () => {
    const g = createGraph();
    expect(addEdge(g, 'b', 'a')).toBe(true);
    expect(addEdge(g, 'b', 'a')).toBe(false); // 重复
    expect(addEdge(g, 'a', 'a')).toBe(false); // 自环
  });

  it('addEdge 检测环并回滚', () => {
    const g = createGraph();
    addEdge(g, 'b', 'a'); // b 依赖 a
    addEdge(g, 'c', 'b'); // c 依赖 b
    // a 依赖 c 会形成环 a->c->b->a
    expect(addEdge(g, 'a', 'c')).toBe(false);
    expect(hasCycle(g)).toBe(false);
  });

  it('removeEdge 移除依赖', () => {
    const g = createGraph();
    addEdge(g, 'b', 'a');
    expect(removeEdge(g, 'b', 'a')).toBe(true);
    expect(removeEdge(g, 'b', 'a')).toBe(false);
  });

  it('hasCycle 检测无环图', () => {
    const g = createGraph();
    addEdge(g, 'b', 'a');
    addEdge(g, 'c', 'a');
    expect(hasCycle(g)).toBe(false);
  });

  it('topologicalSort 返回合法顺序', () => {
    const g = createGraph();
    addEdge(g, 'b', 'a'); // a 在 b 前
    addEdge(g, 'c', 'b'); // b 在 c 前
    const sorted = topologicalSort(g)!;
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
  });

  it('topologicalSort 有环返回 null', () => {
    const tasks = [makeTask('a', ['c']), makeTask('b', ['a']), makeTask('c', ['b'])];
    const g = buildGraphFromTasks(tasks);
    // buildGraphFromTasks 会因环回滚部分边，hasCycle 可能为 false
    // 这里直接构造一个环来测试
    const g2 = createGraph();
    ensureNode(g2, 'x'); ensureNode(g2, 'y');
    // 手动构造环（绕过 addEdge 的回滚）
    g2.edges.get('x')!.add('y');
    g2.edges.get('y')!.add('x');
    g2.reverse.get('y')!.add('x');
    g2.reverse.get('x')!.add('y');
    expect(topologicalSort(g2)).toBeNull();
  });

  it('getReadyTasks 返回前置已完成的任务', () => {
    const tasks = [makeTask('a', [], 'completed'), makeTask('b', ['a'], 'pending'), makeTask('c', ['b'], 'pending')];
    const map = new Map(tasks.map(t => [t.id, t]));
    const g = buildGraphFromTasks(tasks);
    const ready = getReadyTasks(g, map);
    expect(ready.map(t => t.id)).toEqual(['b']);
  });

  it('getReadyTasks 前置未完成时不返回该任务', () => {
    // a 无前置且 pending -> 就绪；b 依赖 a 且 a 未完成 -> 不就绪
    const tasks = [makeTask('a', [], 'pending'), makeTask('b', ['a'], 'pending')];
    const map = new Map(tasks.map(t => [t.id, t]));
    const g = buildGraphFromTasks(tasks);
    expect(getReadyTasks(g, map).map(t => t.id)).toEqual(['a']);
  });

  it('getLayers 按层分组', () => {
    const tasks = [makeTask('a'), makeTask('b', ['a']), makeTask('c', ['a']), makeTask('d', ['b', 'c'])];
    const g = buildGraphFromTasks(tasks);
    const layers = getLayers(g);
    expect(layers[0]).toEqual(['a']);
    expect(layers[1].sort()).toEqual(['b', 'c']);
    expect(layers[2]).toEqual(['d']);
  });

  it('getAncestors / getDescendants 传递闭包', () => {
    const tasks = [makeTask('a'), makeTask('b', ['a']), makeTask('c', ['b'])];
    const g = buildGraphFromTasks(tasks);
    expect([...getAncestors(g, 'c')].sort()).toEqual(['a', 'b']);
    expect([...getDescendants(g, 'a')].sort()).toEqual(['b', 'c']);
  });

  it('ensureNode 注册孤立节点', () => {
    const g = createGraph();
    ensureNode(g, 'solo');
    expect(g.edges.has('solo')).toBe(true);
    expect(g.edges.get('solo')!.size).toBe(0);
  });
});
