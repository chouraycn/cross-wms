/**
 * tasks/task-graph.ts — 任务图（DAG 构建/查询/可视化）
 *
 * 基于 task-dependency 的图算法，封装面向 Task 的高层 API。
 */
import {
  addEdge,
  buildGraphFromTasks,
  ensureNode,
  getAncestors,
  getDescendants,
  getLayers,
  hasCycle,
  topologicalSort,
} from './task-dependency.js';
import type { DependencyGraph } from './task-dependency.js';
import type { Task } from './types.js';

export class TaskGraph {
  private graph: DependencyGraph;
  private tasks: Map<string, Task>;

  constructor(tasks: Task[] = []) {
    this.tasks = new Map(tasks.map(t => [t.id, t]));
    this.graph = buildGraphFromTasks(tasks);
  }

  /** 添加任务节点（若已存在则更新依赖）。 */
  addTask(task: Task): void {
    this.tasks.set(task.id, task);
    ensureNode(this.graph, task.id);
    for (const dep of task.dependencies) {
      addEdge(this.graph, task.id, dep);
    }
  }

  /** 添加依赖边：task 依赖 dep。 */
  addDependency(taskId: string, depId: string): boolean {
    return addEdge(this.graph, taskId, depId);
  }

  hasCycle(): boolean {
    return hasCycle(this.graph);
  }

  topologicalSort(): string[] | null {
    return topologicalSort(this.graph);
  }

  /** 按层并行分组。 */
  layers(): string[][] {
    return getLayers(this.graph);
  }

  /** 直接 + 传递前置。 */
  ancestors(taskId: string): Set<string> {
    return getAncestors(this.graph, taskId);
  }

  /** 直接 + 传递后继。 */
  descendants(taskId: string): Set<string> {
    return getDescendants(this.graph, taskId);
  }

  /** 某任务的直接前置。 */
  directDependencies(taskId: string): string[] {
    const deps = this.graph.edges.get(taskId);
    return deps ? [...deps] : [];
  }

  /** 某任务的直接后继。 */
  directDependents(taskId: string): string[] {
    const succs = this.graph.reverse.get(taskId);
    return succs ? [...succs] : [];
  }

  get nodeCount(): number {
    return this.graph.edges.size;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  allTasks(): Task[] {
    return [...this.tasks.values()];
  }

  /** 渲染为 Graphviz DOT 字符串（便于可视化）。 */
  toDot(name = 'tasks'): string {
    const lines: string[] = [`digraph "${name}" {`];
    for (const id of this.graph.edges.keys()) {
      lines.push(`  "${id}";`);
    }
    for (const [task, deps] of this.graph.edges) {
      for (const d of deps) {
        lines.push(`  "${d}" -> "${task}";`);
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  /** 导出为边列表（便于序列化）。 */
  toEdgeList(): Array<{ from: string; to: string }> {
    const edges: Array<{ from: string; to: string }> = [];
    for (const [task, deps] of this.graph.edges) {
      for (const d of deps) edges.push({ from: d, to: task });
    }
    return edges;
  }
}

/** 判断一组任务是否存在循环依赖（便捷函数）。 */
export function tasksHaveCycle(tasks: Task[]): boolean {
  return hasCycle(buildGraphFromTasks(tasks));
}
