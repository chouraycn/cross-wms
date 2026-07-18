/**
 * tasks/task-dependency.ts — 依赖管理
 *
 * 基于 finish_to_start 语义的 DAG：
 * - addEdge / removeEdge
 * - hasCycle（DFS 三色标记）
 * - topologicalSort（Kahn 算法）
 * - getReadyTasks（所有前置已完成）
 * - getLayers（按层并行分组）
 * - getAncestors / getDescendants
 */
import type { Task } from './types.js';

export interface DependencyGraph {
  /** 任务 ID -> 其前置依赖 ID 集合 */
  edges: Map<string, Set<string>>;
  /** 任务 ID -> 依赖它的后继任务 ID 集合 */
  reverse: Map<string, Set<string>>;
}

export function createGraph(): DependencyGraph {
  return { edges: new Map(), reverse: new Map() };
}

/** 确保节点存在（无依赖的任务也需注册为节点）。 */
export function ensureNode(graph: DependencyGraph, id: string): void {
  if (!graph.edges.has(id)) graph.edges.set(id, new Set());
  if (!graph.reverse.has(id)) graph.reverse.set(id, new Set());
}

/** 添加依赖边：task 依赖于 dep（dep 完成后 task 才可执行）。
 * 返回是否添加成功（自环返回 false）。 */
export function addEdge(graph: DependencyGraph, task: string, dep: string): boolean {
  if (task === dep) return false;
  ensureNode(graph, task);
  ensureNode(graph, dep);
  if (graph.edges.get(task)!.has(dep)) return false;
  graph.edges.get(task)!.add(dep);
  graph.reverse.get(dep)!.add(task);
  // 立即检测是否引入环
  if (hasCycle(graph)) {
    // 回滚
    graph.edges.get(task)!.delete(dep);
    graph.reverse.get(dep)!.delete(task);
    return false;
  }
  return true;
}

/** 移除依赖边。返回是否确实移除。 */
export function removeEdge(graph: DependencyGraph, task: string, dep: string): boolean {
  const removed = graph.edges.get(task)?.delete(dep) ?? false;
  if (removed) graph.reverse.get(dep)?.delete(task);
  return removed;
}

/** 从 Task 列表构建图（使用 task.dependencies）。 */
export function buildGraphFromTasks(tasks: Task[]): DependencyGraph {
  const graph = createGraph();
  for (const t of tasks) {
    ensureNode(graph, t.id);
    for (const dep of t.dependencies) {
      addEdge(graph, t.id, dep);
    }
  }
  return graph;
}

/** DFS 三色标记检测环。 */
export function hasCycle(graph: DependencyGraph): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.edges.keys()) color.set(id, WHITE);

  const dfs = (id: string): boolean => {
    color.set(id, GRAY);
    const deps = graph.edges.get(id);
    if (deps) {
      for (const d of deps) {
        const c = color.get(d) ?? WHITE;
        if (c === GRAY) return true;
        if (c === WHITE && dfs(d)) return true;
      }
    }
    color.set(id, BLACK);
    return false;
  };

  for (const id of graph.edges.keys()) {
    if (color.get(id) === WHITE) {
      if (dfs(id)) return true;
    }
  }
  return false;
}

/** Kahn 拓扑排序；若存在环返回 null。 */
export function topologicalSort(graph: DependencyGraph): string[] | null {
  // 入度 = 每个节点的前置依赖数；同时确保所有节点都出现在 inDegree 中
  const inDegree = new Map<string, number>();
  for (const [id, deps] of graph.edges) {
    if (!inDegree.has(id)) inDegree.set(id, 0);
    for (const d of deps) {
      if (!inDegree.has(d)) inDegree.set(d, 0);
    }
  }
  for (const [id, deps] of graph.edges) {
    inDegree.set(id, deps.size);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    const successors = graph.reverse.get(id);
    if (successors) {
      for (const s of successors) {
        const d = (inDegree.get(s) ?? 0) - 1;
        inDegree.set(s, d);
        if (d === 0) queue.push(s);
      }
    }
  }
  return sorted.length === inDegree.size ? sorted : null;
}

/** 获取所有前置依赖（直接 + 传递）的集合。 */
export function getAncestors(graph: DependencyGraph, id: string): Set<string> {
  const result = new Set<string>();
  const stack = [id];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const deps = graph.edges.get(cur);
    if (deps) {
      for (const d of deps) {
        result.add(d);
        stack.push(d);
      }
    }
  }
  result.delete(id);
  return result;
}

/** 获取所有后继（直接 + 传递）的集合。 */
export function getDescendants(graph: DependencyGraph, id: string): Set<string> {
  const result = new Set<string>();
  const stack = [id];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const succs = graph.reverse.get(cur);
    if (succs) {
      for (const s of succs) {
        result.add(s);
        stack.push(s);
      }
    }
  }
  result.delete(id);
  return result;
}

/** 在给定任务集合中，找出所有前置均已完成的任务（即可就绪）。 */
export function getReadyTasks(
  graph: DependencyGraph,
  tasks: Map<string, Task>,
): Task[] {
  const ready: Task[] = [];
  for (const [id, deps] of graph.edges) {
    const task = tasks.get(id);
    if (!task) continue;
    if (task.status !== 'pending' && task.status !== 'queued') continue;
    let ok = true;
    for (const d of deps) {
      const dep = tasks.get(d);
      if (!dep || dep.status !== 'completed') {
        ok = false;
        break;
      }
    }
    if (ok) ready.push(task);
  }
  return ready;
}

/** 按层分组：每层内互不依赖，可并行执行。返回层级数组。 */
export function getLayers(graph: DependencyGraph): string[][] {
  if (hasCycle(graph)) return [];
  const remaining = new Set<string>(graph.edges.keys());
  const completed = new Set<string>();
  const layers: string[][] = [];
  while (remaining.size > 0) {
    const layer: string[] = [];
    for (const id of remaining) {
      const deps = graph.edges.get(id)!;
      let ok = true;
      for (const d of deps) {
        if (!completed.has(d)) {
          ok = false;
          break;
        }
      }
      if (ok) layer.push(id);
    }
    if (layer.length === 0) break; // 死锁
    layers.push(layer);
    for (const id of layer) {
      remaining.delete(id);
      completed.add(id);
    }
  }
  return layers;
}
