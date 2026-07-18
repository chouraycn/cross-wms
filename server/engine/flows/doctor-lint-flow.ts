/**
 * Doctor Lint 流程 — 参考 openclaw/src/flows/doctor-lint-flow.ts
 *
 * 非变更式健康检查运行器，用于 `doctor --lint` 模式。
 * 运行选定的健康检查，收集 findings，按严重级别排序后返回。
 */

import type {
  DoctorLintRunOptions,
  DoctorLintRunResult,
  HealthCheck,
  HealthCheckContext,
  HealthFinding,
  HealthFindingSeverity,
} from './types.js';
import { HEALTH_FINDING_SEVERITY_RANK, healthFindingMeetsSeverity } from './types.js';
import { listHealthChecks } from './health-check-registry.js';
import { logger } from '../../logger.js';

/**
 * 运行 doctor lint 检查并返回排序后的 findings。
 *
 * - 支持 --only / --skip 过滤；
 * - 单个检查抛错不会中断其余检查，错误会以 error 级 finding 记录；
 * - findings 按严重级别降序、checkId、path 稳定排序。
 */
export async function runDoctorLintChecks(
  ctx: HealthCheckContext,
  opts: DoctorLintRunOptions = {},
): Promise<DoctorLintRunResult> {
  const all = opts.checks ?? listHealthChecks();
  const skip = opts.skipIds instanceof Set ? opts.skipIds : new Set(opts.skipIds ?? []);
  const only = opts.onlyIds instanceof Set ? opts.onlyIds : new Set(opts.onlyIds ?? []);
  const allIds = new Set(all.map((check) => check.id));

  const selected = all.filter((c) => {
    if (only.size > 0 && !only.has(c.id)) {
      return false;
    }
    if (skip.has(c.id)) {
      return false;
    }
    return true;
  });

  const findings: HealthFinding[] = [];

  for (const id of only) {
    if (!allIds.has(id)) {
      findings.push({
        checkId: 'core/doctor/lint-selection',
        severity: 'error',
        message: `--only 指定了不存在的健康检查 id: ${id}`,
        path: id,
      });
    }
  }

  for (const check of selected) {
    try {
      logger.debug(`[doctor-lint] running ${check.id}`);
      const out = await check.detect(ctx);
      for (const f of out) {
        findings.push(f);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[doctor-lint] ${check.id} threw: ${message}`);
      findings.push({
        checkId: check.id,
        severity: 'error',
        message: `健康检查执行异常: ${message}`,
      });
    }
  }

  findings.sort(compareFindings);

  const result = {
    findings,
    checksRun: selected.length,
    checksSkipped: all.length - selected.length,
  };

  logger.debug(
    `[doctor-lint] done: ${result.checksRun} run, ${result.checksSkipped} skipped, ${findings.length} findings`,
  );

  return result;
}

/**
 * 稳定排序：严重级别降序 → checkId 升序 → path 升序。
 */
function compareFindings(a: HealthFinding, b: HealthFinding): number {
  const sevDelta =
    HEALTH_FINDING_SEVERITY_RANK[b.severity] - HEALTH_FINDING_SEVERITY_RANK[a.severity];
  if (sevDelta !== 0) {
    return sevDelta;
  }
  const idDelta = a.checkId.localeCompare(b.checkId);
  if (idDelta !== 0) {
    return idDelta;
  }
  return (a.path ?? '').localeCompare(b.path ?? '');
}

/**
 * 根据 findings 与最低严重级别阈值计算进程退出码。
 *
 * 存在至少一条达到阈值的 finding 时返回 1，否则返回 0。
 */
export function exitCodeFromFindings(
  findings: readonly HealthFinding[],
  severityMin: HealthFindingSeverity = 'warning',
): 0 | 1 {
  return findings.some((f) => healthFindingMeetsSeverity(f, severityMin)) ? 1 : 0;
}

/**
 * 按严重级别统计 findings 数量。
 */
export function countFindingsBySeverity(findings: readonly HealthFinding[]): {
  error: number;
  warning: number;
  info: number;
} {
  let error = 0;
  let warning = 0;
  let info = 0;
  for (const f of findings) {
    if (f.severity === 'error') {
      error++;
    } else if (f.severity === 'warning') {
      warning++;
    } else {
      info++;
    }
  }
  return { error, warning, info };
}

/**
 * 将 lint 结果格式化为可读的多行文本。
 */
export function formatLintResult(result: DoctorLintRunResult): string {
  const lines: string[] = [];
  const counts = countFindingsBySeverity(result.findings);

  if (result.findings.length === 0) {
    lines.push('✓ 所有健康检查通过，未发现任何问题。');
  } else {
    for (const finding of result.findings) {
      const label = finding.severity.toUpperCase();
      const source = finding.source ?? finding.checkId;
      const location = finding.path ? `  (${finding.path})` : '';
      lines.push(`[${label}] ${source}: ${finding.message}${location}`);
      if (finding.fixHint) {
        lines.push(`        修复建议: ${finding.fixHint}`);
      }
    }
  }

  lines.push('');
  lines.push(
    `检查: ${result.checksRun} 运行, ${result.checksSkipped} 跳过 | ` +
      `发现: ${counts.error} 错误, ${counts.warning} 警告, ${counts.info} 提示`,
  );

  return lines.join('\n');
}
