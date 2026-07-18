/**
 * tasks/task-decomposer.ts — 任务分解器（纯规则）
 *
 * 与 server/engine/taskDecomposer.ts（LLM 版）不同，
 * 本模块基于规则的轻量分解：将一个父任务按步骤描述拆分为子任务 DAG，
 * 用于内部任务编排（不调用 LLM）。
 */
import { genTaskId, nowIso, normalizePriority } from './types.js';
import type { Task, TaskPriority } from './types.js';

export interface SubTaskSpec {
  /** 子任务名 */
  name: string;
  /** 子任务描述 */
  description?: string;
  /** 依赖的子任务索引（0-based，指向 specs 中位置） */
  dependsOn?: number[];
  /** 优先级 */
  priority?: TaskPriority;
  /** 载荷 */
  payload?: unknown;
}

export interface DecompositionResult {
  parentId: string;
  subtasks: Task[];
  hasParallelism: boolean;
  layers: number;
  createdAt: string;
}

/** 多步骤意图关键词。 */
const STEP_KEYWORDS = /然后|接着|之后|，|\n|；|;|第一步|第二步|第三步/g;

/** 将子任务规格列表转换为 Task 对象（status=pending，dependencies 用子任务 ID）。 */
export function buildSubtasks(
  parentId: string,
  specs: SubTaskSpec[],
  prefix?: string,
): Task[] {
  const created: Task[] = [];
  const idOf = (i: number) => created[i]?.id;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const id = genTaskId(`${prefix ?? parentId}_sub`);
    const deps = (s.dependsOn ?? [])
      .map(idx => idOf(idx))
      .filter((x): x is string => !!x);
    const task: Task = {
      id,
      name: s.name,
      ...(s.description !== undefined ? { description: s.description } : {}),
      status: 'pending',
      priority: normalizePriority(s.priority),
      dependencies: deps,
      ...(s.payload !== undefined ? { payload: s.payload } : {}),
      timeoutMs: 0,
      maxRetries: 0,
      retryCount: 0,
      tags: ['subtask', parentId],
      metadata: { parentId, index: i },
      createdAt: nowIso(),
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      progress: null,
      result: null,
      error: null,
    };
    created.push(task);
  }
  return created;
}

/**
 * 规则分解：按 STEP_KEYWORDS 切分描述，生成串行子任务链。
 * - 至少 minSubtasks 段才分解
 * - 不超过 maxSubtasks
 * - 返回 null 表示不分解
 */
export function decomposeByDescription(
  parentId: string,
  description: string,
  opts: { minSubtasks?: number; maxSubtasks?: number; priority?: TaskPriority } = {},
): DecompositionResult | null {
  const minSubtasks = opts.minSubtasks ?? 2;
  const maxSubtasks = opts.maxSubtasks ?? 6;
  const parts = description
    .split(STEP_KEYWORDS)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (parts.length < minSubtasks) return null;
  const trimmed = parts.slice(0, maxSubtasks);
  const specs: SubTaskSpec[] = trimmed.map((p, i) => ({
    name: `步骤 ${i + 1}`,
    description: p,
    dependsOn: i > 0 ? [i - 1] : [],
    priority: opts.priority,
  }));
  return decompose(parentId, specs);
}

/** 按 specs 构建分解结果（含并行检测与层数）。 */
export function decompose(parentId: string, specs: SubTaskSpec[]): DecompositionResult {
  const subtasks = buildSubtasks(parentId, specs);
  // 计算层数（最长依赖链）
  const depthCache = new Map<string, number>();
  const byId = new Map(subtasks.map(t => [t.id, t]));
  const depthOf = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const t = byId.get(id);
    if (!t || t.dependencies.length === 0) {
      depthCache.set(id, 1);
      return 1;
    }
    let max = 0;
    for (const d of t.dependencies) max = Math.max(max, depthOf(d));
    depthCache.set(id, max + 1);
    return max + 1;
  };
  let layers = 0;
  for (const t of subtasks) layers = Math.max(layers, depthOf(t.id));
  // 并行检测：存在两个子任务互不依赖
  let hasParallel = false;
  for (let i = 0; i < subtasks.length && !hasParallel; i++) {
    for (let j = i + 1; j < subtasks.length; j++) {
      const a = subtasks[i];
      const b = subtasks[j];
      if (!a.dependencies.includes(b.id) && !b.dependencies.includes(a.id)) {
        hasParallel = true;
        break;
      }
    }
  }
  return {
    parentId,
    subtasks,
    hasParallelism: hasParallel,
    layers,
    createdAt: nowIso(),
  };
}
