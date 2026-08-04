/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

/**
 * 共享运行时 stub — 为移植自 openclaw 的 infra 模块提供 openclaw 运行时依赖的降级实现。
 *
 * 设计原则：
 *  - 子系统日志器降级为 cross-wms 的 pino logger
 *  - 路径解析降级为基于 HOME 的默认目录
 *  - OpenClawConfig 运行时依赖降级为 unknown 占位
 *  - 数据库/状态相关 API 降级为抛出明确错误，避免静默失败
 *
 * 参考 openclaw/src/{logging/subsystem.js, config/paths.js, config/types.openclaw.js}
 */

import os from "node:os";
import path from "node:path";

import { logger as rootLogger } from "../../logger.js";

// 创建一个子系统日志器
const logger = rootLogger.child({ module: "runtime-stubs" });

// ============================================================================
// ../logging/subsystem.js —— 子系统日志器降级
// ============================================================================

// ProxyConfig type stub
export type ProxyConfig = {
  enabled?: boolean;
  url?: string;
  proxyUrl?: string;
  loopbackMode?: boolean;
};

export type SubsystemLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

/**
 * 创建子系统日志器。
 * 降级实现：使用 cross-wms 的 pino logger，保留子系统标签前缀。
 */
export function createSubsystemLogger(subsystem: string): SubsystemLogger {
  const child = rootLogger.child({ subsystem });
  return {
    debug: (message, meta) => child.debug(meta ?? {}, message),
    info: (message, meta) => child.info(meta ?? {}, message),
    warn: (message, meta) => child.warn(meta ?? {}, message),
    error: (message, meta) => child.error(meta ?? {}, message),
  };
}

// ============================================================================
// ../config/paths.js —— 路径解析降级
// ============================================================================

/** cross-wms 默认 home 目录（openclaw 的 ../config/paths.js 中导出） */
export function resolveRequiredHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  fallback: () => string = os.homedir,
): string {
  const home = env.HOME ?? env.USERPROFILE ?? fallback();
  if (!home) {
    throw new Error("Unable to resolve home directory");
  }
  return home;
}

/** 解析 OpenClaw 状态目录（openclaw 的 ../config/paths.js 中导出） */
export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENCLAW_STATE_DIR) {
    return path.resolve(env.OPENCLAW_STATE_DIR);
  }
  return path.join(resolveRequiredHomeDir(env), ".openclaw");
}

/** 解析 OpenClaw 配置目录（openclaw 的 ../utils.js 中导出） */
export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENCLAW_CONFIG_DIR) {
    return path.resolve(env.OPENCLAW_CONFIG_DIR);
  }
  if (env.XDG_CONFIG_HOME) {
    return path.join(env.XDG_CONFIG_HOME, "openclaw");
  }
  return path.join(resolveRequiredHomeDir(env), ".config", "openclaw");
}

/** 解析 OpenClaw 配置文件路径 */
export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir?: string,
): string {
  const dir = stateDir ?? resolveStateDir(env);
  return path.join(dir, "config.json");
}

/** 解析 gateway lock 目录 */
export function resolveGatewayLockDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENCLAW_GATEWAY_LOCK_DIR) {
    return path.resolve(env.OPENCLAW_GATEWAY_LOCK_DIR);
  }
  return path.join(resolveStateDir(env), "run");
}

// ============================================================================
// ../config/types.openclaw.js —— OpenClawConfig 类型降级
// ============================================================================

/**
 * OpenClawConfig 降级类型。
 * cross-wms 不依赖完整的 OpenClawConfig，这里提供 unknown 占位。
 */
export type OpenClawConfig = Record<string, unknown>;

/** 降级的 OpenClawConfig 默认值（空对象） */
export const DEFAULT_OPENCLAW_CONFIG: OpenClawConfig = {};

/**
 * 默认运行时 stub。
 * 降级实现：提供子系统日志器的降级方法。
 */
export const defaultRuntime: {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
} = {
  debug: (message: string) => rootLogger.debug({ subsystem: "runtime" }, message),
  info: (message: string) => rootLogger.info({ subsystem: "runtime" }, message),
  warn: (message: string) => rootLogger.warn({ subsystem: "runtime" }, message),
  error: (message: string) => rootLogger.error({ subsystem: "runtime" }, message),
};

// ============================================================================
// ../utils.js —— resolveConfigDir 占位（与 _openclaw-stubs.ts 中重复，这里保留兼容）
// ============================================================================

export { resolveConfigDir as resolveOpenClawConfigDir };

// ============================================================================
// ../shared/pid-alive.js —— PID 存活检测降级
// ============================================================================

import fs from "node:fs";

/** 检测 PID 是否存活（openclaw 的 ../shared/pid-alive.js 中导出） */
export function isPidAlive(pid: number): boolean {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// ../version.js —— 版本解析降级
// ============================================================================

/** 解析运行时服务版本（openclaw 的 ../version.js 中导出） */
export function resolveRuntimeServiceVersion(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OPENCLAW_VERSION as string | undefined) ?? "0.0.0";
}

// ============================================================================
// ../cli/command-format.js —— CLI 命令格式化降级
// ============================================================================

/** 格式化 CLI 命令（openclaw 的 ../cli/command-format.js 中导出） */
export function formatCliCommand(command: string, _env?: NodeJS.ProcessEnv): string {
  return command;
}

// ============================================================================
// ../state/openclaw-state-db.js —— 状态数据库（直接复用真实实现）
// ============================================================================
// 直接 import 真实实现，不再使用 try/catch 降级包装。
// 真实实现在 ../state/openclaw-state-db.ts，提供带缓存的 SQLite 连接管理。
import {
  openOpenClawStateDatabase as openOpenClawStateDatabaseImpl,
  runOpenClawStateWriteTransaction as runOpenClawStateWriteTransactionImpl,
  type OpenClawStateDatabase as OpenClawStateDatabaseImpl,
  type OpenClawStateDatabaseOptions as OpenClawStateDatabaseOptionsImpl,
} from "../state/openclaw-state-db.js";

export type OpenClawStateDatabase = OpenClawStateDatabaseImpl;
export type OpenClawStateDatabaseOptions = OpenClawStateDatabaseOptionsImpl;

/** 打开 OpenClaw 状态数据库（直接委托真实实现）。 */
export function openOpenClawStateDatabase(
  options?: OpenClawStateDatabaseOptions,
): OpenClawStateDatabase {
  return openOpenClawStateDatabaseImpl(options ?? {});
}

/** 运行 OpenClaw 状态写事务（直接委托真实实现）。 */
export function runOpenClawStateWriteTransaction<T>(
  fn: (database: OpenClawStateDatabase) => T,
  options?: OpenClawStateDatabaseOptions,
): T {
  return runOpenClawStateWriteTransactionImpl<T>(fn, options ?? {});
}

// ============================================================================
// @cdf-know/normalization-core/number-coercion —— 数字规范化（完整移植）
// 移植自 openclaw/packages/normalization-core/src/number-coercion.ts
// ============================================================================

/** Returns a number only when the input is already finite. */
export function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Returns a finite number only when it satisfies the supplied inclusive/exclusive bounds. */
export function asFiniteNumberInRange(
  value: unknown,
  range: {
    min?: number;
    max?: number;
    minExclusive?: boolean;
    maxExclusive?: boolean;
  },
): number | undefined {
  const number = asFiniteNumber(value);
  if (number === undefined) {
    return undefined;
  }
  if (range.min !== undefined) {
    if (range.minExclusive ? number <= range.min : number < range.min) {
      return undefined;
    }
  }
  if (range.max !== undefined) {
    if (range.maxExclusive ? number >= range.max : number > range.max) {
      return undefined;
    }
  }
  return number;
}

/** Returns a safe integer only when it satisfies the supplied inclusive bounds. */
export function asSafeIntegerInRange(
  value: unknown,
  range: {
    min?: number;
    max?: number;
  },
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return undefined;
  }
  if (range.min !== undefined && value < range.min) {
    return undefined;
  }
  if (range.max !== undefined && value > range.max) {
    return undefined;
  }
  return value;
}

function normalizeNumericString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Parses finite numbers from number values or strict numeric string tokens. */
export function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  return parseStrictFiniteNumber(value);
}

/** Parses only safe integer numbers or base-10 integer strings. */
export function parseStrictInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeNumericString(value);
  if (!normalized || !/^[+-]?\d+$/.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Parses only finite decimal/scientific string tokens, rejecting partial numbers. */
export function parseStrictFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeNumericString(value);
  if (!normalized || !/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Returns positive safe integers without string coercion. */
export function asPositiveSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Conservative upper bound for Node timer delays. */
export const MAX_TIMER_TIMEOUT_MS = 2_147_000_000;
/** Timer bound expressed in whole seconds for env/config inputs. */
export const MAX_TIMER_TIMEOUT_SECONDS = Math.floor(MAX_TIMER_TIMEOUT_MS / 1000);
/** Largest timestamp accepted by JavaScript Date. */
export const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000;
/** Fallback ISO value for invalid timestamp inputs. */
export const UNIX_EPOCH_ISO_STRING = "1970-01-01T00:00:00.000Z";

/** Returns a Date-valid millisecond timestamp. */
export function asDateTimestampMs(value: unknown): number | undefined {
  return asFiniteNumberInRange(value, {
    min: -MAX_DATE_TIMESTAMP_MS,
    max: MAX_DATE_TIMESTAMP_MS,
  });
}

/** Checks whether a Date-valid timestamp is after the supplied/current time. */
export function isFutureDateTimestampMs(
  value: unknown,
  opts: { nowMs?: number } = {},
): value is number {
  const timestampMs = asDateTimestampMs(value);
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  return timestampMs !== undefined && nowMs !== undefined && timestampMs > nowMs;
}

/** Converts Date-valid millisecond timestamps to ISO strings. */
export function timestampMsToIsoString(value: unknown): string | undefined {
  const timestampMs = asDateTimestampMs(value);
  return timestampMs === undefined ? undefined : new Date(timestampMs).toISOString();
}

/** Resolves a Date-valid timestamp with a Date-valid fallback. */
export function resolveDateTimestampMs(
  value: unknown,
  fallbackValue: unknown = Date.now(),
): number {
  return asDateTimestampMs(value) ?? asDateTimestampMs(fallbackValue) ?? 0;
}

/** Resolves a Date-valid timestamp to ISO, falling back to Unix epoch if needed. */
export function resolveTimestampMsToIsoString(
  value: unknown,
  fallbackValue: unknown = Date.now(),
): string {
  return (
    timestampMsToIsoString(value) ?? timestampMsToIsoString(fallbackValue) ?? UNIX_EPOCH_ISO_STRING
  );
}

/** Formats Date-valid timestamps for filenames by replacing colon separators. */
export function timestampMsToIsoFileStamp(
  value: unknown,
  fallbackValue: unknown = Date.now(),
): string {
  return resolveTimestampMsToIsoString(value, fallbackValue).replaceAll(":", "-");
}

/** Clamps finite millisecond values into the Node-safe timer range. */
export function clampTimerTimeoutMs(valueMs: unknown, minMs = 1): number | undefined {
  const value = asFiniteNumber(valueMs);
  if (value === undefined) {
    return undefined;
  }
  const min = Math.max(1, Math.floor(minMs));
  return Math.min(Math.max(Math.floor(value), min), MAX_TIMER_TIMEOUT_MS);
}

/** Clamps positive finite millisecond values into the Node-safe timer range. */
export function clampPositiveTimerTimeoutMs(valueMs: unknown): number | undefined {
  const value = asFiniteNumber(valueMs);
  if (value === undefined || value <= 0) {
    return undefined;
  }
  return clampTimerTimeoutMs(value);
}

/** Resolves a positive timer timeout or falls back through safe timer clamping. */
export function resolvePositiveTimerTimeoutMs(valueMs: unknown, fallbackMs: number): number {
  return clampPositiveTimerTimeoutMs(valueMs) ?? resolveTimerTimeoutMs(fallbackMs, 1);
}

/** Resolves arbitrary timeout input with fallback and minimum timer bounds. */
export function resolveTimerTimeoutMs(valueMs: unknown, fallbackMs: number, minMs = 1): number {
  const value = asFiniteNumber(valueMs) ?? asFiniteNumber(fallbackMs);
  const min = Math.max(0, Math.floor(minMs));
  if (value === undefined) {
    return min;
  }
  return Math.min(Math.max(Math.floor(value), min), MAX_TIMER_TIMEOUT_MS);
}

/** Adds grace time to a finite timeout and clamps the result to Node-safe bounds. */
export function addTimerTimeoutGraceMs(timeoutMs: unknown, graceMs = 5_000): number | undefined {
  const timeout = asFiniteNumber(timeoutMs);
  const grace = asFiniteNumber(graceMs);
  if (timeout === undefined || grace === undefined) {
    return undefined;
  }
  const withGrace = timeout + grace;
  return Number.isFinite(withGrace) ? clampTimerTimeoutMs(withGrace) : MAX_TIMER_TIMEOUT_MS;
}

/** Converts finite positive seconds to Node-safe milliseconds. */
export function finiteSecondsToTimerSafeMilliseconds(
  value: unknown,
  opts: { floorSeconds?: boolean } = {},
): number | undefined {
  const seconds = asFiniteNumber(value);
  if (seconds === undefined || seconds <= 0) {
    return undefined;
  }
  const boundedSeconds = opts.floorSeconds ? Math.floor(seconds) : seconds;
  const milliseconds = Math.floor(boundedSeconds * 1000);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return undefined;
  }
  return Math.min(milliseconds, MAX_TIMER_TIMEOUT_MS);
}

/** Resolves an integer option from finite numeric input or fallback, then clamps bounds. */
export function resolveIntegerOption(
  value: unknown,
  fallback: number,
  range: {
    min?: number;
    max?: number;
  } = {},
): number {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const floored = Math.floor(candidate);
  const minBounded = range.min === undefined ? floored : Math.max(range.min, floored);
  return range.max === undefined ? minBounded : Math.min(range.max, minBounded);
}

/** Resolves an optional integer option, returning undefined for non-finite input. */
export function resolveOptionalIntegerOption(
  value: unknown,
  range: {
    min?: number;
    max?: number;
  } = {},
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return resolveIntegerOption(value, value, range);
}

/** Resolves an integer option with a non-negative lower bound. */
export function resolveNonNegativeIntegerOption(value: unknown, fallback: number): number {
  return resolveIntegerOption(value, fallback, { min: 0 });
}

/** Parses strict positive integer values from numbers or strings. */
export function parseStrictPositiveInteger(value: unknown): number | undefined {
  const parsed = parseStrictInteger(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

/** Parses strict non-negative integer values from numbers or strings. */
export function parseStrictNonNegativeInteger(value: unknown): number | undefined {
  const parsed = parseStrictInteger(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

/** Converts strict positive seconds to safe millisecond counts. */
export function positiveSecondsToSafeMilliseconds(value: unknown): number | undefined {
  const seconds = parseStrictPositiveInteger(value);
  if (seconds === undefined) {
    return undefined;
  }
  const milliseconds = seconds * 1000;
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

/** Converts strict non-negative seconds to safe millisecond counts. */
export function nonNegativeSecondsToSafeMilliseconds(value: unknown): number | undefined {
  const seconds = parseStrictNonNegativeInteger(value);
  if (seconds === undefined) {
    return undefined;
  }
  const milliseconds = seconds * 1000;
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

/** Resolves an absolute expiration timestamp from a positive duration in milliseconds. */
export function resolveExpiresAtMsFromDurationMs(
  value: unknown,
  opts: { nowMs?: number; bufferMs?: number; minRemainingMs?: number } = {},
): number | undefined {
  const durationMs = asPositiveSafeInteger(value);
  if (durationMs === undefined) {
    return undefined;
  }
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  const bufferMs = asFiniteNumber(opts.bufferMs ?? 0);
  if (nowMs === undefined || bufferMs === undefined) {
    return undefined;
  }
  const expiresAt = nowMs + durationMs - bufferMs;
  if (!Number.isSafeInteger(expiresAt) || timestampMsToIsoString(expiresAt) === undefined) {
    return undefined;
  }
  const minRemainingMs = opts.minRemainingMs;
  if (minRemainingMs === undefined) {
    return expiresAt;
  }
  const minExpiresAt = nowMs + minRemainingMs;
  if (!Number.isSafeInteger(minExpiresAt) || timestampMsToIsoString(minExpiresAt) === undefined) {
    return expiresAt;
  }
  return Math.max(expiresAt, minExpiresAt);
}

/** Resolves an absolute expiration timestamp from a positive duration in seconds. */
export function resolveExpiresAtMsFromDurationSeconds(
  value: unknown,
  opts: { nowMs?: number; bufferMs?: number; minRemainingMs?: number } = {},
): number | undefined {
  const durationMs = positiveSecondsToSafeMilliseconds(value);
  return durationMs === undefined ? undefined : resolveExpiresAtMsFromDurationMs(durationMs, opts);
}

/** Resolves an absolute expiration timestamp from Unix epoch seconds. */
export function resolveExpiresAtMsFromEpochSeconds(
  value: unknown,
  opts: { bufferMs?: number; maxMs?: number } = {},
): number | undefined {
  const epochMs =
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.trunc(value) * 1000
      : positiveSecondsToSafeMilliseconds(value);
  if (epochMs === undefined) {
    return undefined;
  }
  const expiresAt = epochMs - (opts.bufferMs ?? 0);
  if (!Number.isSafeInteger(expiresAt)) {
    return undefined;
  }
  if (timestampMsToIsoString(expiresAt) === undefined) {
    return undefined;
  }
  const maxMs = opts.maxMs;
  return maxMs === undefined || expiresAt <= maxMs ? expiresAt : undefined;
}

/** Resolves expiration input that may be relative seconds, epoch seconds, or epoch milliseconds. */
export function resolveExpiresAtMsFromDurationOrEpoch(
  value: unknown,
  opts: {
    nowMs?: number;
    relativeSecondsThreshold?: number;
    absoluteMillisecondsThreshold?: number;
  } = {},
): number | undefined {
  const parsed = parseStrictPositiveInteger(value);
  if (parsed === undefined) {
    return undefined;
  }
  const relativeSecondsThreshold = opts.relativeSecondsThreshold ?? 1_000_000_000;
  if (parsed < relativeSecondsThreshold) {
    return resolveExpiresAtMsFromDurationSeconds(parsed, { nowMs: opts.nowMs });
  }
  const absoluteMillisecondsThreshold = opts.absoluteMillisecondsThreshold ?? 1_000_000_000_000;
  if (parsed < absoluteMillisecondsThreshold) {
    return resolveExpiresAtMsFromEpochSeconds(parsed);
  }
  return asDateTimestampMs(parsed);
}
// ============================================================================
// @cdf-know/normalization-core/record-coerce —— 记录规范化（完整移植）
// 移植自 openclaw/packages/normalization-core/src/record-coerce.ts
// ============================================================================

/** Type guard for non-array object records at browser-safe boundaries. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Coerces object-like values to records, falling back to an empty record. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** Reads a field only when it exists as a string. */
export function readStringField(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

/** Returns a non-array record or undefined. */
export function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** Returns a non-array record or null. */
export function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/** Returns any object-backed record, including arrays, or undefined. */
export function asOptionalObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/** Returns any object-backed record, including arrays, or null. */
export function asNullableObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
// ============================================================================
// 文件系统辅助 —— 安全读取 JSON
// ============================================================================

/** 同步读取 JSON 文件（不存在返回 null） */
export function tryReadJsonFileSync<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** 同步写入 JSON 文件 */
export function writeJsonFileSync(
  filePath: string,
  value: unknown,
  options?: { mode?: number; trailingNewline?: boolean },
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  let content = JSON.stringify(value, null, 2);
  if (options?.trailingNewline) {
    content += "\n";
  }
  fs.writeFileSync(filePath, content, {
    encoding: "utf-8",
    mode: options?.mode ?? 0o600,
  });
}
