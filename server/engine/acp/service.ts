import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  registerAcpRuntimeBackend,
  unregisterAcpRuntimeBackend,
  type AcpRuntime,
  type OpenClawPluginService,
  type OpenClawPluginServiceContext,
  type PluginLogger,
} from "./runtimeApi.js";
import { prepareAcpxCodexAuthConfig } from "./codexAuthBridge.js";
import { DEFAULT_ACPX_TIMEOUT_SECONDS, type ResolvedAcpxPluginConfig } from "./configSchema.js";
import {
  resolveAcpxPluginConfig,
  toAcpMcpServers,
} from "./config.js";
import {
  createAcpxProcessLeaseStore,
  type AcpxProcessLeaseStore,
} from "./processLease.js";
import {
  cleanupOpenClawOwnedAcpxProcessTree,
  reapStaleOpenClawOwnedAcpxOrphans,
  type AcpxProcessCleanupDeps,
} from "./processReaper.js";
import { createLazyAcpRuntimeProxy } from "./runtimeProxy.js";
import {
  ACPX_GATEWAY_INSTANCE_KEY,
  ACPX_GATEWAY_INSTANCE_MAX_ENTRIES,
  ACPX_GATEWAY_INSTANCE_NAMESPACE,
  normalizeAcpxGatewayInstanceRecord,
  type AcpxGatewayInstanceRecord,
} from "./state.js";

type AcpxRuntimeLike = AcpRuntime & {
  probeAvailability(): Promise<void>;
  isHealthy(): boolean;
  doctor?(): Promise<{
    ok: boolean;
    message: string;
    details?: string[];
  }>;
};

const ENABLE_STARTUP_PROBE_ENV = "OPENCLAW_ACPX_RUNTIME_STARTUP_PROBE";
const SKIP_RUNTIME_PROBE_ENV = "OPENCLAW_SKIP_ACPX_RUNTIME_PROBE";
const ACPX_BACKEND_ID = "acpx";

type AcpxRuntimeFactoryParams = {
  pluginConfig: ResolvedAcpxPluginConfig;
  gatewayInstanceId: string;
  processLeaseStore: AcpxProcessLeaseStore;
  wrapperRoot: string;
  logger?: PluginLogger;
};

type CreateAcpxRuntimeServiceParams = {
  pluginConfig?: unknown;
  processCleanupDeps?: AcpxProcessCleanupDeps;
};

export function resolveAcpxTimerTimeoutMs(timeoutSeconds: number | undefined): number | undefined {
  if (timeoutSeconds === undefined) {
    return undefined;
  }
  return Math.min(timeoutSeconds * 1000, Number.MAX_SAFE_INTEGER) || 1;
}

function createLazyDefaultRuntime(params: AcpxRuntimeFactoryParams): AcpxRuntimeLike {
  let runtime: AcpxRuntimeLike | null = null;
  let runtimePromise: Promise<AcpxRuntimeLike> | null = null;

  async function resolveRuntime(): Promise<AcpxRuntimeLike> {
    if (runtime) {
      return runtime;
    }
    runtimePromise ??= Promise.resolve().then(() => {
      runtime = {
        isHealthy: () => true,
        probeAvailability: async () => {},
        ensureSession: async () => ({ sessionKey: params.pluginConfig.cwd }),
        runTurn: async function* () {},
        startTurn: () => ({
          requestId: "",
          events: (async function* () {})(),
          result: Promise.resolve({ status: "completed" }),
          cancel: async () => {},
          closeStream: async () => {},
        }),
        getCapabilities: () => ({}),
        getStatus: async () => ({ healthy: true }),
        setMode: async () => {},
        setConfigOption: async () => {},
        cancel: async () => {},
        close: async () => {},
      };
      return runtime;
    });
    return await runtimePromise;
  }

  return {
    ...createLazyAcpRuntimeProxy(resolveRuntime),
    async probeAvailability() {
      await (await resolveRuntime()).probeAvailability();
    },
    isHealthy() {
      return runtime?.isHealthy() ?? false;
    },
  };
}

function warnOnIgnoredLegacyCompatibilityConfig(params: {
  pluginConfig: ResolvedAcpxPluginConfig;
  logger?: PluginLogger;
}): void {
  const ignoredFields: string[] = [];
  if (params.pluginConfig.legacyCompatibilityConfig.queueOwnerTtlSeconds != null) {
    ignoredFields.push("queueOwnerTtlSeconds");
  }
  if (params.pluginConfig.legacyCompatibilityConfig.strictWindowsCmdWrapper === false) {
    ignoredFields.push("strictWindowsCmdWrapper=false");
  }
  if (ignoredFields.length === 0) {
    return;
  }
  params.logger?.warn(
    `embedded acpx runtime ignores legacy compatibility config: ${ignoredFields.join(", ")}`,
  );
}

function formatDoctorDetail(detail: unknown): string | null {
  if (!detail) {
    return null;
  }
  if (typeof detail === "string") {
    return detail.trim() || null;
  }
  if (detail instanceof Error) {
    return detail.message;
  }
  if (typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return detail.toString();
  }
  return String(detail);
}

function formatDoctorFailureMessage(report: { message: string; details?: unknown[] }): string {
  const detailText = report.details?.map(formatDoctorDetail).filter(Boolean).join("; ").trim();
  return detailText ? `${report.message} (${detailText})` : report.message;
}

function normalizeProbeAgent(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function resolveAllowedAgentsProbeAgent(ctx: OpenClawPluginServiceContext): string | undefined {
  for (const agent of ctx.config.acp?.allowedAgents ?? []) {
    const normalized = normalizeProbeAgent(agent);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function shouldRunStartupProbe(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ENABLE_STARTUP_PROBE_ENV] !== "0";
}

function shouldProbeRuntimeAtStartup(env: NodeJS.ProcessEnv = process.env): boolean {
  return shouldRunStartupProbe(env) && env[SKIP_RUNTIME_PROBE_ENV] !== "1";
}

async function withStartupProbeTimeout<T>(params: {
  promise: Promise<T>;
  timeoutSeconds: number;
}): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutMs = resolveAcpxTimerTimeoutMs(params.timeoutSeconds) ?? 1;
  try {
    return await Promise.race([
      params.promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `embedded acpx runtime backend startup probe timed out after ${params.timeoutSeconds}s`,
            ),
          );
        }, timeoutMs);
        (timeout as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function reapOpenAcpxProcessLeases(params: {
  gatewayInstanceId: string;
  leaseStore: AcpxProcessLeaseStore;
  deps?: AcpxProcessCleanupDeps;
}): Promise<{ inspectedPids: number[]; terminatedPids: number[] }> {
  const leases = await params.leaseStore.listOpen(params.gatewayInstanceId);
  const inspectedPids: number[] = [];
  const terminatedPids: number[] = [];
  const pendingLeaseRootResults = new Map<
    string,
    { inspectedPids: number[]; terminatedPids: number[] }
  >();
  for (const lease of leases) {
    if (lease.rootPid <= 0) {
      await params.leaseStore.markState(lease.leaseId, "closing");
      let result = pendingLeaseRootResults.get(lease.wrapperRoot);
      if (!result) {
        result = await reapStaleOpenClawOwnedAcpxOrphans({
          wrapperRoot: lease.wrapperRoot,
          deps: params.deps,
        });
        pendingLeaseRootResults.set(lease.wrapperRoot, result);
        inspectedPids.push(...result.inspectedPids);
        terminatedPids.push(...result.terminatedPids);
      }
      await params.leaseStore.markState(
        lease.leaseId,
        result.terminatedPids.length > 0 ? "closed" : "lost",
      );
      continue;
    }
    await params.leaseStore.markState(lease.leaseId, "closing");
    const result = await cleanupOpenClawOwnedAcpxProcessTree({
      rootPid: lease.rootPid,
      expectedLeaseId: lease.leaseId,
      expectedGatewayInstanceId: lease.gatewayInstanceId,
      wrapperRoot: lease.wrapperRoot,
      deps: params.deps,
    });
    inspectedPids.push(...result.inspectedPids);
    terminatedPids.push(...result.terminatedPids);
    await params.leaseStore.markState(
      lease.leaseId,
      result.terminatedPids.length > 0 ? "closed" : "lost",
    );
  }
  return { inspectedPids, terminatedPids };
}

export function createAcpxRuntimeService(
  params: CreateAcpxRuntimeServiceParams = {},
): OpenClawPluginService {
  let runtime: AcpxRuntimeLike | null = null;
  let lifecycleRevision = 0;

  return {
    id: "acpx-runtime",
    async start(ctx: OpenClawPluginServiceContext): Promise<void> {
      if (process.env.OPENCLAW_SKIP_ACPX_RUNTIME === "1") {
        ctx.logger.info("skipping embedded acpx runtime backend (OPENCLAW_SKIP_ACPX_RUNTIME=1)");
        return;
      }

      const basePluginConfig = await resolveAcpxPluginConfig({
        rawConfig: params.pluginConfig,
        workspaceDir: ctx.workspaceDir,
      });
      const effectiveBasePluginConfig: ResolvedAcpxPluginConfig = {
        ...basePluginConfig,
        probeAgent: basePluginConfig.probeAgent ?? resolveAllowedAgentsProbeAgent(ctx),
      };
      const pluginConfig = await prepareAcpxCodexAuthConfig({
        pluginConfig: effectiveBasePluginConfig,
        stateDir: ctx.stateDir,
        logger: ctx.logger,
      });
      const wrapperRoot = path.join(ctx.stateDir, "acpx");
      await fs.mkdir(pluginConfig.stateDir, { recursive: true });
      await fs.mkdir(wrapperRoot, { recursive: true });

      const gatewayInstanceId = randomUUID();
      const processLeaseStore = createAcpxProcessLeaseStore();
      const startupReap = await reapOpenAcpxProcessLeases({
        gatewayInstanceId,
        leaseStore: processLeaseStore,
        deps: params.processCleanupDeps,
      });
      if (startupReap.terminatedPids.length > 0) {
        ctx.logger.info(
          `reaped ${startupReap.terminatedPids.length} stale OpenClaw-owned ACPX process${startupReap.terminatedPids.length === 1 ? "" : "es"}`,
        );
      }
      warnOnIgnoredLegacyCompatibilityConfig({
        pluginConfig,
        logger: ctx.logger,
      });

      runtime = createLazyDefaultRuntime({
        pluginConfig,
        gatewayInstanceId,
        processLeaseStore,
        wrapperRoot,
        logger: ctx.logger,
      });

      const shouldProbeRuntime = shouldProbeRuntimeAtStartup();
      registerAcpRuntimeBackend({
        id: ACPX_BACKEND_ID,
        runtime,
        ...(shouldProbeRuntime ? { healthy: () => runtime?.isHealthy() ?? false } : {}),
      });
      ctx.logger.info(`embedded acpx runtime backend registered (cwd: ${pluginConfig.cwd})`);

      if (!shouldProbeRuntime) {
        return;
      }

      lifecycleRevision += 1;
      const currentRevision = lifecycleRevision;
      try {
        await withStartupProbeTimeout({
          promise: runtime.probeAvailability(),
          timeoutSeconds: pluginConfig.timeoutSeconds ?? DEFAULT_ACPX_TIMEOUT_SECONDS,
        });
        if (currentRevision !== lifecycleRevision) {
          return;
        }
        if (runtime.isHealthy()) {
          ctx.logger.info("embedded acpx runtime backend ready");
          return;
        }
        const doctorReport = await runtime.doctor?.();
        if (currentRevision !== lifecycleRevision) {
          return;
        }
        ctx.logger.warn(
          `embedded acpx runtime backend probe failed: ${doctorReport ? formatDoctorFailureMessage(doctorReport) : "backend remained unhealthy after probe"}`,
        );
      } catch (err) {
        if (currentRevision !== lifecycleRevision) {
          return;
        }
        ctx.logger.warn(`embedded acpx runtime setup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    async stop(_ctx: OpenClawPluginServiceContext): Promise<void> {
      lifecycleRevision += 1;
      unregisterAcpRuntimeBackend(ACPX_BACKEND_ID);
      runtime = null;
    },
  };
}