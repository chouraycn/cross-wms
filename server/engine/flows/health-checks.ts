/**
 * 健康检查核心逻辑 — 参考 openclaw/src/flows/health-checks.ts
 *
 * 提供 runHealthChecks（运行检查列表并汇总结果）与 formatHealthFindings
 * （将结果格式化为可读输出），以及按严重级别排序的辅助函数。
 * 不依赖 @openclaw/* 包，使用本目录 types.ts 中的类型。
 */

import type {
  HealthCheck,
  HealthCheckContext,
  HealthCheckScope,
  HealthFinding,
  HealthFindingSeverity,
  HealthRepairContext,
  HealthRepairResult,
} from './types.js';
import { HEALTH_FINDING_SEVERITY_RANK } from './types.js';

// ===================== 检查契约 =====================

/**
 * 分离式 detect/repair 健康检查契约，由核心或插件注册。
 *
 * 与 types.ts 中可能扩展的 HealthCheck 接口保持兼容；这里显式声明以避免
 * 循环依赖，并集中承载 runHealthChecks 需要的字段。
 */
export interface HealthCheckDefinition {
  readonly id: string;
  readonly kind: 'core' | 'plugin';
  readonly description: string;
  readonly source?: string;
  detect(ctx: HealthCheckContext, scope?: HealthCheckScope): Promise<readonly HealthFinding[]>;
  repair?(
    ctx: HealthRepairContext,
    findings: readonly HealthFinding[],
  ): Promise<HealthRepairResult>;
}

/** 单次健康检查的运行结果。 */
export interface HealthCheckResult {
  readonly check: HealthCheckDefinition;
  readonly findings: readonly HealthFinding[];
  readonly error?: string;
}

// ===================== 排序辅助 =====================

/**
 * 按严重级别（降序）排序 findings，相同级别保持稳定顺序。
 */
export function sortHealthFindingsBySeverity(
  findings: readonly HealthFinding[],
): HealthFinding[] {
  return [...findings].sort((left, right) => {
    const rankDiff =
      HEALTH_FINDING_SEVERITY_RANK[right.severity] - HEALTH_FINDING_SEVERITY_RANK[left.severity];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    // 同级别按 checkId 稳定排序
    return left.checkId.localeCompare(right.checkId);
  });
}

/**
 * 按严重级别（降序）排序检查结果，便于在 doctor 输出中优先展示高危项。
 */
export function sortHealthCheckResultsBySeverity(
  results: readonly HealthCheckResult[],
): HealthCheckResult[] {
  /** 计算单条结果中最高严重级别的权重。 */
  const maxSeverityRank = (findings: readonly HealthFinding[]): number =>
    findings.reduce(
      (max, finding) => Math.max(max, HEALTH_FINDING_SEVERITY_RANK[finding.severity]),
      0,
    );

  return [...results].sort((left, right) => {
    const rankDiff = maxSeverityRank(right.findings) - maxSeverityRank(left.findings);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.check.id.localeCompare(right.check.id);
  });
}

// ===================== 运行入口 =====================

/**
 * 运行健康检查列表，返回每个检查的结果（含 findings 与可能的错误信息）。
 *
 * 单个检查抛错不会中断其余检查；错误会被捕获并记录到 result.error。
 */
export async function runHealthChecks(
  checks: readonly HealthCheckDefinition[],
  ctx: HealthCheckContext,
  scope?: HealthCheckScope,
): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  for (const check of checks) {
    try {
      const findings = await check.detect(ctx, scope);
      results.push({ check, findings });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ check, findings: [], error: message });
    }
  }
  return results;
}

// ===================== 格式化 =====================

/** 严重级别对应的人类可读标签。 */
const SEVERITY_LABEL: Record<HealthFindingSeverity, string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
};

/**
 * 将检查结果格式化为可读的多行文本，用于 CLI/TUI 输出。
 *
 * - 先输出每条 finding 的级别、来源、消息与位置；
 * - 结尾汇总各级别计数；
 * - 检查自身报错时以 WARN 行提示。
 */
export function formatHealthFindings(results: readonly HealthCheckResult[]): string {
  const sorted = sortHealthCheckResultsBySeverity(results);
  const lines: string[] = [];
  let infoCount = 0;
  let warnCount = 0;
  let errorCount = 0;

  for (const result of sorted) {
    if (result.error) {
      lines.push(`[WARN] ${result.check.id}: 检查运行失败 — ${result.error}`);
      warnCount += 1;
      continue;
    }
    for (const finding of sortHealthFindingsBySeverity(result.findings)) {
      const label = SEVERITY_LABEL[finding.severity];
      const source = finding.source ?? result.check.id;
      const location = formatFindingLocation(finding);
      const tail = location ? `  ${location}` : '';
      lines.push(`[${label}] ${source}: ${finding.message}${tail}`);
      if (finding.fixHint) {
        lines.push(`        修复建议: ${finding.fixHint}`);
      }
      if (finding.severity === 'error') {
        errorCount += 1;
      } else if (finding.severity === 'warning') {
        warnCount += 1;
      } else {
        infoCount += 1;
      }
    }
  }

  if (lines.length === 0) {
    return '健康检查通过：未发现任何问题。';
  }

  const summary = `汇总: ${errorCount} 错误, ${warnCount} 警告, ${infoCount} 提示`;
  return [...lines, '', summary].join('\n');
}

/** 拼接 finding 的文件位置信息（path:line:column）。 */
function formatFindingLocation(finding: HealthFinding): string {
  if (!finding.path) {
    return '';
  }
  const position = [finding.line, finding.column].filter((v) => v !== undefined).join(':');
  return position ? `${finding.path}:${position}` : finding.path;
}

// ===================== 兼容导出 =====================

/**
 * 重新导出 HealthCheck/HealthRepairResult 类型，便于外部统一从本模块引用。
 * 这些类型源自 types.ts，这里仅做透传以匹配参考模块的对外形状。
 */
export type { HealthCheck, HealthRepairResult } from './types.js';
