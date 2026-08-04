/**
 * 技能依赖配置解析 — leaf 模块
 *
 * 从 dependency.ts 提取为独立模块，打破 dependency.ts ↔ dependency-enhanced.ts 循环依赖。
 */
import type {
  SkillEntry,
  SkillDependency,
  SkillConflict,
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
