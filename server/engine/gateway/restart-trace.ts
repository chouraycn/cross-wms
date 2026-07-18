// Gateway 重启时序追踪辅助。
// 发射可选的重启交接诊断，带有边界的度量格式化。
// 移植自 openclaw/src/gateway/restart-trace.ts。
// 依赖调整：../infra/env.js、../logging/subsystem.js（cross-wms 已存在等价导出）。
import { performance } from "node:perf_hooks";
import { isTruthyEnvValue } from "../infra/env.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const restartTraceLog = createSubsystemLogger("gateway");
const RESTART_TRACE_HANDOFF_STARTED_AT_ENV = "OPENCLAW_GATEWAY_RESTART_TRACE_STARTED_AT_MS";
const RESTART_TRACE_HANDOFF_LAST_AT_ENV = "OPENCLAW_GATEWAY_RESTART_TRACE_LAST_AT_MS";
const RESTART_TRACE_HANDOFF_MAX_AGE_MS = 10 * 60_000;

// Restart trace 是 gateway 重启交接路径的可选时序记录器。
// 它通过有边界的 env 交接值跨进程替换保留经过时间，并忽略陈旧/未来的交接。
type RestartTraceMetricValue = boolean | number | string | null | undefined;
type RestartTraceMetrics =
  | Readonly<Record<string, RestartTraceMetricValue>>
  | ReadonlyArray<readonly [string, RestartTraceMetricValue]>;
export type GatewayRestartTraceHandoff = {
  startedAt: number;
  lastAt: number;
};

let startedAt = 0;
let lastAt = 0;
let active = false;

function nowMs(): number {
  return performance.timeOrigin + performance.now();
}

function isRestartTraceEnabled(): boolean {
  return isTruthyEnvValue(process.env.OPENCLAW_GATEWAY_RESTART_TRACE);
}

function normalizeMetricEntries(
  metrics?: RestartTraceMetrics,
): Array<readonly [string, RestartTraceMetricValue]> {
  if (!metrics) {
    return [];
  }
  return Array.isArray(metrics) ? [...metrics] : Object.entries(metrics);
}

function formatMetricKey(key: string): string {
  // 度量键是日志 token，不是结构化 JSON。保持它们紧凑且对 shell 友好，使 trace 行可 grep。
  const normalized = key.replace(/[^A-Za-z0-9]/gu, "");
  if (!normalized) {
    return "metric";
  }
  return /^[A-Za-z]/u.test(normalized) ? normalized : `metric${normalized}`;
}

function formatMetricValue(value: RestartTraceMetricValue): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(1) : null;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/\s+/gu, "_")
      .replace(/[^A-Za-z0-9_.:/-]/gu, "_")
      .slice(0, 120);
    return normalized || null;
  }
  return null;
}

function formatMetrics(metrics?: RestartTraceMetrics): string {
  const parts: string[] = [];
  for (const [key, value] of normalizeMetricEntries(metrics)) {
    const formatted = formatMetricValue(value);
    if (formatted === null) {
      continue;
    }
    parts.push(`${formatMetricKey(key)}=${formatted}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function emitRestartTrace(
  name: string,
  durationMs: number,
  totalMs: number,
  metrics?: RestartTraceMetrics,
) {
  restartTraceLog.info(
    `restart trace: ${name} ${durationMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms${formatMetrics(metrics)}`,
  );
}

function emitRestartTraceDetail(name: string, metrics: RestartTraceMetrics): void {
  const formatted = formatMetrics(metrics).trim();
  if (!formatted) {
    return;
  }
  restartTraceLog.info(`restart trace: ${name} ${formatted}`);
}

/** 当 OPENCLAW_GATEWAY_RESTART_TRACE 启用时启动一个 restart trace 序列。 */
export function startGatewayRestartTrace(name: string, metrics?: RestartTraceMetrics): void {
  if (!isRestartTraceEnabled()) {
    active = false;
    return;
  }
  const now = nowMs();
  startedAt = now;
  lastAt = now;
  active = true;
  emitRestartTrace(name, 0, 0, metrics);
}

function isGatewayRestartTraceActive(): boolean {
  return isRestartTraceEnabled() && active;
}

/** 自上一个 mark 起发射一个 restart trace mark。 */
export function markGatewayRestartTrace(name: string, metrics?: RestartTraceMetrics): void {
  if (!isGatewayRestartTraceActive()) {
    return;
  }
  const now = nowMs();
  emitRestartTrace(name, now - lastAt, now - startedAt, metrics);
  lastAt = now;
}

/** 发射最终 restart trace mark 并停用追踪。 */
export function finishGatewayRestartTrace(name: string, metrics?: RestartTraceMetrics): void {
  markGatewayRestartTrace(name, metrics);
  active = false;
}

/** 围绕 async 或 sync 工作测量一个 restart trace span。 */
export async function measureGatewayRestartTrace<T>(
  name: string,
  run: () => Promise<T> | T,
  metrics?: RestartTraceMetrics | (() => RestartTraceMetrics | undefined),
): Promise<T> {
  if (!isGatewayRestartTraceActive()) {
    return await run();
  }
  const before = nowMs();
  try {
    return await run();
  } finally {
    const now = nowMs();
    emitRestartTrace(
      name,
      now - before,
      now - startedAt,
      typeof metrics === "function" ? metrics() : metrics,
    );
    lastAt = now;
  }
}

/** 针对活动序列记录一个已测量的 restart trace 持续时间。 */
export function recordGatewayRestartTrace(
  name: string,
  durationMs: number,
  metrics?: RestartTraceMetrics,
): void {
  if (!isGatewayRestartTraceActive() || !Number.isFinite(durationMs)) {
    return;
  }
  const now = nowMs();
  emitRestartTrace(name, Math.max(0, durationMs), now - startedAt, metrics);
  lastAt = now;
}

/** 记录一个外部测量的 restart trace span，带有显式总时间。 */
export function recordGatewayRestartTraceSpan(
  name: string,
  durationMs: number,
  totalMs: number,
  metrics?: RestartTraceMetrics,
): void {
  if (!isGatewayRestartTraceActive() || !Number.isFinite(durationMs) || !Number.isFinite(totalMs)) {
    return;
  }
  emitRestartTrace(name, Math.max(0, durationMs), Math.max(0, totalMs), metrics);
}

/** 记录不带持续时间的 restart trace 详情度量。 */
export function recordGatewayRestartTraceDetail(name: string, metrics: RestartTraceMetrics): void {
  if (!isGatewayRestartTraceActive()) {
    return;
  }
  emitRestartTraceDetail(name, metrics);
}

/** 收集进程内存/资源度量用于 restart trace 诊断。 */
export function collectGatewayProcessMemoryUsageMb(): ReadonlyArray<readonly [string, number]> {
  const usage = process.memoryUsage();
  const toMb = (bytes: number) => bytes / 1024 / 1024;
  const metrics: Array<readonly [string, number]> = [
    ["rssMb", toMb(usage.rss)],
    ["heapTotalMb", toMb(usage.heapTotal)],
    ["heapUsedMb", toMb(usage.heapUsed)],
    ["externalMb", toMb(usage.external)],
    ["arrayBuffersMb", toMb(usage.arrayBuffers)],
  ];
  const resources = collectGatewayProcessResourceCounts();
  if (resources) {
    metrics.push(...resources);
  }
  return metrics;
}

function collectGatewayProcessResourceCounts(): ReadonlyArray<readonly [string, number]> | null {
  const processWithResourceAccess = process as NodeJS.Process & {
    _getActiveHandles?: () => unknown[];
    _getActiveRequests?: () => unknown[];
    getActiveResourcesInfo?: () => string[];
  };
  const activeHandles = processWithResourceAccess["_getActiveHandles"]?.();
  const activeRequests = processWithResourceAccess["_getActiveRequests"]?.();
  const activeResources = processWithResourceAccess.getActiveResourcesInfo?.();
  const metrics: Array<readonly [string, number]> = [
    ["processSigintListenersCount", process.listenerCount("SIGINT")],
    ["processSigtermListenersCount", process.listenerCount("SIGTERM")],
    ["processSigusr1ListenersCount", process.listenerCount("SIGUSR1")],
  ];
  if (activeHandles) {
    metrics.push(["activeHandlesCount", activeHandles.length]);
  }
  if (activeRequests) {
    metrics.push(["activeRequestsCount", activeRequests.length]);
  }
  const activeTimersCount = activeResources
    ? countActiveTimersFromResourceInfo(activeResources)
    : activeHandles
      ? countActiveTimersFromHandles(activeHandles)
      : undefined;
  if (activeTimersCount !== undefined) {
    metrics.push(["activeTimersCount", activeTimersCount]);
  }
  return metrics.length > 0 ? metrics : null;
}

function countActiveTimersFromResourceInfo(activeResources: readonly string[]): number {
  return activeResources.filter((resource) => resource === "Timeout" || resource === "Timer")
    .length;
}

function countActiveTimersFromHandles(activeHandles: readonly unknown[]): number {
  let count = 0;
  for (const handle of activeHandles) {
    if (typeof handle !== "object" || handle === null) {
      continue;
    }
    const constructorName = (handle as { constructor?: { name?: string } }).constructor?.name;
    if (constructorName === "Timeout" || constructorName === "Timer") {
      count += 1;
    }
  }
  return count;
}

function normalizeRestartTraceHandoff(value: unknown): GatewayRestartTraceHandoff | null {
  // 交接值来自另一个进程。拒绝陈旧/未来值，使被复用的 shell 环境无法毒化后续重启测量。
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as { startedAt?: unknown; lastAt?: unknown };
  if (
    typeof record.startedAt !== "number" ||
    !Number.isFinite(record.startedAt) ||
    typeof record.lastAt !== "number" ||
    !Number.isFinite(record.lastAt) ||
    record.startedAt <= 0 ||
    record.lastAt < record.startedAt ||
    record.lastAt - record.startedAt > RESTART_TRACE_HANDOFF_MAX_AGE_MS
  ) {
    return null;
  }
  const now = nowMs();
  if (record.startedAt > now || now - record.startedAt > RESTART_TRACE_HANDOFF_MAX_AGE_MS) {
    return null;
  }
  return {
    startedAt: record.startedAt,
    lastAt: record.lastAt,
  };
}

/** 为子替换进程捕获 restart trace 交接状态。 */
export function captureGatewayRestartTraceHandoff(): GatewayRestartTraceHandoff | undefined {
  if (!isGatewayRestartTraceActive()) {
    return undefined;
  }
  return { startedAt, lastAt };
}

/** 构建将 restart trace 交接状态携带到替换进程的 env 变量。 */
export function createGatewayRestartTraceHandoffEnv(
  handoff: GatewayRestartTraceHandoff | undefined = captureGatewayRestartTraceHandoff(),
): NodeJS.ProcessEnv | undefined {
  const normalized = normalizeRestartTraceHandoff(handoff);
  if (!normalized) {
    return undefined;
  }
  return {
    [RESTART_TRACE_HANDOFF_STARTED_AT_ENV]: String(normalized.startedAt),
    [RESTART_TRACE_HANDOFF_LAST_AT_ENV]: String(normalized.lastAt),
  };
}

/** 从已验证的内存交接对象恢复 restart 追踪。 */
export function resumeGatewayRestartTraceFromHandoff(
  handoff: unknown,
  metrics?: RestartTraceMetrics,
): boolean {
  if (!isRestartTraceEnabled() || active) {
    return false;
  }
  const normalized = normalizeRestartTraceHandoff(handoff);
  if (!normalized) {
    return false;
  }
  startedAt = normalized.startedAt;
  lastAt = normalized.lastAt;
  active = true;
  markGatewayRestartTrace("restart.process-resume", metrics);
  return true;
}

/** 从 env 交接变量恢复 restart 追踪，并将它们从 env 中移除。 */
export function resumeGatewayRestartTraceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  metrics?: RestartTraceMetrics,
): boolean {
  const startedRaw = env[RESTART_TRACE_HANDOFF_STARTED_AT_ENV];
  const lastRaw = env[RESTART_TRACE_HANDOFF_LAST_AT_ENV];
  delete env[RESTART_TRACE_HANDOFF_STARTED_AT_ENV];
  delete env[RESTART_TRACE_HANDOFF_LAST_AT_ENV];
  return resumeGatewayRestartTraceFromHandoff(
    {
      startedAt: Number(startedRaw),
      lastAt: Number(lastRaw),
    },
    metrics,
  );
}

/** 重置 restart trace 全局状态（供测试使用）。 */
export function resetGatewayRestartTraceForTest(): void {
  startedAt = 0;
  lastAt = 0;
  active = false;
}
