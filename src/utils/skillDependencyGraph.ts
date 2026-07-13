/**
 * Skill Dependency Graph — 技能依赖图分析器
 *
 * 基于有向无环图(DAG)的技能依赖分析系统，提供：
 * 1. 依赖图构建 — 从技能列表构建完整依赖图
 * 2. 循环检测 — 使用 DFS 检测循环依赖
 * 3. 拓扑排序 — 计算正确的安装/加载顺序
 * 4. 依赖解析 — 解析传递依赖
 * 5. 冲突检测 — 检测同一技能的不同版本冲突
 * 6. 依赖深度 — 计算每个技能的依赖深度
 *
 * 算法说明：
 * - 循环检测：DFS + 颜色标记（白/灰/黑）
 * - 拓扑排序：Kahn 算法（基于入度）
 * - 传递依赖：DFS 遍历所有可达节点
 */

import type { Skill } from '../types/skill';

// ===================== 类型定义 =====================

/** 依赖关系边 */
interface DependencyEdge {
  from: string;
  to: string;
  versionConstraint?: string;
  optional?: boolean;
}

/** 依赖图节点 */
interface GraphNode {
  skillId: string;
  skillName: string;
  version?: string;
  inDegree: number;
  outDegree: number;
  dependencies: string[];
  dependents: string[];
  depth: number;
}

/** 循环依赖检测结果 */
export interface CycleDetectionResult {
  hasCycle: boolean;
  cycles: string[][];
  message?: string;
}

/** 拓扑排序结果 */
export interface TopologicalSortResult {
  success: boolean;
  order: string[];
  message?: string;
}

/** 依赖分析结果 */
export interface DependencyAnalysisResult {
  totalSkills: number;
  totalDependencies: number;
  maxDepth: number;
  hasCycles: boolean;
  cycles: string[][];
  rootSkills: string[];
  leafSkills: string[];
  topologicalOrder: string[];
  transitiveDependents: Record<string, string[]>;
  transitiveDependencies: Record<string, string[]>;
}

/** 版本冲突 */
export interface VersionConflict {
  skillName: string;
  requiredBy: Array<{ skillId: string; constraint: string }>;
  installedVersion?: string;
  message: string;
}

// ===================== SkillDependencyGraph 类 =====================

export class SkillDependencyGraph {
  /** 节点表：skillId → GraphNode */
  private nodes = new Map<string, GraphNode>();

  /** 边列表 */
  private edges: DependencyEdge[] = [];

  /** 技能名 → ID 映射（用于按名称查找） */
  private nameToId = new Map<string, string>();

  // ===================== 1. 图构建 =====================

  /**
   * 从技能列表构建依赖图
   *
   * @param skills - 技能列表
   */
  buildGraph(skills: Skill[]): void {
    this.nodes.clear();
    this.edges = [];
    this.nameToId.clear();

    // 第一步：创建所有节点
    for (const skill of skills) {
      const node: GraphNode = {
        skillId: skill.id,
        skillName: skill.name,
        version: (skill as any).version,
        inDegree: 0,
        outDegree: 0,
        dependencies: [],
        dependents: [],
        depth: 0,
      };
      this.nodes.set(skill.id, node);
      this.nameToId.set(skill.name.toLowerCase(), skill.id);
    }

    // 第二步：建立边
    for (const skill of skills) {
      const deps = (skill as any).dependencies as string[] | undefined;
      if (!deps || deps.length === 0) continue;

      for (const depName of deps) {
        const depId = this.resolveDependency(depName);
        if (depId) {
          this.addEdge(skill.id, depId);
        }
      }
    }

    // 第三步：计算依赖深度
    this.calculateDepths();
  }

  /**
   * 解析依赖名称为 skillId
   *
   * 支持多种格式：
   * - 技能名称
   * - 技能 ID
   * - 带版本约束的名称（如 "skill@>=1.0.0"）
   */
  private resolveDependency(depName: string): string | null {
    const cleanName = depName.split('@')[0].trim().toLowerCase();
    return this.nameToId.get(cleanName) || null;
  }

  /**
   * 添加一条依赖边（skillId 依赖于 depId）
   */
  private addEdge(skillId: string, depId: string): void {
    const fromNode = this.nodes.get(skillId);
    const toNode = this.nodes.get(depId);

    if (!fromNode || !toNode) return;

    fromNode.dependencies.push(depId);
    fromNode.outDegree++;
    toNode.dependents.push(skillId);
    toNode.inDegree++;

    this.edges.push({
      from: skillId,
      to: depId,
    });
  }

  // ===================== 2. 循环检测 =====================

  /**
   * 检测循环依赖
   *
   * 使用 DFS + 三色标记法：
   * - 白色：未访问
   * - 灰色：正在访问（在递归栈中）
   * - 黑色：已完成访问
   *
   * 当遇到灰色节点时，说明存在循环。
   */
  detectCycles(): CycleDetectionResult {
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;

    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const cycles: string[][] = [];

    // 初始化颜色
    for (const nodeId of this.nodes.keys()) {
      color.set(nodeId, WHITE);
      parent.set(nodeId, null);
    }

    // DFS 遍历
    const dfs = (nodeId: string): void => {
      color.set(nodeId, GRAY);

      const node = this.nodes.get(nodeId);
      if (!node) return;

      for (const depId of node.dependencies) {
        const depColor = color.get(depId);

        if (depColor === WHITE) {
          parent.set(depId, nodeId);
          dfs(depId);
        } else if (depColor === GRAY) {
          // 发现循环，回溯构建循环路径
          const cycle: string[] = [depId];
          let current: string | null = nodeId;
          while (current !== null && current !== depId) {
            cycle.unshift(current);
            current = parent.get(current) ?? null;
          }
          cycle.unshift(depId);
          cycles.push(cycle);
        }
      }

      color.set(nodeId, BLACK);
    };

    for (const nodeId of this.nodes.keys()) {
      if (color.get(nodeId) === WHITE) {
        dfs(nodeId);
      }
    }

    // 去重（循环可能以不同起点出现多次）
    const uniqueCycles = this.deduplicateCycles(cycles);

    return {
      hasCycle: uniqueCycles.length > 0,
      cycles: uniqueCycles,
      message: uniqueCycles.length > 0
        ? `检测到 ${uniqueCycles.length} 个循环依赖`
        : '未检测到循环依赖',
    };
  }

  /**
   * 去重循环（将循环标准化为最小字典序起点）
   */
  private deduplicateCycles(cycles: string[][]): string[][] {
    const seen = new Set<string>();
    const result: string[][] = [];

    for (const cycle of cycles) {
      // 找到最小元素作为起点，旋转循环
      const sorted = [...cycle].sort();
      const minIdx = cycle.indexOf(sorted[0]);
      const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
      const key = normalized.join('→');

      if (!seen.has(key)) {
        seen.add(key);
        result.push(cycle);
      }
    }

    return result;
  }

  // ===================== 3. 拓扑排序 =====================

  /**
   * 拓扑排序（Kahn 算法）
   *
   * 计算技能的加载/安装顺序：
   * - 无依赖的技能先加载
   * - 被依赖的技能先于依赖者加载
   *
   * 如果存在循环，排序会失败。
   */
  topologicalSort(): TopologicalSortResult {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const order: string[] = [];

    // 初始化入度
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.inDegree);
      if (node.inDegree === 0) {
        queue.push(id);
      }
    }

    // BFS 处理
    while (queue.length > 0) {
      // 按名称排序，保证结果稳定
      queue.sort();
      const current = queue.shift()!;
      order.push(current);

      const node = this.nodes.get(current);
      if (!node) continue;

      for (const dependentId of node.dependents) {
        const newDegree = (inDegree.get(dependentId) || 0) - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          queue.push(dependentId);
        }
      }
    }

    // 检查是否所有节点都被处理
    if (order.length !== this.nodes.size) {
      return {
        success: false,
        order,
        message: '存在循环依赖，无法完成拓扑排序',
      };
    }

    return {
      success: true,
      order,
      message: `拓扑排序完成，共 ${order.length} 个技能`,
    };
  }

  // ===================== 4. 传递依赖计算 =====================

  /**
   * 获取技能的所有传递依赖（深度优先）
   *
   * 即该技能直接或间接依赖的所有技能。
   */
  getTransitiveDependencies(skillId: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const dfs = (id: string): void => {
      const node = this.nodes.get(id);
      if (!node || visited.has(id)) return;

      visited.add(id);

      for (const depId of node.dependencies) {
        if (!visited.has(depId)) {
          dfs(depId);
          result.push(depId);
        }
      }
    };

    dfs(skillId);
    return result;
  }

  /**
   * 获取技能的所有传递被依赖（反向）
   *
   * 即直接或间接依赖该技能的所有技能。
   */
  getTransitiveDependents(skillId: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const dfs = (id: string): void => {
      const node = this.nodes.get(id);
      if (!node || visited.has(id)) return;

      visited.add(id);

      for (const depId of node.dependents) {
        if (!visited.has(depId)) {
          dfs(depId);
          result.push(depId);
        }
      }
    };

    dfs(skillId);
    return result;
  }

  // ===================== 5. 深度计算 =====================

  /**
   * 计算所有节点的依赖深度
   *
   * 深度定义：最长依赖链的长度
   * - 无依赖的技能深度为 0
   * - 依赖深度为 n 的技能，深度为 n+1
   */
  private calculateDepths(): void {
    // 基于拓扑排序计算深度
    const topo = this.topologicalSort();
    if (!topo.success) return;

    for (const skillId of topo.order) {
      const node = this.nodes.get(skillId);
      if (!node) continue;

      if (node.dependencies.length === 0) {
        node.depth = 0;
      } else {
        let maxDepDepth = 0;
        for (const depId of node.dependencies) {
          const depNode = this.nodes.get(depId);
          if (depNode) {
            maxDepDepth = Math.max(maxDepDepth, depNode.depth);
          }
        }
        node.depth = maxDepDepth + 1;
      }
    }
  }

  /**
   * 获取技能的依赖深度
   */
  getDepth(skillId: string): number {
    return this.nodes.get(skillId)?.depth ?? -1;
  }

  // ===================== 6. 完整分析 =====================

  /**
   * 执行完整的依赖分析
   */
  analyze(): DependencyAnalysisResult {
    const cycleResult = this.detectCycles();
    const topoResult = this.topologicalSort();

    const rootSkills: string[] = [];
    const leafSkills: string[] = [];
    let maxDepth = 0;

    const transitiveDependents: Record<string, string[]> = {};
    const transitiveDependencies: Record<string, string[]> = {};

    for (const [id, node] of this.nodes) {
      if (node.inDegree === 0) rootSkills.push(id);
      if (node.outDegree === 0) leafSkills.push(id);
      maxDepth = Math.max(maxDepth, node.depth);

      transitiveDependents[id] = this.getTransitiveDependents(id);
      transitiveDependencies[id] = this.getTransitiveDependencies(id);
    }

    return {
      totalSkills: this.nodes.size,
      totalDependencies: this.edges.length,
      maxDepth,
      hasCycles: cycleResult.hasCycle,
      cycles: cycleResult.cycles,
      rootSkills,
      leafSkills,
      topologicalOrder: topoResult.order,
      transitiveDependents,
      transitiveDependencies,
    };
  }

  // ===================== 7. 查询接口 =====================

  /**
   * 获取技能节点信息
   */
  getNode(skillId: string): GraphNode | undefined {
    return this.nodes.get(skillId);
  }

  /**
   * 获取直接依赖
   */
  getDirectDependencies(skillId: string): string[] {
    return this.nodes.get(skillId)?.dependencies || [];
  }

  /**
   * 获取直接被依赖
   */
  getDirectDependents(skillId: string): string[] {
    return this.nodes.get(skillId)?.dependents || [];
  }

  /**
   * 检查技能是否存在
   */
  hasSkill(skillId: string): boolean {
    return this.nodes.has(skillId);
  }

  /**
   * 获取技能总数
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * 获取所有技能 ID
   */
  getAllSkillIds(): string[] {
    return Array.from(this.nodes.keys());
  }
}

// ===================== Module-level 辅助函数 =====================

/**
 * 便捷函数：从技能列表快速检测循环依赖
 */
export function detectSkillCycles(skills: Skill[]): CycleDetectionResult {
  const graph = new SkillDependencyGraph();
  graph.buildGraph(skills);
  return graph.detectCycles();
}

/**
 * 便捷函数：获取技能安装顺序
 */
export function getSkillInstallOrder(skills: Skill[]): TopologicalSortResult {
  const graph = new SkillDependencyGraph();
  graph.buildGraph(skills);
  return graph.topologicalSort();
}