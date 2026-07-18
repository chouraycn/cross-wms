/**
 * 健康检查运行器 — 参考 openclaw/src/flows/health-check-runner-types.ts
 *
 * 提供健康检查的运行编排，支持 lint 模式（只读检测）和 repair 模式（检测+修复+验证）。
 * 封装错误处理、结果聚合、范围过滤等通用逻辑。
 */

import type {
  HealthCheck,
  HealthCheckContext,
  HealthCheckRunContext,
  HealthCheckRunResult,
  HealthCheckScope,
  HealthFinding,
  HealthRepairResult,
  RegisteredHealthCheck,
} from './types.js';
import { HEALTH_FINDING_SEVERITY_RANK } from './types.js';
import { normalizeHealthCheck } from './health-check-adapter.js';
import { logger } from '../../logger.js';

// ===================== 运行结果类型 =====================

/** 单次健康检查的详细运行结果。 */
export interface HealthCheckRunnerResult {
  readonly check: HealthCheck;
  readonly findings: readonly HealthFinding[];
  readonly status: 'ok' | 'findings' | 'error';
  readonly error?: string;
  readonly durationMs: number;
  readonly repairResult?: HealthRepairResult;
}

/** 批量运行健康检查的汇总结果。 */
export interface HealthCheckRunnerSummary {
  readonly results: readonly HealthCheckRunnerResult[];
  readonly allFindings: readonly HealthFinding[];
  readonly totalChecks: number;
  readonly okChecks: number;
  readonly findingChecks: number;
  readonly errorChecks: number;
  readonly totalDurationMs: number;
}

// ===================== 辅助函数 =====================

/** 从 findings 中提取唯一且已定义的字符串值。 */
function uniqueDefined(values: readonly (string | undefined)[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value !== undefined && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/** 根据 findings 创建验证范围（仅重新检查曾命中的路径）。 */
export function createValidationScope(
  findings: readonly HealthFinding[],
): HealthCheckScope {
  return {
    findings,
    paths: uniqueDefined(findings.map((finding) => finding.path)),
    ocPaths: uniqueDefined(findings.map((finding) => finding.ocPath)),
  };
}

/** 判断修复结果是否包含实际输出（配置变更、变更描述、diff 或 effect）。 */
export function hasHealthRepairOutput(
  result: HealthRepairResult | HealthCheckRunResult,
): boolean {
  return (
    result.config !== undefined ||
    (result.changes?.length ?? 0) > 0 ||
    (result.diffs?.length ?? 0) > 0 ||
    (result.effects?.length ?? 0) > 0
  );
}

/** 按严重级别稳定排序 findings。 */
export function sortFindingsBySeverity(
  findings: readonly HealthFinding[],
): HealthFinding[] {
  return [...findings].sort((a, b) => {
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
  });
}

// ===================== 运行器 =====================

/**
 * 运行单个健康检查（lint 模式，只读检测）。
 *
 * 捕获异常并包装为 error 状态，不会中断调用方。
 */
export async function runSingleCheck(
  check: HealthCheck,
  ctx: HealthCheckContext,
  scope?: HealthCheckScope,
): Promise<HealthCheckRunnerResult> {
  const start = Date.now();
  try {
    logger.debug(`[health-check-runner] running ${check.id}`);
    const findings = await check.detect(ctx, scope);
    const durationMs = Date.now() - start;
    const status = findings.length > 0 ? 'findings' : 'ok';
    logger.debug(`[health-check-runner] ${check.id} ${status} (${findings.length} findings, ${durationMs}ms)`);
    return {
      check,
      findings,
      status,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[health-check-runner] ${check.id} error: ${message}`);
    return {
      check,
      findings: [],
      status: 'error',
      error: message,
      durationMs,
    };
  }
}

/**
 * 批量运行健康检查（lint 模式）。
 *
 * 顺序执行所有检查，单个失败不影响其余；返回每个检查的详细结果与汇总。
 */
export async function runChecks(
  checks: readonly HealthCheck[],
  ctx: HealthCheckContext,
  scope?: HealthCheckScope,
): Promise<HealthCheckRunnerSummary> {
  const start = Date.now();
  const results: HealthCheckRunnerResult[] = [];

  for (const check of checks) {
    const result = await runSingleCheck(check, ctx, scope);
    results.push(result);
  }

  const allFindings = sortFindingsBySeverity(results.flatMap((r) => r.findings));
  const totalDurationMs = Date.now() - start;
  const okChecks = results.filter((r) => r.status === 'ok').length;
  const findingChecks = results.filter((r) => r.status === 'findings').length;
  const errorChecks = results.filter((r) => r.status === 'error').length;

  logger.debug(
    `[health-check-runner] summary: ${checks.length} checks, ` +
      `${okChecks} ok, ${findingChecks} with findings, ${errorChecks} errors, ` +
      `${totalDurationMs}ms`,
  );

  return {
    results,
    allFindings,
    totalChecks: checks.length,
    okChecks,
    findingChecks,
    errorChecks,
    totalDurationMs,
  };
}

/**
 * 运行单个健康检查（repair 模式：检测 → 修复 → 验证）。
 *
 * 仅对有 findings 且支持 repair 的检查执行修复；修复后重新 detect 验证效果。
 */
export async function runSingleCheckWithRepair(
  check: HealthCheck,
  ctx: HealthCheckRunContext,
  scope?: HealthCheckScope,
): Promise<HealthCheckRunnerResult> {
  const normalized = normalizeHealthCheck(check) as RegisteredHealthCheck;
  const start = Date.now();

  let findings: readonly HealthFinding[];
  try {
    logger.debug(`[health-check-runner] detect ${check.id}`);
    findings = await normalized.detect(ctx, scope);
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return {
      check,
      findings: [],
      status: 'error',
      error: `detect failed: ${message}`,
      durationMs,
    };
  }

  if (findings.length === 0 || !check.repair) {
    return {
      check,
      findings,
      status: findings.length > 0 ? 'findings' : 'ok',
      durationMs: Date.now() - start,
    };
  }

  let repairResult: HealthRepairResult;
  try {
    logger.debug(`[health-check-runner] repair ${check.id} (${findings.length} findings)`);
    repairResult = await check.repair(
      {
        ...ctx,
        mode: 'fix',
        dryRun: !ctx.repair,
        diff: ctx.diff === true,
      },
      findings,
    );
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return {
      check,
      findings,
      status: 'error',
      error: `repair failed: ${message}`,
      durationMs,
    };
  }

  if (!ctx.repair) {
    return {
      check,
      findings,
      status: 'findings',
      repairResult,
      durationMs: Date.now() - start,
    };
  }

  const validationScope = createValidationScope(findings);
  try {
    const validationFindings = await normalized.detect(
      { ...ctx, cfg: repairResult.config ?? ctx.cfg },
      validationScope,
    );
    logger.debug(
      `[health-check-runner] ${check.id} validation: ${validationFindings.length} remaining findings`,
    );
    return {
      check,
      findings: validationFindings,
      status: validationFindings.length > 0 ? 'findings' : 'ok',
      repairResult,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return {
      check,
      findings,
      status: 'error',
      error: `validation failed: ${message}`,
      repairResult,
      durationMs,
    };
  }
}

/**
 * 按 id 过滤检查列表（支持 --only / --skip 语义）。
 *
 * 返回过滤后的列表与未知的 only id 列表。
 */
export function filterChecksByIds(
  checks: readonly HealthCheck[],
  opts: {
    onlyIds?: ReadonlySet<string> | readonly string[];
    skipIds?: ReadonlySet<string> | readonly string[];
  },
): { selected: HealthCheck[]; unknownOnlyIds: string[] } {
  const only = opts.onlyIds instanceof Set ? opts.onlyIds : new Set(opts.onlyIds ?? []);
  const skip = opts.skipIds instanceof Set ? opts.skipIds : new Set(opts.skipIds ?? []);
  const allIds = new Set(checks.map((c) => c.id));

  const selected = checks.filter((c) => {
    if (only.size > 0 && !only.has(c.id)) {
      return false;
    }
    if (skip.has(c.id)) {
      return false;
    }
    return true;
  });

  const unknownOnlyIds: string[] = [];
  for (const id of only) {
    if (!allIds.has(id)) {
      unknownOnlyIds.push(id);
    }
  }

  return { selected, unknownOnlyIds };
}
