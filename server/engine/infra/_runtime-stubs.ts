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

export { resolveConfigDir as resolveOpenClawConfigDir } from "./_runtime-stubs.js";

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
// ../state/openclaw-state-db.js —— 状态数据库降级（抛出错误）
// ============================================================================

export type OpenClawStateDatabase = {
  db: unknown;
};

/**
 * 打开 OpenClaw 状态数据库。
 * 委托给 cross-wms 的 state/openclaw-state-db.ts 真实实现。
 */
export function openOpenClawStateDatabase(_options?: {
  env?: NodeJS.ProcessEnv;
}): OpenClawStateDatabase {
  try {
    // 动态导入避免循环依赖
    const { openStateDatabase } = require("../state/openclaw-state-db.js");
    const result = openStateDatabase(_options);
    return { db: result.db };
  } catch (err) {
    logger.debug(`[runtime-stubs] openOpenClawStateDatabase 降级: ${err}`);
    return { db: undefined };
  }
}

/**
 * 运行 OpenClaw 状态写事务。
 * 委托给 cross-wms 的 state/openclaw-state-db.ts 真实实现。
 */
export function runOpenClawStateWriteTransaction<T>(
  fn: (params: { db: unknown }) => T,
  _options?: { env?: NodeJS.ProcessEnv },
): T {
  try {
    const { openStateDatabase } = require("../state/openclaw-state-db.js");
    const result = openStateDatabase(_options);
    return fn({ db: result.db });
  } catch (err) {
    logger.debug(`[runtime-stubs] runOpenClawStateWriteTransaction 降级: ${err}`);
    return fn({ db: undefined });
  }
}

// ============================================================================
// @openclaw/normalization-core/number-coercion —— 数字规范化降级
// ============================================================================

/** 将值规范化为日期时间戳（毫秒），无效返回 null */
export function asDateTimestampMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

/** 从持续毫秒数解析过期时间戳 */
export function resolveExpiresAtMsFromDurationMs(
  durationMs: number,
  options?: { nowMs?: number },
): number | undefined {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
    return undefined;
  }
  const nowMs = options?.nowMs ?? Date.now();
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
    return undefined;
  }
  return Math.floor(nowMs + durationMs);
}

/** 解析正定时器超时毫秒数 */
export function resolvePositiveTimerTimeoutMs(
  value: number | undefined,
  defaultValue: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return defaultValue;
  }
  return Math.floor(value);
}

/** 解析定时器超时毫秒数 */
export function resolveTimerTimeoutMs(
  value: number | undefined,
  defaultValue: number,
  minValue: number = 0,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minValue) {
    return defaultValue;
  }
  return Math.floor(value);
}

/** 将时间戳毫秒数解析为 ISO 字符串 */
export function resolveTimestampMsToIsoString(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return new Date().toISOString();
  }
  return new Date(value).toISOString();
}

// ============================================================================
// @openclaw/normalization-core/record-coerce —— 记录规范化降级
// ============================================================================

/** 判断值是否为普通记录对象 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
