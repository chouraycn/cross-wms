// @ts-nocheck
// Doctor health contribution helpers collect health checks from plugin manifests.
// 移植自 openclaw/src/flows/doctor-health-contributions.ts（降级实现）。
// 降级说明：大量依赖模块（gateway、auth、cron、agents 等）未移植，
// 本文件保留核心类型和 API 结构，但实际运行时使用现有 cross-wms 中已有的健康检查。
import type { HealthCheckInput } from "./health-check-runner-types.js";
import { normalizeHealthCheck } from "./health-check-adapter.js";
import type { HealthCheck, HealthFinding, FlowContribution } from "./types.js";

type DoctorFlowMode = "local" | "remote";

export type DoctorHealthFlowContext = {
  runtime: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    cwd: string;
    env?: NodeJS.ProcessEnv;
    platform?: string;
  };
  options: {
    nonInteractive?: boolean;
    deep?: boolean;
    allowExec?: boolean;
    generateGatewayToken?: boolean;
    repair?: boolean;
    yes?: boolean;
    workspaceSuggestions?: boolean;
  };
  prompter: {
    shouldRepair: boolean;
    confirm: (params: { message: string; initialValue?: boolean }) => Promise<boolean>;
    confirmAutoFix: (params: { message: string; initialValue?: boolean }) => Promise<boolean>;
  };
  configResult: {
    cfg: Record<string, unknown>;
    path?: string;
    shouldWriteConfig?: boolean;
    sourceConfigValid?: boolean;
    sourceLastTouchedVersion?: string;
    skipPluginValidationOnWrite?: boolean;
    preservedLegacyRootKeys?: readonly string[];
  };
  cfg: Record<string, unknown>;
  cfgForPersistence: Record<string, unknown>;
  sourceConfigValid: boolean;
  configPath: string;
  env?: NodeJS.ProcessEnv;
  gatewayDetails?: {
    message?: string;
    remoteFallbackNote?: string;
  };
  healthOk?: boolean;
  gatewayHealthAuthenticated?: boolean;
  gatewayHealthSkipped?: boolean;
  gatewayStatus?: Record<string, unknown>;
  gatewayMemoryProbe?: {
    checked: boolean;
    ready: boolean;
    skipped: boolean;
  };
  postInstallDoctorResult?: Record<string, unknown>;
};

type DoctorHealthContribution = FlowContribution & {
  kind: "core";
  surface: "health";
  healthChecks: readonly HealthCheckInput[];
  healthCheckIds: readonly string[];
  run: (ctx: DoctorHealthFlowContext) => Promise<void>;
};

type DoctorContributionHealthCheck =
  | (Omit<HealthCheck, "id" | "kind" | "source"> & {
      readonly id?: string;
      readonly kind?: "core";
      readonly source?: string;
    })
  | (Omit<any, "id" | "kind" | "source"> & {
      readonly id?: string;
      readonly kind?: "core";
      readonly source?: string;
    });

function resolveDoctorMode(cfg: Record<string, unknown>): DoctorFlowMode {
  const gateway = cfg.gateway as Record<string, unknown> | undefined;
  return gateway?.mode === "remote" ? "remote" : "local";
}

function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "no";
}

function isUpdateDoctorRun(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
  const value = env.OPENCLAW_UPDATE_IN_PROGRESS;
  return value === "1" || value === "true";
}

const UPDATE_PARENT_SUPPORTS_DOCTOR_CONFIG_WRITE_ENV =
  "OPENCLAW_UPDATE_PARENT_SUPPORTS_CONFIG_WRITE";

function isLegacyParentWritableUpdateDoctorPass(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean {
  return isTruthyEnvValue(env.OPENCLAW_UPDATE_IN_PROGRESS) &&
    isTruthyEnvValue(env[UPDATE_PARENT_SUPPORTS_DOCTOR_CONFIG_WRITE_ENV]);
}

export function shouldSkipLegacyUpdateDoctorConfigWrite(params: {
  env: NodeJS.ProcessEnv;
}): boolean {
  if (!isTruthyEnvValue(params.env.OPENCLAW_UPDATE_IN_PROGRESS)) {
    return false;
  }
  if (isTruthyEnvValue(params.env[UPDATE_PARENT_SUPPORTS_DOCTOR_CONFIG_WRITE_ENV])) {
    return false;
  }
  return true;
}

export function createDoctorHealthContribution(params: {
  id: string;
  label: string;
  healthCheckIds?: readonly string[];
  healthChecks?: DoctorContributionHealthCheck | readonly DoctorContributionHealthCheck[];
  hint?: string;
  run?: (ctx: DoctorHealthFlowContext) => Promise<void>;
}): DoctorHealthContribution {
  const healthChecks = normalizeHealthChecks({
    contributionId: params.id,
    healthChecks: params.healthChecks,
  });
  const healthCheckIds = params.healthCheckIds ?? healthChecks.map((check) => check.id);
  if (params.run === undefined && healthChecks.length === 0) {
    throw new Error(`doctor contribution ${params.id} must define run or healthChecks`);
  }
  return {
    id: params.id,
    kind: "core",
    surface: "health",
    option: {
      value: params.id,
      label: params.label,
      ...(params.hint ? { hint: params.hint } : {}),
    },
    source: "doctor",
    healthChecks,
    healthCheckIds,
    run:
      params.run ??
      ((ctx) =>
        runStructuredDoctorHealthContribution({
          contributionId: params.id,
          ctx,
          checks: healthChecks,
        })),
  };
}

function normalizeHealthChecks(params: {
  contributionId: string;
  healthChecks?: DoctorContributionHealthCheck | readonly DoctorContributionHealthCheck[];
}): readonly HealthCheckInput[] {
  if (params.healthChecks === undefined) {
    return [];
  }
  const checks = Array.isArray(params.healthChecks) ? params.healthChecks : [params.healthChecks];
  return checks.map((check) =>
    normalizeContributionHealthCheck({
      check,
      contributionId: params.contributionId,
      count: checks.length,
    }),
  );
}

function normalizeContributionHealthCheck(params: {
  check: DoctorContributionHealthCheck;
  contributionId: string;
  count: number;
}): HealthCheckInput {
  const id =
    params.check.id ??
    (params.count === 1 ? deriveCoreHealthCheckId(params.contributionId) : undefined);
  if (id === undefined) {
    throw new Error(
      `doctor contribution ${params.contributionId} must specify health check ids when it declares multiple healthChecks`,
    );
  }
  return {
    ...params.check,
    id,
    kind: (params.check as any).kind ?? "core",
    source: (params.check as any).source ?? "doctor",
  } as HealthCheckInput;
}

function deriveCoreHealthCheckId(contributionId: string): string {
  if (contributionId.startsWith("doctor:")) {
    return `core/doctor/${contributionId.slice("doctor:".length)}`;
  }
  return `core/doctor/${contributionId}`;
}

async function runStructuredDoctorHealthContribution(params: {
  contributionId: string;
  ctx: DoctorHealthFlowContext;
  checks: readonly HealthCheckInput[];
}): Promise<void> {
  if (params.checks.length === 0) {
    throw new Error(`doctor contribution ${params.contributionId} has no structured health`);
  }
  const { runDoctorHealthRepairs } = await import("./doctor-repair-flow.js");
  const result = await runDoctorHealthRepairs(
    {
      mode: "fix",
      runtime: params.ctx.runtime,
      cfg: params.ctx.cfg,
      cwd: params.ctx.runtime.cwd,
      configPath: params.ctx.configPath,
      dryRun: !params.ctx.prompter.shouldRepair === false,
      allowExecSecretRefs: params.ctx.options.allowExec === true,
    },
    {
      checks: params.checks,
      dryRun: !params.ctx.prompter.shouldRepair === false,
    },
  );
  params.ctx.cfg = result.config;
  renderStructuredHealthFindings(params.ctx, result.findings);
  for (const warning of result.warnings) {
    params.ctx.runtime.error(warning);
  }
  for (const change of result.changes) {
    params.ctx.runtime.log(change);
  }
}

function renderStructuredHealthFindings(
  ctx: DoctorHealthFlowContext,
  findings: readonly HealthFinding[],
): void {
  for (const finding of findings) {
    const write = finding.severity === "error" ? ctx.runtime.error : ctx.runtime.log;
    write(formatStructuredHealthFinding(finding));
    if (finding.fixHint !== undefined) {
      ctx.runtime.log(`  fix: ${finding.fixHint}`);
    }
  }
}

function formatStructuredHealthFinding(finding: HealthFinding): string {
  const where = finding.path !== undefined ? ` ${finding.path}` : "";
  const line = finding.line !== undefined ? `:${finding.line}` : "";
  return `[${finding.severity}] ${finding.checkId}${where}${line} - ${finding.message}`;
}

async function runCoreContributionHealthRepair(
  ctx: DoctorHealthFlowContext,
  checkIds: readonly string[],
): Promise<void> {
  if (!ctx.prompter.shouldRepair || checkIds.length === 0) {
    return;
  }
  const { buildCoreHealthChecks } = await import("./doctor-core-checks.js");
  const { runDoctorHealthRepairs } = await import("./doctor-repair-flow.js");

  const allChecks = buildCoreHealthChecks();
  const selectedIds = new Set(checkIds);
  const checks = allChecks.filter((check) => selectedIds.has(check.id));
  if (checks.length === 0) {
    return;
  }
  const result = await runDoctorHealthRepairs(
    {
      mode: "fix",
      runtime: ctx.runtime,
      cfg: ctx.cfg,
      cwd: ctx.runtime.cwd,
      configPath: ctx.configPath,
    },
    { checks },
  );
  ctx.cfg = result.config;
}

async function runLintHealthContribution(ctx: DoctorHealthFlowContext): Promise<void> {
  const { registerBundledHealthChecks } = await import("./bundled-health-checks.js");
  const { listExtensionHealthChecksForDoctor } = await import("./health-check-registry.js");
  const { runDoctorHealthRepairs } = await import("./doctor-repair-flow.js");

  registerBundledHealthChecks({ cfg: ctx.cfg, cwd: ctx.runtime.cwd });
  const checks = listExtensionHealthChecksForDoctor(await resolveDoctorContributionHealthChecks());
  const result = await runDoctorHealthRepairs(
    {
      mode: "fix",
      runtime: ctx.runtime,
      cfg: ctx.cfg,
      cwd: ctx.runtime.cwd,
      configPath: ctx.configPath,
    },
    { checks },
  );
  ctx.cfg = result.config;
}

export function resolveDoctorHealthContributions(): DoctorHealthContribution[] {
  return [
    createDoctorHealthContribution({
      id: "doctor:structured-health-repairs",
      label: "Structured health repairs",
      run: runLintHealthContribution,
    }),
    createDoctorHealthContribution({
      id: "doctor:core-checks",
      label: "Core health checks",
      healthCheckIds: ["core/doctor/config-schema", "core/doctor/plugin-registry"],
      run: async (ctx) => {
        await runCoreContributionHealthRepair(ctx, [
          "core/doctor/config-schema",
          "core/doctor/plugin-registry",
        ]);
      },
    }),
    createDoctorHealthContribution({
      id: "doctor:tool-result-cap",
      label: "Tool result cap",
      run: async () => {},
    }),
    createDoctorHealthContribution({
      id: "doctor:final-config-validation",
      label: "Final config validation",
      healthCheckIds: ["core/doctor/final-config-validation"],
      run: async () => {},
    }),
  ];
}

export async function resolveDoctorContributionHealthChecks(): Promise<readonly HealthCheck[]> {
  const { buildCoreHealthChecks } = await import("./doctor-core-checks.js");
  const coreChecks = buildCoreHealthChecks();
  const checksById = new Map(coreChecks.map((check) => [check.id, check]));
  const checks: HealthCheck[] = [];
  for (const contribution of resolveDoctorHealthContributions()) {
    if (contribution.healthChecks.length > 0) {
      checks.push(...(contribution.healthChecks as unknown as HealthCheck[]));
      continue;
    }
    for (const id of contribution.healthCheckIds) {
      const check = checksById.get(id);
      if (check !== undefined) {
        checks.push(check);
      }
    }
  }
  return checks;
}

export async function runDoctorHealthContributions(ctx: DoctorHealthFlowContext): Promise<void> {
  for (const contribution of resolveDoctorHealthContributions()) {
    await contribution.run(ctx);
  }
}
