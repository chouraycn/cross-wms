// 移植自 openclaw/src/infra/exec-approvals-allowlist.ts（降级实现）
// exec 审批 allowlist 评估与持久化。
// 注意：核心类型与函数已在 ./exec-approvals.ts 中定义，此文件提供补充的 allowlist 工具。
import type { ExecAllowlistEntry } from "./exec-approvals.types.js";
import type { ExecAllowlistEvaluation, AllowAlwaysPattern } from "./exec-approvals.js";

/**
 * 解析 allowlist 条目的可复用 glob 模式。
 * 降级实现：直接返回 entry.pattern。
 */
export function resolveAllowlistEntryPattern(entry: ExecAllowlistEntry): string {
  return entry.pattern;
}

/**
 * 评估 allowlist 条目是否匹配给定命令。
 * 降级实现：返回不匹配。
 */
export function evaluateAllowlistEntryMatch(
  _entry: ExecAllowlistEntry,
  _command: string,
): boolean {
  return false;
}

/**
 * 收集 allowlist 中匹配的条目。
 * 降级实现：返回空数组。
 */
export function collectMatchingAllowlistEntries(
  _entries: readonly ExecAllowlistEntry[],
  _command: string,
): ExecAllowlistEntry[] {
  return [];
}

/**
 * 构建 allowlist 评估结果。
 * 降级实现：返回不匹配的评估结果。
 */
export function buildExecAllowlistEvaluation(_params: {
  command: string;
  entries: readonly ExecAllowlistEntry[];
}): ExecAllowlistEvaluation {
  return {
    matched: false,
    matchedEntries: [],
    pattern: null,
  } as unknown as ExecAllowlistEvaluation;
}

/**
 * 解析 allow-always 模式覆盖范围。
 * 降级实现：返回空。
 */
export function resolveAllowAlwaysPatternCoverage(_params: {
  patterns: readonly AllowAlwaysPattern[];
  command: string;
}): { covered: boolean; matchedPatterns: AllowAlwaysPattern[] } {
  return { covered: false, matchedPatterns: [] };
}

export type { ExecAllowlistEntry, ExecAllowlistEvaluation, AllowAlwaysPattern };
