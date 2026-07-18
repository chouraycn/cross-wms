/**
 * Subagent Orchestrator — 多 Subagent 编排
 *
 * 在一组 subagent 任务之上提供三种编排策略：
 * - sequential：按顺序执行，前一个失败则停止
 * - parallel：所有任务同时启动
 * - dag：按 dependsOn 拓扑排序后并行启动可并行的任务
 *
 * DAG 模式下任一任务失败会取消依赖它的下游任务。
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';
import { SubagentScheduler, type SubagentScheduledResult, type SubagentTask } from './subagentScheduler.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 编排策略 */
export type OrchestrationStrategy = 'sequential' | 'parallel' | 'dag';

/** 编排任务输入（与 SubagentTask 类似但暴露编排字段） */
export interface OrchestratorTask {
  id?: string;
  name: string;
  payload?: unknown;
  priority?: number;
  dependsOn?: string[];
  execute: (task: OrchestratorTask) => Promise<unknown>;
  optional?: boolean;
  metadata?: Record<string, unknown>;
}

/** 编排结果 */
export interface SubagentResult {
  taskId: string;
  name: string;
  status: 'completed' | 'failed' | 'cancelled' | 'skipped';
  result?: unknown;
  error?: string;
  durationMs?: number;
  startedAt?: number;
  completedAt?: number;
}

/** 编排选项 */
export interface OrchestrateOptions {
  /** 任务超时（毫秒） */
  timeoutMs?: number;
  /** 失败时是否收集已有结果（默认 true） */
  collectOnError?: boolean;
}

// ============================================================================
// 内部辅助
// ============================================================================

interface InternalNode {
  task: OrchestratorTask;
  taskId: string;
  dependsOn: string[];
  result?: SubagentResult;
  startedAt?: number;
  completedAt?: number;
}

/**
 * 给节点分配稳定 ID
 *
 * 优先使用用户提供的 id，其次使用 name；最后才回退到 index + uuid。
 * 使用 name 作为隐式 id 允许 dependsOn 通过 name 引用。
 */
function ensureId(task: OrchestratorTask, index: number): string {
  return task.id ?? task.name ?? `orch_${index}_${randomUUID().slice(0, 6)}`;
}

/**
 * 拓扑排序
 *
 * 返回按依赖顺序排列的层（每层内任务互不依赖，可并行执行）。
 * 检测到循环依赖时抛出错误。
 */
function topoLayers(nodes: InternalNode[]): InternalNode[][] {
  const byId = new Map<string, InternalNode>();
  for (const n of nodes) byId.set(n.taskId, n);

  // 验证所有依赖都存在
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (!byId.has(dep)) {
        throw new Error(
          `[SubagentOrchestrator] Task ${n.taskId} depends on unknown task ${dep}`,
        );
      }
    }
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.taskId, n.dependsOn.length);
    if (!dependents.has(n.taskId)) dependents.set(n.taskId, []);
    for (const dep of n.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(n.taskId);
      dependents.set(dep, list);
    }
  }

  const layers: InternalNode[][] = [];
  const remaining = new Set(nodes.map((n) => n.taskId));

  while (remaining.size > 0) {
    const layer: InternalNode[] = [];
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) === 0) {
        const node = byId.get(id);
        if (node) layer.push(node);
      }
    }
    if (layer.length === 0) {
      throw new Error('[SubagentOrchestrator] Circular dependency detected in DAG');
    }
    layers.push(layer);
    for (const n of layer) {
      remaining.delete(n.taskId);
      for (const dep of dependents.get(n.taskId) ?? []) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
      }
    }
  }

  return layers;
}

/**
 * 根据 ID 找节点
 */
function findNode(nodes: InternalNode[], id: string): InternalNode | undefined {
  return nodes.find((n) => n.taskId === id);
}

// ============================================================================
// SubagentOrchestrator 类
// ============================================================================

/**
 * 多 subagent 编排器
 *
 * 通过内部持有 SubagentScheduler 实现并发限流和任务调度。
 */
export class SubagentOrchestrator {
  private readonly scheduler: SubagentScheduler;

  constructor(scheduler?: SubagentScheduler) {
    this.scheduler = scheduler ?? new SubagentScheduler();
  }

  /**
   * 编排一组任务
   * @param tasks - 任务定义
   * @param strategy - 编排策略
   * @param options - 编排选项
   * @returns 所有任务的结果数组（顺序与输入一致）
   */
  async orchestrate(
    tasks: OrchestratorTask[],
    strategy: OrchestrationStrategy,
    options: OrchestrateOptions = {},
  ): Promise<SubagentResult[]> {
    if (tasks.length === 0) return [];

    // 预先分配稳定 ID
    const nodes: InternalNode[] = tasks.map((t, idx) => ({
      task: t,
      taskId: ensureId(t, idx),
      dependsOn: [...(t.dependsOn ?? [])],
    }));
    const nodeIndex = new Map<string, InternalNode>();
    for (const n of nodes) nodeIndex.set(n.taskId, n);

    // 检测重复 ID
    if (nodeIndex.size !== nodes.length) {
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const n of nodes) {
        if (seen.has(n.taskId)) dups.push(n.taskId);
        seen.add(n.taskId);
      }
      throw new Error(
        `[SubagentOrchestrator] Duplicate task ids: ${dups.join(', ')}`,
      );
    }

    switch (strategy) {
      case 'sequential':
        return this.runSequential(nodes, options);
      case 'parallel':
        return this.runParallel(nodes, options);
      case 'dag':
        return this.runDag(nodes, options);
      default: {
        const _exhaustive: never = strategy;
        throw new Error(`[SubagentOrchestrator] Unknown strategy: ${String(_exhaustive)}`);
      }
    }
  }

  // ============ 顺序执行 ============

  private async runSequential(
    nodes: InternalNode[],
    options: OrchestrateOptions,
  ): Promise<SubagentResult[]> {
    const results: SubagentResult[] = [];
    for (const node of nodes) {
      const result = await this.runOne(node, options);
      results.push(result);
      if (result.status === 'failed' && !node.task.optional) {
        // 失败且非可选：停止并标记剩余为 skipped
        for (const rest of nodes) {
          if (rest === node) continue;
          if (rest.result) continue;
          rest.result = {
            taskId: rest.taskId,
            name: rest.task.name,
            status: 'skipped',
            error: 'Previous task failed',
          };
          results.push(rest.result);
        }
        break;
      }
    }
    // 保持与输入顺序一致
    return this.alignOrder(nodes, results);
  }

  // ============ 并行执行 ============

  private async runParallel(
    nodes: InternalNode[],
    options: OrchestrateOptions,
  ): Promise<SubagentResult[]> {
    const promises = nodes.map((node) => this.runOne(node, options));
    const settled = await Promise.allSettled(promises);

    const results: SubagentResult[] = nodes.map((node, idx) => {
      const r = settled[idx];
      if (r && r.status === 'fulfilled') {
        return r.value;
      }
      // 不会出现 rejected（runOne 内部捕获），但兜底处理
      const reason =
        r && r.status === 'rejected'
          ? r.reason instanceof Error
            ? r.reason.message
            : String(r.reason)
          : 'unknown error';
      return {
        taskId: node.taskId,
        name: node.task.name,
        status: 'failed',
        error: reason,
      };
    });
    return results;
  }

  // ============ DAG 执行 ============

  private async runDag(
    nodes: InternalNode[],
    options: OrchestrateOptions,
  ): Promise<SubagentResult[]> {
    const layers = topoLayers(nodes);
    const failedUpstream = new Set<string>();
    const cancelledDownstream = new Set<string>();

    // 预先把依赖了失败节点的节点标记为取消
    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        if (failedUpstream.has(dep)) {
          cancelledDownstream.add(node.taskId);
        }
      }
    }

    for (const layer of layers) {
      // 过滤掉已确定被取消的节点
      const toRun = layer.filter((n) => !cancelledDownstream.has(n.taskId));
      const toCancel = layer.filter((n) => cancelledDownstream.has(n.taskId));

      for (const node of toCancel) {
        node.result = {
          taskId: node.taskId,
          name: node.task.name,
          status: 'cancelled',
          error: 'Upstream dependency failed',
          completedAt: Date.now(),
        };
      }

      const results = await Promise.allSettled(
        toRun.map((node) => this.runOne(node, options)),
      );

      toRun.forEach((node, idx) => {
        const r = results[idx];
        if (!r) return;
        if (r.status === 'fulfilled') {
          if (r.value.status === 'failed') {
            failedUpstream.add(node.taskId);
            // 标记所有依赖此节点的下游为取消
            for (const other of nodes) {
              if (other.dependsOn.includes(node.taskId)) {
                cancelledDownstream.add(other.taskId);
              }
            }
          }
        } else {
          failedUpstream.add(node.taskId);
          for (const other of nodes) {
            if (other.dependsOn.includes(node.taskId)) {
              cancelledDownstream.add(other.taskId);
            }
          }
        }
      });
    }

    // 把仍没有结果（不应发生）的兜底
    for (const node of nodes) {
      if (!node.result) {
        node.result = {
          taskId: node.taskId,
          name: node.task.name,
          status: 'skipped',
        };
      }
    }
    return this.alignOrder(nodes, nodes.map((n) => n.result!));
  }

  // ============ 单任务执行 ============

  private async runOne(
    node: InternalNode,
    options: OrchestrateOptions,
  ): Promise<SubagentResult> {
    const task: SubagentTask = {
      id: node.taskId,
      name: node.task.name,
      payload: node.task.payload,
      priority: node.task.priority,
      metadata: node.task.metadata,
      execute: async () => node.task.execute(node.task),
    };
    node.startedAt = Date.now();
    try {
      const settled: SubagentScheduledResult = await this.scheduler.schedule(
        task,
        { timeoutMs: options.timeoutMs },
      );
      node.completedAt = Date.now();
      const result: SubagentResult = {
        taskId: node.taskId,
        name: node.task.name,
        status: settled.status === 'cancelled' ? 'cancelled' : 'completed',
        result: settled.result,
        durationMs: settled.durationMs,
        startedAt: settled.startedAt,
        completedAt: settled.completedAt,
      };
      // optional 任务若失败仍标记为 failed（不抛错），由编排层决定是否继续
      if (settled.status === 'failed') {
        result.status = 'failed';
        result.error = settled.error;
      }
      node.result = result;
      return result;
    } catch (err) {
      node.completedAt = Date.now();
      const message = err instanceof Error ? err.message : String(err);
      const result: SubagentResult = {
        taskId: node.taskId,
        name: node.task.name,
        status: 'failed',
        error: message,
        startedAt: node.startedAt,
        completedAt: node.completedAt,
      };
      node.result = result;
      logger.debug(`[SubagentOrchestrator] Task ${node.taskId} failed: ${message}`);
      return result;
    }
  }

  // ============ 工具方法 ============

  /**
   * 把 results 重新按 nodes 顺序排序
   */
  private alignOrder(
    nodes: InternalNode[],
    results: SubagentResult[],
  ): SubagentResult[] {
    const byId = new Map<string, SubagentResult>();
    for (const r of results) byId.set(r.taskId, r);
    return nodes.map(
      (n) =>
        byId.get(n.taskId) ??
        ({
          taskId: n.taskId,
          name: n.task.name,
          status: 'skipped',
        } as SubagentResult),
    );
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 使用全局调度器快速执行一次编排
 */
export async function orchestrateSubagents(
  tasks: OrchestratorTask[],
  strategy: OrchestrationStrategy,
  options: OrchestrateOptions = {},
): Promise<SubagentResult[]> {
  const orchestrator = new SubagentOrchestrator();
  return orchestrator.orchestrate(tasks, strategy, options);
}
