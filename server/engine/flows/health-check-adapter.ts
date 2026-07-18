/**
 * 健康检查适配器 — 参考 openclaw/src/flows/health-check-adapter.ts
 *
 * 将不同形态的健康检查（分离式 detect/repair 或自带 run 方法）
 * 统一适配为 RegisteredHealthCheck 契约，便于 lint/fix 运行器统一调度。
 */

import type {
  HealthCheckInput,
  HealthCheckRunResult,
  HealthRepairContext,
  RegisteredHealthCheck,
  HealthCheck,
} from './types.js';

/** 将分离式 detect/repair 健康检查包装为 runnable 契约。 */
export function defineSplitHealthCheck(check: HealthCheck): RegisteredHealthCheck {
  return {
    id: check.id,
    kind: check.kind,
    description: check.description,
    source: check.source,
    sourceContract: 'split',
    detect: (ctx, scope) => check.detect(ctx, scope),
    repair:
      check.repair === undefined
        ? undefined
        : (ctx, findings) => check.repair?.(ctx, findings) ?? Promise.resolve({ changes: [] }),
    async run(ctx, scope): Promise<HealthCheckRunResult> {
      const findings = await check.detect(ctx, scope);
      if (
        findings.length === 0 ||
        check.repair === undefined ||
        (!ctx.repair && ctx.previewRepair !== true)
      ) {
        return { findings };
      }
      const repairResult = await check.repair(
        {
          ...ctx,
          mode: 'fix',
          dryRun: !ctx.repair,
          diff: ctx.diff === true,
        } as HealthRepairContext,
        findings,
      );
      return {
        findings,
        config: ctx.repair ? repairResult.config : undefined,
        changes: repairResult.changes,
        warnings: repairResult.warnings,
        diffs: repairResult.diffs,
        effects: repairResult.effects,
        status: ctx.repair ? repairResult.status : (repairResult.status ?? 'repairable'),
        reason: repairResult.reason,
      };
    },
  };
}

/** 将任意支持的健康检查形态规范化为统一契约。 */
export function normalizeHealthCheck(check: HealthCheckInput): RegisteredHealthCheck {
  if (
    'detect' in check &&
    check.detect !== undefined &&
    'run' in check &&
    check.run !== undefined &&
    'sourceContract' in check
  ) {
    return check as RegisteredHealthCheck;
  }
  if ('detect' in check && check.detect !== undefined) {
    return defineSplitHealthCheck(check as HealthCheck);
  }
  if ('run' in check && check.run !== undefined) {
    const runnable = check as {
      id: string;
      kind: 'core' | 'plugin';
      description: string;
      source?: string;
      run(ctx: unknown, scope?: unknown): Promise<HealthCheckRunResult>;
    };
    return {
      id: runnable.id,
      kind: runnable.kind,
      description: runnable.description,
      source: runnable.source,
      sourceContract: 'run',
      async detect(ctx, scope) {
        const result = await runnable.run({ ...ctx, repair: false }, scope);
        return result.findings ?? [];
      },
      run: (ctx, scope) => runnable.run(ctx, scope),
    };
  }
  throw new Error(`健康检查 ${check.id} 必须定义 run() 或 detect()`);
}

/** 批量规范化健康检查列表。 */
export function normalizeHealthChecks(
  checks: readonly HealthCheckInput[],
): RegisteredHealthCheck[] {
  return checks.map(normalizeHealthCheck);
}
