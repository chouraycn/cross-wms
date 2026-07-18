/**
 * Doctor 修复流程 — 参考 openclaw/src/flows/doctor-repair-flow.ts
 *
 * 构建并运行 doctor 修复操作：检测问题 → 执行修复 → 验证修复效果。
 * 支持 dry-run 预览修复，支持配置在检查间传递。
 */

import type {
  DoctorRepairRunOptions,
  DoctorRepairRunResult,
  FlowConfig,
  HealthCheckInput,
  HealthCheckRunResult,
  HealthFinding,
  HealthRepairContext,
  HealthRepairDiff,
  HealthRepairEffect,
  HealthRepairResult,
  RegisteredHealthCheck,
} from './types.js';
import { normalizeHealthCheck } from './health-check-adapter.js';
import { listHealthChecks } from './health-check-registry.js';
import { hasHealthRepairOutput, createValidationScope } from './health-check-runner.js';
import { logger } from '../../logger.js';

/**
 * 运行 doctor 健康检查修复流程。
 *
 * 流程：
 * 1. 顺序执行每个检查的 detect；
 * 2. 有 findings 且支持 repair 的检查执行修复；
 * 3. 修复后重新 detect 验证（仅验证曾命中的 scope）；
 * 4. 配置变更会传递给后续检查。
 */
export async function runDoctorHealthRepairs(
  ctx: HealthRepairContext,
  opts: DoctorRepairRunOptions = {},
): Promise<DoctorRepairRunResult> {
  const checks: readonly RegisteredHealthCheck[] = (opts.checks ?? listHealthChecks()).map(
    (check) => normalizeHealthCheck(check as HealthCheckInput),
  );

  const findings: HealthFinding[] = [];
  const remainingFindings: HealthFinding[] = [];
  const changes: string[] = [];
  const warnings: string[] = [];
  const diffs: HealthRepairDiff[] = [];
  const effects: HealthRepairEffect[] = [];
  let cfg = ctx.cfg;
  let checksRepaired = 0;
  let checksValidated = 0;

  logger.debug(`[doctor-repair] starting with ${checks.length} checks`);

  for (const check of checks) {
    const detectCtx: HealthRepairContext = { ...ctx, cfg };
    const result = await runSingleRepair(check, detectCtx, opts);
    cfg = result.config;
    findings.push(...result.findings);
    remainingFindings.push(...result.remainingFindings);
    changes.push(...result.changes);
    warnings.push(...result.warnings);
    diffs.push(...result.diffs);
    effects.push(...result.effects);
    checksRepaired += result.checksRepaired;
    checksValidated += result.checksValidated;
  }

  const summary: DoctorRepairRunResult = {
    config: cfg,
    findings,
    remainingFindings,
    changes,
    warnings,
    diffs,
    effects,
    checksRun: checks.length,
    checksRepaired,
    checksValidated,
  };

  logger.debug(
    `[doctor-repair] done: ${summary.checksRun} run, ${summary.checksRepaired} repaired, ` +
      `${summary.checksValidated} validated, ${summary.changes.length} changes`,
  );

  return summary;
}

async function runSingleRepair(
  check: RegisteredHealthCheck,
  ctx: HealthRepairContext,
  opts: DoctorRepairRunOptions,
): Promise<DoctorRepairRunResult> {
  if (check.sourceContract === 'split') {
    return runSplitHealthCheckRepair(check, ctx, opts);
  }
  return runRunnableHealthCheckRepair(check, ctx, opts);
}

async function runSplitHealthCheckRepair(
  check: RegisteredHealthCheck,
  ctx: HealthRepairContext,
  opts: DoctorRepairRunOptions,
): Promise<DoctorRepairRunResult> {
  const findings: HealthFinding[] = [];
  const remainingFindings: HealthFinding[] = [];
  const changes: string[] = [];
  const warnings: string[] = [];
  const diffs: HealthRepairDiff[] = [];
  const effects: HealthRepairEffect[] = [];
  let cfg = ctx.cfg;
  let checksRepaired = 0;
  let checksValidated = 0;

  let checkFindings: readonly HealthFinding[];
  try {
    logger.debug(`[doctor-repair] detect ${check.id}`);
    checkFindings = await check.detect(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${check.id} detect 失败: ${message}`);
    return buildRepairResult(
      cfg,
      findings,
      remainingFindings,
      changes,
      warnings,
      diffs,
      effects,
    );
  }
  findings.push(...checkFindings);

  if (checkFindings.length === 0 || check.repair === undefined) {
    return buildRepairResult(
      cfg,
      findings,
      remainingFindings,
      changes,
      warnings,
      diffs,
      effects,
    );
  }

  try {
    logger.debug(`[doctor-repair] repair ${check.id} (${checkFindings.length} findings)`);
    const result = await check.repair(
      { ...ctx, dryRun: opts.dryRun === true, diff: opts.diff === true },
      checkFindings,
    );
    warnings.push(...(result.warnings ?? []));
    diffs.push(...(result.diffs ?? []));
    effects.push(...(result.effects ?? []));

    const status = result.status ?? 'repaired';
    if (status !== 'repaired') {
      warnings.push(
        `${check.id} 修复 ${status}${result.reason ? `: ${result.reason}` : ''}`,
      );
      return buildRepairResult(
        cfg,
        findings,
        remainingFindings,
        changes,
        warnings,
        diffs,
        effects,
      );
    }

    if (result.config !== undefined && opts.dryRun !== true) {
      cfg = result.config;
    }
    changes.push(...result.changes);
    checksRepaired++;

    if (opts.dryRun === true) {
      return buildRepairResult(
        cfg,
        findings,
        remainingFindings,
        changes,
        warnings,
        diffs,
        effects,
        { checksRepaired, checksValidated },
      );
    }

    try {
      const validationFindings = await check.detect(
        { ...ctx, cfg },
        createValidationScope(findings),
      );
      remainingFindings.push(...validationFindings);
      checksValidated++;
      if (validationFindings.length > 0) {
        warnings.push(`${check.id} 修复后仍存在 ${validationFindings.length} 条问题`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`${check.id} 验证失败: ${message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${check.id} 修复失败: ${message}`);
  }

  return buildRepairResult(
    cfg,
    findings,
    remainingFindings,
    changes,
    warnings,
    diffs,
    effects,
    { checksRepaired, checksValidated },
  );
}

async function runRunnableHealthCheckRepair(
  check: RegisteredHealthCheck,
  ctx: HealthRepairContext,
  opts: DoctorRepairRunOptions,
): Promise<DoctorRepairRunResult> {
  const findings: HealthFinding[] = [];
  const remainingFindings: HealthFinding[] = [];
  const changes: string[] = [];
  const warnings: string[] = [];
  const diffs: HealthRepairDiff[] = [];
  const effects: HealthRepairEffect[] = [];
  let cfg = ctx.cfg;
  let checksRepaired = 0;
  let checksValidated = 0;

  let result: HealthCheckRunResult;
  try {
    logger.debug(`[doctor-repair] run ${check.id}`);
    result = await check.run(
      {
        ...ctx,
        repair: opts.dryRun !== true,
        diff: opts.diff === true,
        previewRepair: opts.dryRun === true,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${check.id} run 失败: ${message}`);
    return buildRepairResult(
      ctx.cfg,
      findings,
      remainingFindings,
      changes,
      warnings,
      diffs,
      effects,
    );
  }

  findings.push(...(result.findings ?? []));
  warnings.push(...(result.warnings ?? []));
  diffs.push(...(result.diffs ?? []));
  effects.push(...(result.effects ?? []));

  const status = result.status ?? 'repaired';
  const hasOutput = hasHealthRepairOutput(result as HealthRepairResult);

  if (status === 'repairable') {
    changes.push(...(result.changes ?? []));
    return buildRepairResult(
      cfg,
      findings,
      remainingFindings,
      changes,
      warnings,
      diffs,
      effects,
      { checksRepaired: hasOutput ? 1 : 0, checksValidated },
    );
  }

  if (status !== 'repaired') {
    warnings.push(`${check.id} 修复 ${status}${result.reason ? `: ${result.reason}` : ''}`);
    return buildRepairResult(
      ctx.cfg,
      findings,
      remainingFindings,
      changes,
      warnings,
      diffs,
      effects,
    );
  }

  if (result.config !== undefined && opts.dryRun !== true) {
    cfg = result.config;
  }
  changes.push(...(result.changes ?? []));

  if (hasOutput) {
    checksRepaired++;
  }

  if (opts.dryRun === true || !hasOutput) {
    return buildRepairResult(
      cfg,
      findings,
      remainingFindings,
      changes,
      warnings,
      diffs,
      effects,
      { checksRepaired, checksValidated },
    );
  }

  try {
    const validation = await check.run(
      {
        ...ctx,
        mode: 'lint',
        cfg,
        repair: false,
        diff: opts.diff === true,
        previewRepair: false,
      },
      createValidationScope(findings),
    );
    remainingFindings.push(...(validation.findings ?? []));
    checksValidated++;
    if (validation.findings !== undefined && validation.findings.length > 0) {
      warnings.push(`${check.id} 修复后仍存在 ${validation.findings.length} 条问题`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${check.id} 验证失败: ${message}`);
  }

  return buildRepairResult(
    cfg,
    findings,
    remainingFindings,
    changes,
    warnings,
    diffs,
    effects,
    { checksRepaired, checksValidated },
  );
}

function buildRepairResult(
  config: FlowConfig,
  findings: readonly HealthFinding[],
  remainingFindings: readonly HealthFinding[],
  changes: readonly string[],
  warnings: readonly string[],
  diffs: readonly HealthRepairDiff[],
  effects: readonly HealthRepairEffect[],
  counts: { checksRepaired?: number; checksValidated?: number } = {},
): DoctorRepairRunResult {
  return {
    config,
    findings,
    remainingFindings,
    changes,
    warnings,
    diffs,
    effects,
    checksRun: 1,
    checksRepaired: counts.checksRepaired ?? 0,
    checksValidated: counts.checksValidated ?? 0,
  };
}

/**
 * 格式化修复结果为可读文本。
 */
export function formatRepairResult(result: DoctorRepairRunResult): string {
  const lines: string[] = [];

  lines.push(
    `修复摘要: ${result.checksRun} 个检查, ${result.checksRepaired} 个已修复, ` +
      `${result.checksValidated} 个已验证`,
  );

  if (result.changes.length > 0) {
    lines.push('');
    lines.push('变更列表:');
    for (const change of result.changes) {
      lines.push(`  - ${change}`);
    }
  }

  if (result.remainingFindings.length > 0) {
    lines.push('');
    lines.push(`修复后仍有 ${result.remainingFindings.length} 条未解决问题:`);
    for (const finding of result.remainingFindings) {
      lines.push(`  [${finding.severity.toUpperCase()}] ${finding.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('警告:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (result.effects.length > 0) {
    lines.push('');
    lines.push(`副作用: ${result.effects.length} 项`);
    for (const effect of result.effects) {
      const target = effect.target ? ` → ${effect.target}` : '';
      lines.push(`  - [${effect.kind}] ${effect.action}${target}`);
    }
  }

  return lines.join('\n');
}
