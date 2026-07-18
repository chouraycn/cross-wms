/**
 * tasks/task-parallelizer.ts — 并行化器
 *
 * 将一组带依赖的任务划分为可并行执行的层级 / 批次，
 * 在给定并发度下生成执行批次序列。
 */
import { getLayers } from './task-dependency.js';
import { buildGraphFromTasks } from './task-dependency.js';
import { comparePriority } from './task-priority.js';
import type { Task } from './types.js';

/** 按依赖分层：每层内任务互不依赖，可并行。 */
export function parallelLayers(tasks: Task[]): Task[][] {
  if (tasks.length === 0) return [];
  const graph = buildGraphFromTasks(tasks);
  const layers = getLayers(graph);
  const byId = new Map(tasks.map(t => [t.id, t]));
  return layers.map(layer =>
    layer
      .map(id => byId.get(id))
      .filter((t): t is Task => !!t)
      .sort((a, b) => comparePriority(b.priority, a.priority)),
  );
}

/** 检测是否存在可并行的任务（任意两个互不依赖）。 */
export function hasParallelism(tasks: Task[]): boolean {
  return parallelLayers(tasks).some(layer => layer.length > 1);
}

/**
 * 在给定并发度下生成执行批次：
 * 同层任务尽量并行，但单批不超过 concurrency。
 * 跨层必须等待（下一批来自下一层）。
 */
export function batchedParallel(tasks: Task[], concurrency: number): Task[][] {
  if (concurrency <= 0) throw new Error('concurrency must be positive');
  const layers = parallelLayers(tasks);
  const batches: Task[][] = [];
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i += concurrency) {
      batches.push(layer.slice(i, i + concurrency));
    }
  }
  return batches;
}

/** 估算理论最短执行时间（层数 × 单层最慢任务，粗略）。 */
export function estimateCriticalPath(
  tasks: Task[],
  durationFn: (t: Task) => number = () => 1,
): number {
  const layers = parallelLayers(tasks);
  let total = 0;
  for (const layer of layers) {
    let layerMax = 0;
    for (const t of layer) {
      const d = durationFn(t);
      if (d > layerMax) layerMax = d;
    }
    total += layerMax;
  }
  return total;
}

/** 单任务链（线性依赖）的并行化结果应为单层单任务。 */
export function isLinearChain(tasks: Task[]): boolean {
  return parallelLayers(tasks).every(layer => layer.length === 1);
}
