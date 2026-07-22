import { logger } from "../../../logger.js";
import type {
  SkillEntry,
  SkillDependency,
  SkillConflict,
} from "../types.js";
import { parseDependencyConfig } from "./dependency.js";
import {
  parseVersion,
  compareVersions,
  type SkillVersion,
} from "../skill-version-registry.js";

export type DependencyNodeStatus =
  | "installed"
  | "missing"
  | "outdated"
  | "conflicted";

export interface DependencyNode {
  skillName: string;
  version: string;
  status: DependencyNodeStatus;
  entry?: SkillEntry;
}

export type DependencyEdgeType =
  | "requires"
  | "conflicts"
  | "recommends"
  | "suggests";

export interface DependencyEdge {
  from: string;
  to: string;
  type: DependencyEdgeType;
  versionConstraint?: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface ConflictDetail {
  skillA: string;
  versionA: string;
  skillB: string;
  versionB: string;
  reason: string;
}

export interface ResolutionSuggestion {
  conflict: ConflictDetail;
  suggestions: string[];
  preferredAction: string;
}

export interface ResolvedDependency {
  skillName: string;
  version: string;
  status: DependencyNodeStatus;
  dependencies: ResolvedDependency[];
  reason?: string;
}

export interface VersionValidationResult {
  valid: boolean;
  satisfies: boolean;
  installedVersion?: SkillVersion;
  requiredVersion?: string;
  message: string;
}

export function buildEnhancedDependencyGraph(
  skills: SkillEntry[]
): DependencyGraph {
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const skillMap = new Map<string, SkillEntry>();

  for (const entry of skills) {
    skillMap.set(entry.skill.name, entry);
  }

  for (const entry of skills) {
    const config = parseDependencyConfig(entry);
    const version = entry.skill.promptVersion || "1.0.0";

    nodes.push({
      skillName: entry.skill.name,
      version,
      status: "installed",
      entry,
    });

    for (const dep of config.dependsOn ?? []) {
      const type: DependencyEdgeType = dep.required !== false ? "requires" : "recommends";
      edges.push({
        from: entry.skill.name,
        to: dep.skill,
        type,
        versionConstraint: dep.version,
      });

      if (!skillMap.has(dep.skill)) {
        const existingNode = nodes.find((n) => n.skillName === dep.skill);
        if (!existingNode) {
          nodes.push({
            skillName: dep.skill,
            version: dep.version || "unknown",
            status: "missing",
          });
        }
      }
    }

    for (const conflict of config.conflictsWith ?? []) {
      edges.push({
        from: entry.skill.name,
        to: conflict.skill,
        type: "conflicts",
      });

      if (!skillMap.has(conflict.skill)) {
        const existingNode = nodes.find((n) => n.skillName === conflict.skill);
        if (!existingNode) {
          nodes.push({
            skillName: conflict.skill,
            version: "unknown",
            status: "missing",
          });
        }
      }
    }
  }

  const conflicts = findConflicts(skills);
  for (const conflict of conflicts) {
    const nodeA = nodes.find((n) => n.skillName === conflict.skillA);
    const nodeB = nodes.find((n) => n.skillName === conflict.skillB);
    if (nodeA && nodeB) {
      nodeA.status = "conflicted";
      nodeB.status = "conflicted";
    }
  }

  return { nodes, edges };
}

export function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type === "requires" || edge.type === "recommends") {
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, []);
      }
      adjacency.get(edge.from)!.push(edge.to);
    }
  }

  function dfs(node: string, path: string[]): void {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart);
        const normalized = [...cycle].sort().join(",");
        if (!cycles.some((c) => c.sort().join(",") === normalized)) {
          cycles.push(cycle);
        }
      }
      return;
    }

    if (visited.has(node)) return;

    visiting.add(node);
    path.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      dfs(neighbor, [...path]);
    }

    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.skillName)) {
      dfs(node.skillName, []);
    }
  }

  return cycles;
}

export function resolveDependencies(
  skillName: string,
  skills: SkillEntry[],
  version?: string
): ResolvedDependency | null {
  const skillMap = new Map<string, SkillEntry>();
  for (const entry of skills) {
    skillMap.set(entry.skill.name, entry);
  }

  const entry = skillMap.get(skillName);
  if (!entry) {
    logger.warn(`[Dependency] Skill not found: ${skillName}`);
    return null;
  }

  const visited = new Set<string>();

  function resolve(name: string, depth: number = 0): ResolvedDependency {
    if (visited.has(name)) {
      const existing = skillMap.get(name);
      return {
        skillName: name,
        version: existing?.skill.promptVersion || "1.0.0",
        status: existing ? "installed" : "missing",
        dependencies: [],
      };
    }

    visited.add(name);
    const currentEntry = skillMap.get(name);

    if (!currentEntry) {
      return {
        skillName: name,
        version: "unknown",
        status: "missing",
        dependencies: [],
      };
    }

    const config = parseDependencyConfig(currentEntry);
    const resolvedDeps: ResolvedDependency[] = [];

    for (const dep of config.dependsOn ?? []) {
      if (depth < 50) {
        const resolved = resolve(dep.skill, depth + 1);
        resolved.reason = dep.reason;
        resolvedDeps.push(resolved);
      }
    }

    return {
      skillName: name,
      version: currentEntry.skill.promptVersion || "1.0.0",
      status: "installed",
      dependencies: resolvedDeps,
    };
  }

  return resolve(skillName);
}

export async function resolveAndInstall(
  skillName: string,
  skills: SkillEntry[],
  version?: string
): Promise<{ success: boolean; resolved: ResolvedDependency | null; installed: string[] }> {
  const resolved = resolveDependencies(skillName, skills, version);
  if (!resolved) {
    return { success: false, resolved: null, installed: [] };
  }

  const missing: string[] = [];
  function collectMissing(dep: ResolvedDependency): void {
    if (dep.status === "missing") {
      missing.push(dep.skillName);
    }
    for (const child of dep.dependencies) {
      collectMissing(child);
    }
  }

  collectMissing(resolved);

  if (missing.length > 0) {
    logger.info(`[Dependency] Would install missing dependencies: ${missing.join(", ")}`);
  }

  return {
    success: missing.length === 0,
    resolved,
    installed: missing,
  };
}

export function findConflicts(skills: SkillEntry[]): ConflictDetail[] {
  const conflicts: ConflictDetail[] = [];
  const skillMap = new Map<string, SkillEntry>();

  for (const entry of skills) {
    skillMap.set(entry.skill.name, entry);
  }

  for (const entry of skills) {
    const config = parseDependencyConfig(entry);
    const versionA = entry.skill.promptVersion || "1.0.0";

    for (const conflict of config.conflictsWith ?? []) {
      const conflictEntry = skillMap.get(conflict.skill);
      if (conflictEntry) {
        const versionB = conflictEntry.skill.promptVersion || "1.0.0";
        conflicts.push({
          skillA: entry.skill.name,
          versionA,
          skillB: conflict.skill,
          versionB,
          reason: conflict.reason,
        });
      }
    }
  }

  const uniqueConflicts: ConflictDetail[] = [];
  const seen = new Set<string>();

  for (const c of conflicts) {
    const key = [c.skillA, c.skillB].sort().join("|");
    if (!seen.has(key)) {
      seen.add(key);
      uniqueConflicts.push(c);
    }
  }

  return uniqueConflicts;
}

export function suggestResolution(conflict: ConflictDetail): ResolutionSuggestion {
  const suggestions: string[] = [];

  if (conflict.reason.includes("deprecated")) {
    suggestions.push(`卸载已弃用的技能: ${conflict.skillA}`);
    suggestions.push(`升级 ${conflict.skillB} 到兼容版本`);
  } else if (conflict.reason.includes("duplicate") || conflict.reason.includes("重复")) {
    suggestions.push(`保留功能更完整的技能: ${conflict.skillA}`);
    suggestions.push(`卸载重复的技能: ${conflict.skillB}`);
    suggestions.push(`检查是否可以合并两个技能的功能`);
  } else if (conflict.reason.includes("incompatible") || conflict.reason.includes("不兼容")) {
    suggestions.push(`降级 ${conflict.skillA} 到与 ${conflict.skillB} 兼容的版本`);
    suggestions.push(`升级 ${conflict.skillB} 到与 ${conflict.skillA} 兼容的版本`);
    suggestions.push(`寻找替代技能`);
  } else {
    suggestions.push(`卸载 ${conflict.skillA} 以解决冲突`);
    suggestions.push(`卸载 ${conflict.skillB} 以解决冲突`);
    suggestions.push(`检查技能文档了解更多冲突详情`);
  }

  return {
    conflict,
    suggestions,
    preferredAction: suggestions[0],
  };
}

export function formatDependencyGraph(graph: DependencyGraph): string {
  const lines: string[] = [];
  lines.push("=== 增强依赖图 ===");

  lines.push("\n📦 节点:");
  for (const node of graph.nodes) {
    const statusIcon = {
      installed: "✅",
      missing: "❌",
      outdated: "⚠️",
      conflicted: "💥",
    }[node.status];
    lines.push(`  ${statusIcon} ${node.skillName}@${node.version} (${node.status})`);
  }

  lines.push("\n🔗 边:");
  const edgeTypeLabels: Record<DependencyEdgeType, string> = {
    requires: "→",
    conflicts: "⨯",
    recommends: "~>",
    suggests: "..>",
  };

  for (const edge of graph.edges) {
    const label = edgeTypeLabels[edge.type];
    const constraint = edge.versionConstraint ? `@${edge.versionConstraint}` : "";
    lines.push(`  ${edge.from} ${label} ${edge.to}${constraint} (${edge.type})`);
  }

  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    lines.push("\n🔄 循环依赖:");
    for (const cycle of cycles) {
      lines.push(`  - ${cycle.join(" → ")} → ${cycle[0]}`);
    }
  }

  return lines.join("\n");
}

export function generateDependencyDot(graph: DependencyGraph): string {
  const lines: string[] = [];
  lines.push("digraph DependencyGraph {");
  lines.push("  rankdir=BT;");
  lines.push("  node [shape=box, style=filled];");

  const statusColors: Record<DependencyNodeStatus, string> = {
    installed: "#90EE90",
    missing: "#FFB6C1",
    outdated: "#FFD700",
    conflicted: "#FF6347",
  };

  for (const node of graph.nodes) {
    const color = statusColors[node.status];
    lines.push(`  "${node.skillName}" [label="${node.skillName}\\n${node.version}", fillcolor="${color}"];`);
  }

  const edgeStyles: Record<DependencyEdgeType, string> = {
    requires: "color=blue, arrowhead=normal",
    conflicts: "color=red, arrowhead=diamond, style=dashed",
    recommends: "color=green, arrowhead=open",
    suggests: "color=gray, arrowhead=open, style=dotted",
  };

  for (const edge of graph.edges) {
    const style = edgeStyles[edge.type];
    const label = edge.versionConstraint ? ` [label="${edge.versionConstraint}"]` : "";
    lines.push(`  "${edge.from}" -> "${edge.to}" [${style}]${label};`);
  }

  lines.push("}");

  return lines.join("\n");
}

export function validateDependencyVersion(
  skillName: string,
  requiredVersion: string,
  installedVersion: string
): VersionValidationResult {
  const parsedInstalled = parseVersion(installedVersion);

  if (!parsedInstalled.success) {
    return {
      valid: false,
      satisfies: false,
      message: `无法解析已安装版本: ${installedVersion}`,
    };
  }

  let prefix = "";
  let versionStr = requiredVersion;
  if (requiredVersion.startsWith("^")) {
    prefix = "^";
    versionStr = requiredVersion.slice(1);
  } else if (requiredVersion.startsWith("~")) {
    prefix = "~";
    versionStr = requiredVersion.slice(1);
  }

  const parsedRequired = parseVersion(versionStr);

  if (!parsedRequired.success) {
    return {
      valid: true,
      satisfies: true,
      installedVersion: parsedInstalled.version,
      message: `版本约束格式无效，跳过检查: ${requiredVersion}`,
    };
  }

  const installed = parsedInstalled.version!;
  const required = parsedRequired.version!;

  if (prefix === "^") {
    if (installed.major !== required.major) {
      return {
        valid: false,
        satisfies: false,
        installedVersion: installed,
        requiredVersion: requiredVersion,
        message: `主版本不匹配: 要求 ^${versionStr}，安装 ${installedVersion}`,
      };
    }
    if (compareVersions(installed, required) >= 0) {
      return {
        valid: true,
        satisfies: true,
        installedVersion: installed,
        requiredVersion: requiredVersion,
        message: `版本满足 ^${versionStr} 约束`,
      };
    }
    return {
      valid: false,
      satisfies: false,
      installedVersion: installed,
      requiredVersion: requiredVersion,
      message: `版本低于要求: 要求 ^${versionStr}，安装 ${installedVersion}`,
    };
  }

  if (prefix === "~") {
    if (installed.major !== required.major || installed.minor !== required.minor) {
      return {
        valid: false,
        satisfies: false,
        installedVersion: installed,
        requiredVersion: requiredVersion,
        message: `主/次版本不匹配: 要求 ~${versionStr}，安装 ${installedVersion}`,
      };
    }
    if (compareVersions(installed, required) >= 0) {
      return {
        valid: true,
        satisfies: true,
        installedVersion: installed,
        requiredVersion: requiredVersion,
        message: `版本满足 ~${versionStr} 约束`,
      };
    }
    return {
      valid: false,
      satisfies: false,
      installedVersion: installed,
      requiredVersion: requiredVersion,
      message: `版本低于要求: 要求 ~${versionStr}，安装 ${installedVersion}`,
    };
  }

  const cmp = compareVersions(installed, required);
  if (cmp === 0) {
    return {
      valid: true,
      satisfies: true,
      installedVersion: installed,
      requiredVersion: requiredVersion,
      message: `版本完全匹配: ${installedVersion}`,
    };
  }

  if (cmp < 0) {
    return {
      valid: false,
      satisfies: false,
      installedVersion: installed,
      requiredVersion: requiredVersion,
      message: `版本过低: 要求 ${requiredVersion}，安装 ${installedVersion}`,
    };
  }

  return {
    valid: true,
    satisfies: true,
    installedVersion: installed,
    requiredVersion: requiredVersion,
    message: `版本高于要求: 要求 ${requiredVersion}，安装 ${installedVersion}`,
  };
}
