// 重启哨兵文件管理。
// 移植自 openclaw/src/infra/restart-sentinel.ts（降级实现）。
// 降级说明：openclaw 使用 Kysely/SQLite 状态数据库持久化；
// cross-wms 未移植该模块，这里使用文件 JSON 持久化作为降级实现。
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir, formatCliCommand } from "./_runtime-stubs.js";

const SENTINEL_FILENAME = "restart-sentinel.json";

// ============================================================================
// 类型定义
// ============================================================================

export type RestartSentinelLog = {
  stdoutTail?: string | null;
  stderrTail?: string | null;
  exitCode?: number | null;
};

export type RestartSentinelStep = {
  name: string;
  command: string;
  cwd?: string | null;
  durationMs?: number | null;
  log?: RestartSentinelLog | null;
};

export type RestartSentinelStats = {
  mode?: string;
  root?: string;
  requiresRestart?: boolean;
  handoffId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  steps?: RestartSentinelStep[];
  reason?: string | null;
  durationMs?: number | null;
};

export type RestartSentinelContinuation =
  | {
      kind: "systemEvent";
      text: string;
    }
  | {
      kind: "agentTurn";
      message: string;
    };

export type RestartSentinelPayload = {
  kind: "config-apply" | "config-auto-recovery" | "config-patch" | "update" | "restart";
  status: "ok" | "error" | "skipped";
  ts: number;
  sessionKey?: string;
  /** 重启时捕获的投递上下文，确保渠道路由在重启后保留。 */
  deliveryContext?: {
    channel?: string;
    to?: string;
    accountId?: string;
  };
  /** 用于回复线程的线程 ID（例如 Slack thread_ts）。 */
  threadId?: string;
  message?: string | null;
  continuation?: RestartSentinelContinuation | null;
  doctorHint?: string | null;
  stats?: RestartSentinelStats | null;
};

export type RestartSentinel = {
  version: 1;
  payload: RestartSentinelPayload;
};

// ============================================================================
// 路径解析
// ============================================================================

/** 解析哨兵文件路径 */
export function resolveRestartSentinelPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), SENTINEL_FILENAME);
}

// ============================================================================
// 命令格式化与 continuation
// ============================================================================

/** 格式化 doctor 非交互式提示 */
export function formatDoctorNonInteractiveHint(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  return `Recommended follow-up: run ${formatCliCommand(
    "openclaw doctor --non-interactive",
    env,
  )} in a terminal or approvals-capable OpenClaw surface.`;
}

/** 构建重启成功的 continuation */
export function buildRestartSuccessContinuation(params: {
  sessionKey?: string;
  continuationMessage?: string | null;
}): RestartSentinelContinuation | null {
  const message = params.continuationMessage?.trim();
  if (message) {
    return { kind: "agentTurn", message };
  }
  return null;
}

// ============================================================================
// 文件持久化（降级实现）
// ============================================================================

function writeSentinelFile(payload: RestartSentinelPayload, env: NodeJS.ProcessEnv): void {
  const sentinelPath = resolveRestartSentinelPath(env);
  const dir = path.dirname(sentinelPath);
  fs.mkdirSync(dir, { recursive: true });
  const sentinel: RestartSentinel = { version: 1, payload };
  fs.writeFileSync(sentinelPath, JSON.stringify(sentinel, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

function readSentinelFile(env: NodeJS.ProcessEnv): RestartSentinel | null {
  const sentinelPath = resolveRestartSentinelPath(env);
  try {
    const content = fs.readFileSync(sentinelPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed as RestartSentinel).version === 1 &&
      (parsed as RestartSentinel).payload
    ) {
      return parsed as RestartSentinel;
    }
    return null;
  } catch {
    return null;
  }
}

function removeSentinelFile(env: NodeJS.ProcessEnv): void {
  const sentinelPath = resolveRestartSentinelPath(env);
  try {
    fs.unlinkSync(sentinelPath);
  } catch {
    // 忽略：文件不存在
  }
}

// ============================================================================
// payload-based API（用于 update 集群）
// ============================================================================

/**
 * 写入重启哨兵 payload。
 * 降级实现：使用文件 JSON 持久化代替 openclaw 的 Kysely/SQLite 状态数据库。
 */
export async function writeRestartSentinel(
  payload: RestartSentinelPayload,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  writeSentinelFile(payload, env);
}

/** 读取重启哨兵 */
export async function readRestartSentinel(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RestartSentinel | null> {
  return readSentinelFile(env);
}

/** 清除重启哨兵 */
export async function clearRestartSentinel(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  removeSentinelFile(env);
}

/** 检查重启哨兵是否存在 */
export async function hasRestartSentinel(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const sentinelPath = resolveRestartSentinelPath(env);
  try {
    return fs.statSync(sentinelPath).isFile();
  } catch {
    return false;
  }
}

/**
 * 标记挂起的更新重启哨兵为失败。
 * 如果当前哨兵不是 update 类型，返回 null。
 */
export async function markUpdateRestartSentinelFailure(
  reason: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RestartSentinel | null> {
  const current = await readRestartSentinel(env);
  if (!current || current.payload.kind !== "update") {
    return null;
  }
  const payloadWithoutContinuation = { ...current.payload };
  delete payloadWithoutContinuation.continuation;
  const stats = payloadWithoutContinuation.stats
    ? { ...payloadWithoutContinuation.stats }
    : {};
  stats.reason = reason;
  const nextPayload: RestartSentinelPayload = {
    ...payloadWithoutContinuation,
    status: "error",
    stats,
  };
  writeSentinelFile(nextPayload, env);
  return { version: 1, payload: nextPayload };
}

// ============================================================================
// 消息格式化
// ============================================================================

/** 格式化重启哨兵消息 */
export function formatRestartSentinelMessage(payload: RestartSentinelPayload): string {
  const message = payload.message?.trim();
  if (message && (!payload.stats || payload.kind === "config-auto-recovery")) {
    return message;
  }
  const lines: string[] = [summarizeRestartSentinel(payload)];
  if (message) {
    lines.push(message);
  }
  const reason = payload.stats?.reason?.trim();
  if (reason && reason !== message) {
    lines.push(`Reason: ${reason}`);
  }
  if (payload.doctorHint?.trim()) {
    lines.push(payload.doctorHint.trim());
  }
  return lines.join("\n");
}

function isRestartRequiredConfigWriteSentinel(payload: RestartSentinelPayload): boolean {
  return (
    (payload.kind === "config-apply" || payload.kind === "config-patch") &&
    payload.status === "ok" &&
    payload.stats?.requiresRestart === true
  );
}

/** 汇总重启哨兵为一行描述 */
export function summarizeRestartSentinel(payload: RestartSentinelPayload): string {
  if (payload.kind === "config-auto-recovery") {
    return "Gateway auto-recovery";
  }
  if (isRestartRequiredConfigWriteSentinel(payload)) {
    const mode = payload.stats?.mode ? ` (${payload.stats.mode})` : "";
    return `Gateway restart required${mode}`.trim();
  }
  const kind = payload.kind;
  const status = payload.status;
  const mode = payload.stats?.mode ? ` (${payload.stats.mode})` : "";
  const kindSegment = kind === "restart" ? "" : ` ${kind}`;
  return `Gateway restart${kindSegment} ${status}${mode}`.trim();
}

/** 裁剪日志尾部 */
export function trimLogTail(input?: string | null, maxChars = 8000) {
  if (!input) {
    return null;
  }
  const text = input.trimEnd();
  if (text.length <= maxChars) {
    return text;
  }
  return `…${text.slice(text.length - maxChars)}`;
}

// ============================================================================
// 异步文件 API（供需要 await 的调用方使用）
// ============================================================================

/** 异步读取哨兵并返回 payload（不存在返回 null） */
export async function readRestartSentinelPayload(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RestartSentinelPayload | null> {
  return (await readRestartSentinel(env))?.payload ?? null;
}
