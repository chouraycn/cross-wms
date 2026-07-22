/**
 * 技能依赖管理与冲突检测
 *
 * 提供技能依赖解析、依赖图构建、循环依赖检测、
 * 冲突检测等功能。
 */

import type {
  SkillEntry,
  SkillDependency,
  SkillConflict,
  SkillDependencyNode,
  DependencyCheckResult,
  SkillDependencyConfig,
} from "../types.js";

// ============================================================================
// 依赖配置解析
// ============================================================================

/**
 * 从技能的 metadata 解析依赖配置
 *
 * 支持格式：
 * ```yaml
 * metadata:
 *   crosswms:
 *     dependencies:
 *       - skill: builtin-warehouse
 *         required: true
 *         reason: "需要仓库信息"
 *       - skill: builtin-inventory
 *         required: false
 *       conflicts:
 *         - skill: old-wms-system
 *           reason: "功能重复"
 *           suggestion: "卸载 old-wms-system"
 * ```
 */
export function parseDependencyConfig(
  entry: SkillEntry
): SkillDependencyConfig {
  const config: SkillDependencyConfig = {};

  // 从 frontmatter 解析（旧格式兼容）
  const fm = entry.frontmatter;
  if (fm.dependencies) {
    try {
      const deps = JSON.parse(fm.dependencies);
      if (Array.isArray(deps)) {
        config.dependsOn = deps.map((d: unknown) => normalizeDependency(d));
      }
    } catch {
      // 非 JSON 格式，忽略
    }
  }

  if (fm.conflicts) {
    try {
      const conflicts = JSON.parse(fm.conflicts);
      if (Array.isArray(conflicts)) {
        config.conflictsWith = conflicts.map((c: unknown) =>
          normalizeConflict(c)
        );
      }
    } catch {
      // 忽略
    }
  }

  return config;
}

function normalizeDependency(raw: unknown): SkillDependency {
  if (typeof raw === "string") {
    return { skill: raw, required: true };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      skill: String(r.skill ?? r.name ?? ""),
      version: r.version ? String(r.version) : undefined,
      required: r.required !== false,
      reason: r.reason ? String(r.reason) : undefined,
    };
  }
  return { skill: "", required: true };
}

function normalizeConflict(raw: unknown): SkillConflict {
  if (typeof raw === "string") {
    return { skill: raw, reason: "Declared conflict" };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      skill: String(r.skill ?? r.name ?? ""),
      reason: String(r.reason ?? "Declared conflict"),
      suggestion: r.suggestion ? String(r.suggestion) : undefined,
    };
  }
  return { skill: "", reason: "Unknown conflict" };
}

// ============================================================================
// 依赖图构建
// ============================================================================

/**
 * 构建技能依赖图
 */
export function buildDependencyGraph(
  entries: SkillEntry[]
): Map<string, SkillDependencyNode> {
  const graph = new Map<string, SkillDependencyNode>();

  // 第一步：创建所有节点
  for (const entry of entries) {
    const name = entry.skill.name;
    graph.set(name, {
      skill: entry,
      dependencies: [],
      dependents: [],
      depth: 0,
    });
  }

  // 第二步：建立依赖关系
  for (const entry of entries) {
    const config = parseDependencyConfig(entry);
    const node = graph.get(entry.skill.name);
    if (!node) continue;

    for (const dep of config.dependsOn ?? []) {
      const depNode = graph.get(dep.skill);
      if (depNode) {
        node.dependencies.push(depNode);
        depNode.dependents.push(node);
      }
    }
  }

  // 第三步：计算深度（拓扑排序）
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function computeDepth(name: string, stack: string[] = []): number {
    if (visiting.has(name)) {
      // 发现循环，返回当前栈深度
      return stack.indexOf(name);
    }
    if (visited.has(name)) {
      return graph.get(name)?.depth ?? 0;
    }

    visiting.add(name);
    stack.push(name);

    const node = graph.get(name);
    let maxDepDepth = -1;
    for (const dep of node?.dependencies ?? []) {
      const depDepth = computeDepth(dep.skill.skill.name, [...stack]);
      maxDepDepth = Math.max(maxDepDepth, depDepth);
    }

    visiting.delete(name);
    visited.add(name);

    if (node) {
      node.depth = maxDepDepth + 1;
    }
    return node?.depth ?? 0;
  }

  for (const name of graph.keys()) {
    computeDepth(name);
  }

  return graph;
}

// ============================================================================
// 循环依赖检测
// ============================================================================

/**
 * 检测技能间的循环依赖
 */
export function detectCycles(entries: SkillEntry[]): string[][] {
  const cycles: string[][] = [];
  const graph = buildDependencyGraph(entries);

  const visited = new Set<string>();

  for (const [name, node] of graph) {
    if (visited.has(name)) continue;

    const path: string[] = [];
    const pathSet = new Set<string>();

    const dfs = function (current: string): boolean {
      if (pathSet.has(current)) {
        const cycleStart = path.indexOf(current);
        const cycle = path.slice(cycleStart);
        cycles.push(cycle);
        return true;
      }

      if (visited.has(current)) return false;

      path.push(current);
      pathSet.add(current);

      const node = graph.get(current);
      for (const dep of node?.dependencies ?? []) {
        dfs(dep.skill.skill.name);
      }

      path.pop();
      pathSet.delete(current);
      visited.add(current);
      return false;
    };

    dfs(name);
  }

  // 去重：相同循环只保留一次
  const uniqueCycles: string[][] = [];
  const seen = new Set<string>();
  for (const cycle of cycles) {
    const key = cycle.sort().join(",");
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCycles.push(cycle);
    }
  }

  return uniqueCycles;
}

// ============================================================================
// 依赖检查
// ============================================================================

/**
 * 检查技能的依赖是否满足
 */
export function checkDependencies(
  entry: SkillEntry,
  allEntries: SkillEntry[]
): DependencyCheckResult {
  const result: DependencyCheckResult = {
    valid: true,
    missing: [],
    conflicts: [],
    optionalMissing: [],
    cycles: [],
  };

  const config = parseDependencyConfig(entry);
  const availableSkills = new Set(allEntries.map((e) => e.skill.name));

  // 检查依赖
  for (const dep of config.dependsOn ?? []) {
    if (!availableSkills.has(dep.skill)) {
      if (dep.required !== false) {
        result.missing.push(dep);
      } else {
        result.optionalMissing.push(dep);
      }
    }
  }

  // 检查冲突
  for (const conflict of config.conflictsWith ?? []) {
    if (availableSkills.has(conflict.skill)) {
      result.conflicts.push(conflict);
    }
  }

  // 检查循环依赖
  result.cycles = detectCycles([entry, ...allEntries]);

  // 确定是否有效
  result.valid =
    result.missing.length === 0 &&
    result.conflicts.length === 0 &&
    result.cycles.length === 0;

  return result;
}

/**
 * 批量检查所有技能的依赖
 */
export function checkAllDependencies(
  entries: SkillEntry[]
): Map<string, DependencyCheckResult> {
  const results = new Map<string, DependencyCheckResult>();

  for (const entry of entries) {
    const result = checkDependencies(entry, entries);
    results.set(entry.skill.name, result);
  }

  return results;
}

// ============================================================================
// 依赖排序（拓扑排序）
// ============================================================================

/**
 * 按依赖顺序排序技能（被依赖的在前）
 */
export function sortByDependencies(entries: SkillEntry[]): SkillEntry[] {
  const graph = buildDependencyGraph(entries);

  // 按深度排序（深度小的在前，即基础依赖在前）
  return [...entries].sort((a, b) => {
    const depthA = graph.get(a.skill.name)?.depth ?? 0;
    const depthB = graph.get(b.skill.name)?.depth ?? 0;
    return depthA - depthB;
  });
}

// ============================================================================
// 格式化输出
// ============================================================================

/**
 * 格式化依赖检查结果为可读文本
 */
export function formatDependencyResult(
  skillName: string,
  result: DependencyCheckResult
): string {
  const lines: string[] = [];
  lines.push(`=== 技能依赖检查: ${skillName} ===`);

  if (result.valid) {
    lines.push("✅ 所有依赖满足，无冲突");
  } else {
    lines.push("❌ 发现依赖问题");
  }

  if (result.missing.length > 0) {
    lines.push("\n📦 缺失的必需依赖:");
    for (const dep of result.missing) {
      lines.push(`  - ${dep.skill}${dep.reason ? ` (${dep.reason})` : ""}`);
    }
  }

  if (result.optionalMissing.length > 0) {
    lines.push("\n⚠️  未满足的可选依赖:");
    for (const dep of result.optionalMissing) {
      lines.push(`  - ${dep.skill}${dep.reason ? ` (${dep.reason})` : ""}`);
    }
  }

  if (result.conflicts.length > 0) {
    lines.push("\n💥 检测到的冲突:");
    for (const c of result.conflicts) {
      lines.push(`  - 与 ${c.skill} 冲突: ${c.reason}`);
      if (c.suggestion) {
        lines.push(`    建议: ${c.suggestion}`);
      }
    }
  }

  if (result.cycles.length > 0) {
    lines.push("\n🔄 循环依赖:");
    for (const cycle of result.cycles) {
      lines.push(`  - ${cycle.join(" → ")} → ${cycle[0]}`);
    }
  }

  return lines.join("\n");
}

/**
 * 生成依赖报告
 */
export function generateDependencyReport(
  entries: SkillEntry[]
): string {
  const lines: string[] = [];
  lines.push("=== 技能依赖报告 ===\n");

  const graph = buildDependencyGraph(entries);

  // 依赖统计
  let totalDeps = 0;
  let totalConflicts = 0;
  for (const entry of entries) {
    const config = parseDependencyConfig(entry);
    totalDeps += config.dependsOn?.length ?? 0;
    totalConflicts += config.conflictsWith?.length ?? 0;
  }

  lines.push(`技能总数: ${entries.length}`);
  lines.push(`依赖声明: ${totalDeps}`);
  lines.push(`冲突声明: ${totalConflicts}\n`);

  // 按深度列出技能
  const byDepth = new Map<number, string[]>();
  for (const [name, node] of graph) {
    const depth = node.depth;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)!.push(name);
  }

  lines.push("依赖层级:");
  for (const [depth, names] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`  层级 ${depth}: ${names.join(", ")}`);
  }

  // 检查结果
  const results = checkAllDependencies(entries);
  const invalidSkills = [...results.entries()].filter(([, r]) => !r.valid);

  if (invalidSkills.length > 0) {
    lines.push(`\n⚠️  ${invalidSkills.length} 个技能存在依赖问题:`);
    for (const [name, result] of invalidSkills) {
      lines.push(`\n${formatDependencyResult(name, result)}`);
    }
  } else {
    lines.push("\n✅ 所有技能依赖检查通过");
  }

  return lines.join("\n");
}

// ============================================================================
// 增强依赖解析系统集成
// ============================================================================

export {
  buildEnhancedDependencyGraph,
  detectCycles as detectCyclesEnhanced,
  resolveDependencies,
  resolveAndInstall,
  findConflicts as findConflictsEnhanced,
  suggestResolution,
  formatDependencyGraph,
  generateDependencyDot,
  validateDependencyVersion,
} from "./dependency-enhanced.js";

export type {
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  ConflictDetail,
  ResolutionSuggestion,
  ResolvedDependency,
  VersionValidationResult,
  DependencyNodeStatus,
  DependencyEdgeType,
} from "./dependency-enhanced.js";
