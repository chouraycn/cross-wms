/**
 * 技能依赖检查器
 *
 * 封装 lifecycle/dependency.ts 的 checkDependencies / detectCycles / formatDependencyResult，
 * 提供统一的安装前/加载后检查入口：
 *   - preInstallCheck: 安装新技能前检查
 *   - postLoadCheck: 加载所有技能后批量检查
 *   - 输出可读报告
 *
 * 设计目标：让 lifecycle/dependency.ts 不再是孤岛。
 */

import { logger } from '../../logger.js';
import type { SkillEntry, DependencyCheckResult } from './types.js';
import {
  checkDependencies,
  checkAllDependencies,
  detectCycles,
  formatDependencyResult,
  sortByDependencies,
} from './lifecycle/dependency.js';

/** 检查策略 */
export interface CheckOptions {
  /** 是否阻止安装（默认 true） */
  blockOnFailure?: boolean;
  /** 是否允许覆盖已存在技能（默认 false） */
  allowOverride?: boolean;
  /** 是否检查循环依赖（默认 true） */
  checkCycles?: boolean;
  /** 是否检查冲突技能（默认 true） */
  checkConflicts?: boolean;
}

/** 单次检查结果 */
export interface SkillCheckResult {
  /** 被检查的技能名 */
  skillName: string;
  /** 检查结果 */
  result: DependencyCheckResult;
  /** 可读报告 */
  report: string;
  /** 是否允许继续 */
  allowed: boolean;
}

/** 批量检查结果 */
export interface BatchCheckResult {
  /** 总数 */
  total: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 按技能名索引结果 */
  results: Map<string, SkillCheckResult>;
  /** 全局循环依赖 */
  globalCycles: string[][];
  /** 推荐的加载顺序（拓扑排序） */
  loadOrder: SkillEntry[];
  /** 汇总报告 */
  report: string;
}

/**
 * 安装前检查
 *
 * 在新技能安装到 workspace 之前调用，检查它是否会引入缺失依赖、冲突、循环。
 *
 * @param newEntry 待安装的技能
 * @param existingEntries 已存在的技能列表
 * @param options 检查选项
 */
export function preInstallCheck(
  newEntry: SkillEntry,
  existingEntries: SkillEntry[],
  options: CheckOptions = {},
): SkillCheckResult {
  const { blockOnFailure = true, allowOverride = false, checkCycles = true, checkConflicts = true } = options;

  // 1. 覆盖检查
  const existing = existingEntries.find((e) => e.skill.name === newEntry.skill.name);
  if (existing && !allowOverride) {
    const result: DependencyCheckResult = {
      valid: false,
      missing: [],
      conflicts: [],
      optionalMissing: [],
      cycles: [],
    };
    const report = `❌ 技能 "${newEntry.skill.name}" 已存在，且未启用 allowOverride`;
    return {
      skillName: newEntry.skill.name,
      result,
      report,
      allowed: false,
    };
  }

  // 2. 依赖与冲突检查（覆盖时排除旧条目）
  const filtered = existingEntries.filter((e) => e.skill.name !== newEntry.skill.name);
  const combined = [...filtered, newEntry];
  const result = checkDependencies(newEntry, filtered);

  // 3. 循环检查
  if (!checkCycles) {
    result.cycles = [];
  }
  if (!checkConflicts) {
    result.conflicts = [];
  }

  // 4. 重新计算 valid（清除冲突/循环后可能改变结论）
  result.valid =
    result.missing.length === 0 &&
    result.conflicts.length === 0 &&
    result.cycles.length === 0;

  // 5. 决定是否允许
  const allowed = !blockOnFailure || result.valid;
  const report = formatDependencyResult(newEntry.skill.name, result);

  if (!allowed) {
    logger.warn(`[SkillDependencyChecker] Pre-install check FAILED for "${newEntry.skill.name}":\n${report}`);
  } else if (!result.valid) {
    logger.warn(`[SkillDependencyChecker] Pre-install check passed (non-blocking) for "${newEntry.skill.name}":\n${report}`);
  } else {
    logger.debug(`[SkillDependencyChecker] Pre-install check passed for "${newEntry.skill.name}"`);
  }

  return { skillName: newEntry.skill.name, result, report, allowed };
}

/**
 * 批量加载后检查
 *
 * 在所有技能加载完成后调用，检查整体依赖关系是否健康。
 *
 * @param entries 所有已加载的技能
 */
export function postLoadCheck(entries: SkillEntry[]): BatchCheckResult {
  const allResults = checkAllDependencies(entries);
  const globalCycles = detectCycles(entries);
  const loadOrder = sortByDependencies(entries);

  const results = new Map<string, SkillCheckResult>();
  let passed = 0;
  let failed = 0;

  for (const [name, result] of allResults) {
    const report = formatDependencyResult(name, result);
    if (result.valid) {
      passed++;
    } else {
      failed++;
    }
    results.set(name, {
      skillName: name,
      result,
      report,
      allowed: result.valid,
    });
  }

  const report = generateBatchReport(entries.length, passed, failed, globalCycles, results);

  logger.info(
    `[SkillDependencyChecker] Post-load check: ${passed}/${entries.length} passed, ${failed} failed, ${globalCycles.length} cycles`,
  );

  return {
    total: entries.length,
    passed,
    failed,
    results,
    globalCycles,
    loadOrder,
    report,
  };
}

/** 生成批量报告 */
function generateBatchReport(
  total: number,
  passed: number,
  failed: number,
  cycles: string[][],
  results: Map<string, SkillCheckResult>,
): string {
  const lines: string[] = [];
  lines.push('=== 技能依赖批量检查报告 ===\n');
  lines.push(`总数: ${total}`);
  lines.push(`通过: ${passed}`);
  lines.push(`失败: ${failed}`);
  lines.push(`循环依赖: ${cycles.length}\n`);

  if (cycles.length > 0) {
    lines.push('🔄 全局循环依赖:');
    for (const cycle of cycles) {
      lines.push(`  - ${cycle.join(' → ')} → ${cycle[0]}`);
    }
    lines.push('');
  }

  const failedResults = [...results.values()].filter((r) => !r.allowed);
  if (failedResults.length > 0) {
    lines.push(`❌ 失败的技能 (${failedResults.length}):`);
    for (const r of failedResults) {
      lines.push(`\n${r.report}`);
    }
  }

  return lines.join('\n');
}

/**
 * 验证技能可加载
 *
 * 简化的快速检查：仅检查该技能是否在加载顺序中（即不形成循环）。
 */
export function canLoadSkill(entry: SkillEntry, allEntries: SkillEntry[]): { canLoad: boolean; reason?: string } {
  const cycles = detectCycles([entry, ...allEntries]);
  if (cycles.length > 0) {
    return {
      canLoad: false,
      reason: `Cyclic dependency detected: ${cycles[0].join(' → ')} → ${cycles[0][0]}`,
    };
  }
  return { canLoad: true };
}

/** 单例便捷 API */
export const skillDependencyChecker = {
  preInstallCheck,
  postLoadCheck,
  canLoadSkill,
};
