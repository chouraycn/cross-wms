/** Stores plugin host-hook run context, scheduler jobs, and pending event cleanup state. */
//
// 移植自 openclaw/src/plugins/host-hook-runtime.ts。
//
// 降级策略：
//  - 原文件依赖 @openclaw/normalization-core/string-coerce 的 normalizeOptionalString。
//    改用 cross-wms 的 ../infra/string-coerce.js，行为一致。
//  - 原文件依赖 ../infra/agent-events.js 的 AgentEventPayload。cross-wms 尚未移植
//    该模块。这里定义本地最小结构占位，仅含 dispatchPluginAgentEventSubscriptions
//    实际访问的 stream/runId/data.phase 字段。
//  - 原文件依赖 ../logging/subsystem.js 的 createSubsystemLogger。cross-wms 尚未
//    移植该模块。这里内联降级实现：委托 console 的简单日志器。
//  - 原文件依赖 ../shared/global-singleton.js 的 resolveGlobalSingleton。改用
//    cross-wms 的 ../infra/_openclaw-stubs.js，已提供同名导出。
//  - 原文件依赖 ./host-hook-cleanup-timeout.js 的 withPluginHostCleanupTimeout。
//    cross-wms 已移植，直接引用。
//  - 原文件依赖 ./host-hooks.js 的多个类型。cross-wms 尚未移植该模块。这里
//    定义本地最小结构占位（含 PluginSessionSchedulerJobRegistration 等完整字段）。
//  - 原文件依赖 ./host-hook-json.js 的 isPluginJsonValue 与 PluginJsonValue。
//    cross-wms 已移植，直接引用。
//  - 原文件依赖 ./registry-types.js 的 PluginRegistry。cross-wms 已在本批移植中
//    创建降级版，直接引用。
//  - 行为与 openclaw 原版一致：使用 Symbol.for() 进程级单例存储插件运行上下文、
//    调度器作业与待处理事件清理状态。

import { normalizeOptionalString } from "../infra/string-coerce.js";
import { resolveGlobalSingleton } from "../infra/_openclaw-stubs.js";
import { withPluginHostCleanupTimeout } from "./host-hook-cleanup-timeout.js";
import { isPluginJsonValue, type PluginJsonValue } from "./host-hook-json.js";
import type { PluginRegistry } from "./registry-types.js";

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * Agent 事件载荷（降级占位）。
 *
 * 降级原因：cross-wms 的 infra/agent-events.js 尚未移植。
 * 这里定义与 openclaw AgentEventPayload 结构兼容的最小类型，仅含
 * dispatchPluginAgentEventSubscriptions 实际访问的字段。
 */
type AgentEventPayload = {
  stream?: string;
  runId?: string;
  data?: {
    phase?: string;
    [key: string]: unknown;
  };
};

/**
 * 子系统日志器（降级占位）。
 *
 * 降级原因：cross-wms 的 logging/subsystem.js 尚未移植。
 * 这里定义与 openclaw SubsystemLogger 结构兼容的最小接口。
 */
type SubsystemLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/**
 * 创建子系统日志器。
 *
 * 降级说明：cross-wms 的 logging/subsystem.js 尚未移植。这里降级为
 * 委托 console 的简单日志器，保持相同的方法签名。
 */
function createSubsystemLogger(_namespace: string): SubsystemLogger {
  return {
    debug: (...args: unknown[]) => console.debug(`[${_namespace}]`, ...args),
    info: (...args: unknown[]) => console.info(`[${_namespace}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${_namespace}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${_namespace}]`, ...args),
  };
}

/** 降级占位：./host-hooks.js —— PluginHostCleanupReason */
type PluginHostCleanupReason = string;

/** 降级占位：./host-hooks.js —— PluginRunContextPatch */
type PluginRunContextPatch = {
  runId?: string;
  namespace?: string;
  value?: PluginJsonValue;
  unset?: boolean;
};

/** 降级占位：./host-hooks.js —— PluginRunContextGetParams */
type PluginRunContextGetParams = {
  runId?: string;
  namespace?: string;
};

/** 降级占位：./host-hooks.js —— PluginSessionSchedulerJobHandle */
type PluginSessionSchedulerJobHandle = {
  id: string;
  pluginId: string;
  sessionKey: string;
  kind: string;
};

/** 降级占位：./host-hooks.js —— PluginSessionSchedulerJobRegistration */
type PluginSessionSchedulerJobRegistration = {
  id: string;
  sessionKey: string;
  kind: string;
  cleanup?: (params: {
    reason: PluginHostCleanupReason;
    sessionKey: string;
    jobId: string;
  }) => void | Promise<void>;
};

/** 降级占位：./host-hooks.js —— PluginAgentEventSubscriptionRegistration */
type PluginAgentEventSubscriptionRegistration = {
  pluginId: string;
  subscription: {
    id: string;
    streams?: readonly string[];
    handle: (
      event: AgentEventPayload,
      ctx: {
        getRunContext: (namespace: string) => PluginJsonValue | undefined;
        setRunContext: (namespace: string, value: PluginJsonValue) => void;
        clearRunContext: (namespace?: string) => void;
      },
    ) => void | Promise<void>;
  };
};

// ============================================================================
// host-hook-runtime 实现
// ============================================================================

type PluginRunContextNamespaces = Map<string, PluginJsonValue>;
type PluginRunContextByPlugin = Map<string, PluginRunContextNamespaces>;
type PluginAgentEventSubscriptionContext = Parameters<
  PluginAgentEventSubscriptionRegistration["subscription"]["handle"]
>[1];

type SchedulerJobRecord = {
  pluginId: string;
  pluginName?: string;
  job: PluginSessionSchedulerJobRegistration;
  generation: number;
  ownerRegistry?: PluginRegistry;
};

type PluginHostRuntimeState = {
  runContextByRunId: Map<string, PluginRunContextByPlugin>;
  schedulerJobsByPlugin: Map<string, Map<string, SchedulerJobRecord>>;
  nextSchedulerJobGeneration: number;
  pendingAgentEventHandlersByRunId: Map<string, Set<Promise<void>>>;
  closedRunIds: Set<string>;
  terminalEventCleanupExpiredRunIds: Set<string>;
};

const PLUGIN_HOST_RUNTIME_STATE_KEY = Symbol.for("openclaw.pluginHostRuntimeState");
const CLOSED_RUN_IDS_MAX = 512;
export const PLUGIN_TERMINAL_EVENT_CLEANUP_WAIT_MS = 5_000;
const log = createSubsystemLogger("plugins/host-hooks");

function getPluginHostRuntimeState(): PluginHostRuntimeState {
  return resolveGlobalSingleton<PluginHostRuntimeState>(PLUGIN_HOST_RUNTIME_STATE_KEY, () => ({
    runContextByRunId: new Map(),
    schedulerJobsByPlugin: new Map(),
    nextSchedulerJobGeneration: 1,
    pendingAgentEventHandlersByRunId: new Map(),
    closedRunIds: new Set(),
    terminalEventCleanupExpiredRunIds: new Set(),
  }));
}

function normalizeNamespace(value: string | undefined): string {
  return (value ?? "").trim();
}

function copyJsonValue(value: PluginJsonValue): PluginJsonValue {
  return structuredClone(value);
}

function markPluginRunClosed(runId: string): void {
  const state = getPluginHostRuntimeState();
  state.closedRunIds.delete(runId);
  state.closedRunIds.add(runId);
  while (state.closedRunIds.size > CLOSED_RUN_IDS_MAX) {
    const oldest = state.closedRunIds.values().next().value;
    if (oldest === undefined) {
      break;
    }
    state.closedRunIds.delete(oldest);
  }
}

function isPluginRunClosed(runId: string): boolean {
  return getPluginHostRuntimeState().closedRunIds.has(runId);
}

function markTerminalEventCleanupExpired(runId: string): void {
  const state = getPluginHostRuntimeState();
  state.terminalEventCleanupExpiredRunIds.delete(runId);
  state.terminalEventCleanupExpiredRunIds.add(runId);
  while (state.terminalEventCleanupExpiredRunIds.size > CLOSED_RUN_IDS_MAX) {
    const oldest = state.terminalEventCleanupExpiredRunIds.values().next().value;
    if (oldest === undefined) {
      break;
    }
    state.terminalEventCleanupExpiredRunIds.delete(oldest);
  }
}

function isTerminalEventCleanupExpired(runId: string): boolean {
  return getPluginHostRuntimeState().terminalEventCleanupExpiredRunIds.has(runId);
}

function trackAgentEventHandler(runId: string, pending: Promise<void>): void {
  const state = getPluginHostRuntimeState();
  const handlers = state.pendingAgentEventHandlersByRunId.get(runId) ?? new Set();
  handlers.add(pending);
  state.pendingAgentEventHandlersByRunId.set(runId, handlers);
  void pending.finally(() => {
    handlers.delete(pending);
    if (
      handlers.size === 0 &&
      getPluginHostRuntimeState().pendingAgentEventHandlersByRunId.get(runId) === handlers
    ) {
      state.pendingAgentEventHandlersByRunId.delete(runId);
    }
  });
}

async function waitForLiveTerminalEventHandlers(runId: string): Promise<"settled"> {
  for (;;) {
    const pendingHandlers = getPluginHostRuntimeState().pendingAgentEventHandlersByRunId.get(runId);
    if (!pendingHandlers || pendingHandlers.size === 0) {
      return "settled";
    }
    await Promise.allSettled(pendingHandlers);
  }
}

function waitForTerminalEventHandlers(params: { runId: string }): Promise<void> {
  const { runId } = params;
  let timeout: NodeJS.Timeout | undefined;
  const settled = waitForLiveTerminalEventHandlers(runId);
  // Promise.race bounds the host wait; JavaScript cannot cancel the plugin
  // promises themselves, so timeout also marks the run expired to block late
  // run-context resurrection by handlers that eventually settle.
  const timedOut = new Promise<"timeout">((resolve) => {
    timeout = setTimeout(() => {
      markTerminalEventCleanupExpired(runId);
      getPluginHostRuntimeState().pendingAgentEventHandlersByRunId.delete(runId);
      log.warn(
        `plugin terminal agent event subscriptions still running after ${PLUGIN_TERMINAL_EVENT_CLEANUP_WAIT_MS}ms; clearing run context without waiting for them to settle`,
      );
      resolve("timeout");
    }, PLUGIN_TERMINAL_EVENT_CLEANUP_WAIT_MS);
  });
  if (timeout) {
    timeout.unref?.();
  }
  return Promise.race([settled, timedOut]).then(() => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  });
}

function getPluginRunContextNamespaces(params: {
  runId: string;
  pluginId: string;
  create?: boolean;
}): PluginRunContextNamespaces | undefined {
  const state = getPluginHostRuntimeState();
  let byPlugin = state.runContextByRunId.get(params.runId);
  if (!byPlugin && params.create) {
    byPlugin = new Map();
    state.runContextByRunId.set(params.runId, byPlugin);
  }
  if (!byPlugin) {
    return undefined;
  }
  let namespaces = byPlugin.get(params.pluginId);
  if (!namespaces && params.create) {
    namespaces = new Map();
    byPlugin.set(params.pluginId, namespaces);
  }
  return namespaces;
}

/** Stores JSON-compatible plugin run context for one run/plugin/namespace tuple. */
export function setPluginRunContext(params: {
  pluginId: string;
  patch: PluginRunContextPatch;
  allowClosedRun?: boolean;
}): boolean {
  const runId = normalizeOptionalString(params.patch.runId);
  const namespace = normalizeNamespace(params.patch.namespace);
  if (!runId || !namespace) {
    return false;
  }
  if (!params.allowClosedRun && isPluginRunClosed(runId)) {
    return false;
  }
  // Only an explicit `unset: true` deletes the run-context entry — silently
  // treating an accidentally-omitted `value` as a clear is surprising and
  // diverges from the stricter `sessions.pluginPatch` semantics.
  if (params.patch.unset === true) {
    clearPluginRunContext({
      pluginId: params.pluginId,
      runId,
      namespace,
    });
    return true;
  }
  if (params.patch.value === undefined) {
    return false;
  }
  if (!isPluginJsonValue(params.patch.value)) {
    return false;
  }
  const namespaces = getPluginRunContextNamespaces({
    runId,
    pluginId: params.pluginId,
    create: true,
  });
  namespaces?.set(namespace, copyJsonValue(params.patch.value));
  return true;
}

/** Reads previously stored plugin run context for one run/plugin/namespace tuple. */
export function getPluginRunContext(params: {
  pluginId: string;
  get: PluginRunContextGetParams;
}): PluginJsonValue | undefined {
  const runId = normalizeOptionalString(params.get.runId);
  const namespace = normalizeNamespace(params.get.namespace);
  if (!runId || !namespace) {
    return undefined;
  }
  const value = getPluginRunContextNamespaces({
    runId,
    pluginId: params.pluginId,
  })?.get(namespace);
  return value === undefined ? undefined : copyJsonValue(value);
}

export function clearPluginRunContext(params: {
  pluginId?: string;
  runId?: string;
  namespace?: string;
}): void {
  // Normalize namespace through the same trim() used by set/get so callers that
  // pass whitespace or differently-formatted strings hit the same Map keys and
  // don't leave orphan entries behind.
  const normalizedNamespace =
    params.namespace !== undefined ? normalizeNamespace(params.namespace) : undefined;
  // An empty-after-trim namespace is treated as "no namespace filter" rather
  // than as a literal-empty-string deletion: that matches the set/get rule that
  // empty namespaces are not addressable, and it avoids silently no-op-ing the
  // delete (which would otherwise look like a successful clear).
  const namespaceFilter =
    normalizedNamespace !== undefined && normalizedNamespace !== ""
      ? normalizedNamespace
      : undefined;
  const state = getPluginHostRuntimeState();
  const runIds = params.runId ? [params.runId] : [...state.runContextByRunId.keys()];
  for (const runId of runIds) {
    const byPlugin = state.runContextByRunId.get(runId);
    if (!byPlugin) {
      continue;
    }
    const pluginIds = params.pluginId ? [params.pluginId] : [...byPlugin.keys()];
    for (const pluginId of pluginIds) {
      const namespaces = byPlugin.get(pluginId);
      if (!namespaces) {
        continue;
      }
      if (namespaceFilter !== undefined) {
        namespaces.delete(namespaceFilter);
      } else {
        namespaces.clear();
      }
      if (namespaces.size === 0) {
        byPlugin.delete(pluginId);
      }
    }
    if (byPlugin.size === 0) {
      state.runContextByRunId.delete(runId);
    }
  }
  if (params.runId && !params.pluginId && namespaceFilter === undefined) {
    state.pendingAgentEventHandlersByRunId.delete(params.runId);
  }
}

function isTerminalAgentRunEvent(event: AgentEventPayload): boolean {
  const phase = event.data?.phase;
  return event.stream === "lifecycle" && (phase === "end" || phase === "error");
}

function logAgentEventSubscriptionFailure(params: {
  pluginId: string;
  subscriptionId: string;
  error: unknown;
}): void {
  log.warn(
    `plugin agent event subscription failed: plugin=${params.pluginId} subscription=${params.subscriptionId} error=${String(params.error)}`,
  );
}

export function dispatchPluginAgentEventSubscriptions(params: {
  registry: PluginRegistry | null | undefined;
  event: AgentEventPayload;
}): void {
  // 降级：registry-types.ts 中 agentEventSubscriptions 的 subscription 字段为 unknown
  // 占位。这里断言为本地 PluginAgentEventSubscriptionRegistration 以访问 streams/handle。
  const subscriptions = (params.registry?.agentEventSubscriptions ?? []) as
    PluginAgentEventSubscriptionRegistration[];
  const pendingHandlers: Promise<void>[] = [];
  const isTerminalEvent = isTerminalAgentRunEvent(params.event);
  for (const registration of subscriptions) {
    const streams = registration.subscription.streams;
    if (streams && streams.length > 0 && !streams.includes(params.event.stream ?? "")) {
      continue;
    }
    const pluginId = registration.pluginId;
    const runId = params.event.runId;
    if (!runId) {
      continue;
    }
    let handlerActive = true;
    const ctx: PluginAgentEventSubscriptionContext = {
      getRunContext: ((namespace: string) =>
        getPluginRunContext({
          pluginId,
          get: { runId, namespace },
        })) as PluginAgentEventSubscriptionContext["getRunContext"],
      setRunContext: (namespace: string, value: PluginJsonValue) => {
        setPluginRunContext({
          pluginId,
          patch: { runId, namespace, value },
          allowClosedRun: isTerminalEvent && handlerActive && !isTerminalEventCleanupExpired(runId),
        });
      },
      clearRunContext: (namespace?: string) => {
        clearPluginRunContext({ pluginId, runId, namespace });
      },
    };
    try {
      const pending = Promise.resolve(
        registration.subscription.handle(structuredClone(params.event), ctx),
      )
        .catch((error: unknown) => {
          logAgentEventSubscriptionFailure({
            pluginId,
            subscriptionId: registration.subscription.id,
            error,
          });
        })
        .finally(() => {
          handlerActive = false;
        });
      trackAgentEventHandler(runId, pending);
      pendingHandlers.push(pending);
    } catch (error) {
      handlerActive = false;
      logAgentEventSubscriptionFailure({
        pluginId,
        subscriptionId: registration.subscription.id,
        error,
      });
    }
  }
  if (isTerminalEvent && params.event.runId) {
    markPluginRunClosed(params.event.runId);
    void waitForTerminalEventHandlers({
      runId: params.event.runId,
    }).then(() => {
      clearPluginRunContext({ runId: params.event.runId });
    });
  }
}

export function registerPluginSessionSchedulerJob(params: {
  pluginId: string;
  pluginName?: string;
  job: PluginSessionSchedulerJobRegistration;
  ownerRegistry?: PluginRegistry;
}): PluginSessionSchedulerJobHandle | undefined {
  const id = normalizeOptionalString(params.job.id);
  const sessionKey = normalizeOptionalString(params.job.sessionKey);
  const kind = normalizeOptionalString(params.job.kind);
  if (!id || !sessionKey || !kind) {
    return undefined;
  }
  const state = getPluginHostRuntimeState();
  const jobs = state.schedulerJobsByPlugin.get(params.pluginId) ?? new Map();
  const generation = state.nextSchedulerJobGeneration++;
  jobs.set(id, {
    pluginId: params.pluginId,
    pluginName: params.pluginName,
    job: { ...params.job, id, sessionKey, kind },
    generation,
    ...(params.ownerRegistry ? { ownerRegistry: params.ownerRegistry } : {}),
  });
  state.schedulerJobsByPlugin.set(params.pluginId, jobs);
  return { id, pluginId: params.pluginId, sessionKey, kind };
}

export function deletePluginSessionSchedulerJob(params: {
  pluginId: string;
  jobId: string;
  sessionKey?: string;
  expectedGeneration?: number;
}): void {
  const state = getPluginHostRuntimeState();
  const jobs = state.schedulerJobsByPlugin.get(params.pluginId);
  const record = jobs?.get(params.jobId);
  if (!jobs || !record) {
    return;
  }
  if (params.sessionKey && record.job.sessionKey !== params.sessionKey) {
    return;
  }
  if (params.expectedGeneration !== undefined && record.generation !== params.expectedGeneration) {
    return;
  }
  jobs.delete(params.jobId);
  if (jobs.size === 0) {
    state.schedulerJobsByPlugin.delete(params.pluginId);
  }
}

function hasPluginSessionSchedulerJob(params: {
  pluginId: string;
  jobId: string;
  sessionKey?: string;
  generation?: number;
}): boolean {
  const state = getPluginHostRuntimeState();
  const record = state.schedulerJobsByPlugin.get(params.pluginId)?.get(params.jobId);
  if (!record) {
    return false;
  }
  if (params.sessionKey && record.job.sessionKey !== params.sessionKey) {
    return false;
  }
  return params.generation === undefined || record.generation === params.generation;
}

export function getPluginSessionSchedulerJobGeneration(params: {
  pluginId: string;
  jobId: string;
  sessionKey?: string;
}): number | undefined {
  const state = getPluginHostRuntimeState();
  const record = state.schedulerJobsByPlugin.get(params.pluginId)?.get(params.jobId);
  if (!record) {
    return undefined;
  }
  if (params.sessionKey && record.job.sessionKey !== params.sessionKey) {
    return undefined;
  }
  return record.generation;
}

export function makePluginSessionSchedulerJobKey(pluginId: string, jobId: string): string {
  return JSON.stringify([pluginId, jobId]);
}

export async function cleanupPluginSessionSchedulerJobs(params: {
  pluginId?: string;
  reason: PluginHostCleanupReason;
  sessionKey?: string;
  records?: readonly {
    pluginId: string;
    pluginName?: string;
    job: PluginSessionSchedulerJobRegistration;
    generation?: number;
  }[];
  preserveJobIds?: ReadonlySet<string>;
  excludeJobKeys?: ReadonlySet<string>;
  shouldCleanup?: () => boolean;
  preserveOwnerRegistry?: PluginRegistry | null;
}): Promise<Array<{ pluginId: string; hookId: string; error: unknown }>> {
  const state = getPluginHostRuntimeState();
  const failures: Array<{ pluginId: string; hookId: string; error: unknown }> = [];
  const shouldCleanup = params.shouldCleanup ?? (() => true);
  if (!shouldCleanup()) {
    return failures;
  }
  const registryRecordKeys = new Set<string>();
  const schedulerJobKey = (pluginId: string, jobId: string, sessionKey: string) =>
    `${pluginId}\0${jobId}\0${sessionKey}`;
  if (params.records) {
    for (const record of params.records) {
      if (!shouldCleanup()) {
        return failures;
      }
      if (params.pluginId && record.pluginId !== params.pluginId) {
        continue;
      }
      const jobId = normalizeOptionalString(record.job.id);
      const sessionKey = normalizeOptionalString(record.job.sessionKey);
      if (!jobId || !sessionKey) {
        continue;
      }
      if (params.sessionKey && sessionKey !== params.sessionKey) {
        continue;
      }
      registryRecordKeys.add(schedulerJobKey(record.pluginId, jobId, sessionKey));
      const liveGeneration = getPluginSessionSchedulerJobGeneration({
        pluginId: record.pluginId,
        jobId,
        sessionKey,
      });
      if (record.generation !== undefined && liveGeneration === undefined) {
        continue;
      }
      if (
        record.generation === undefined &&
        !hasPluginSessionSchedulerJob({
          pluginId: record.pluginId,
          jobId,
          sessionKey,
        })
      ) {
        continue;
      }
      const preserveJob = params.preserveJobIds?.has(jobId) ?? false;
      if (preserveJob) {
        // preserveJobIds means "do not run cleanup at all" — even across
        // generation mismatches. The generation-matched deletion below would
        // otherwise still call the OLD cleanup callback, which can remove
        // external scheduled jobs (e.g. cron.remove) and break the live
        // newer-generation registration that took over this jobId.
        continue;
      }
      // A newer generation may already own this id. The old cleanup callback can
      // still release plugin-owned resources, while deletion below is generation
      // matched so it cannot remove the newer live record.
      const hookId = `scheduler:${jobId}`;
      try {
        await withPluginHostCleanupTimeout(hookId, () =>
          record.job.cleanup?.({
            reason: params.reason,
            sessionKey,
            jobId,
          }),
        );
      } catch (error) {
        failures.push({
          pluginId: record.pluginId,
          hookId,
          error,
        });
        continue;
      }
      if (!shouldCleanup()) {
        continue;
      }
      deletePluginSessionSchedulerJob({
        pluginId: record.pluginId,
        jobId,
        sessionKey,
        expectedGeneration: record.generation,
      });
    }
  }
  const pluginIds = params.pluginId ? [params.pluginId] : [...state.schedulerJobsByPlugin.keys()];
  for (const pluginId of pluginIds) {
    if (!shouldCleanup()) {
      return failures;
    }
    const jobs = state.schedulerJobsByPlugin.get(pluginId);
    if (!jobs) {
      continue;
    }
    for (const [jobId, record] of jobs.entries()) {
      if (!shouldCleanup()) {
        return failures;
      }
      if (params.sessionKey && record.job.sessionKey !== params.sessionKey) {
        continue;
      }
      if (registryRecordKeys.has(schedulerJobKey(pluginId, jobId, record.job.sessionKey))) {
        continue;
      }
      if (
        params.preserveOwnerRegistry !== undefined &&
        record.ownerRegistry === params.preserveOwnerRegistry
      ) {
        continue;
      }
      if (params.excludeJobKeys?.has(makePluginSessionSchedulerJobKey(pluginId, jobId))) {
        continue;
      }
      if (params.preserveJobIds?.has(jobId)) {
        continue;
      }
      const hookId = `scheduler:${jobId}`;
      try {
        await withPluginHostCleanupTimeout(hookId, () =>
          record.job.cleanup?.({
            reason: params.reason,
            sessionKey: record.job.sessionKey,
            jobId,
          }),
        );
      } catch (error) {
        failures.push({
          pluginId,
          hookId,
          error,
        });
        continue;
      }
      if (!shouldCleanup()) {
        continue;
      }
      jobs.delete(jobId);
    }
    if (jobs.size === 0) {
      state.schedulerJobsByPlugin.delete(pluginId);
    }
  }
  return failures;
}

export function clearPluginHostRuntimeState(params?: { pluginId?: string; runId?: string }): void {
  clearPluginRunContext(params ?? {});
  if (params?.pluginId) {
    getPluginHostRuntimeState().schedulerJobsByPlugin.delete(params.pluginId);
  } else if (!params?.runId) {
    const state = getPluginHostRuntimeState();
    state.schedulerJobsByPlugin.clear();
    state.pendingAgentEventHandlersByRunId.clear();
    state.closedRunIds.clear();
    state.terminalEventCleanupExpiredRunIds.clear();
  }
}

export function listPluginSessionSchedulerJobs(
  pluginId?: string,
): PluginSessionSchedulerJobHandle[] {
  const state = getPluginHostRuntimeState();
  const records: PluginSessionSchedulerJobHandle[] = [];
  const pluginIds = pluginId ? [pluginId] : [...state.schedulerJobsByPlugin.keys()];
  for (const currentPluginId of pluginIds) {
    const jobs = state.schedulerJobsByPlugin.get(currentPluginId);
    if (!jobs) {
      continue;
    }
    for (const record of jobs.values()) {
      records.push({
        id: record.job.id,
        pluginId: currentPluginId,
        sessionKey: record.job.sessionKey,
        kind: record.job.kind,
      });
    }
  }
  return records.toSorted((left, right) => left.id.localeCompare(right.id));
}
