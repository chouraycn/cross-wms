// 移植自 openclaw/src/infra/heartbeat-summary.ts
// 为 CLI 和 UI 显示汇总心跳配置。
//
// 降级策略：源文件依赖多个 openclaw 内部模块：
//  - ../agents/agent-scope.js 的 resolveAgentConfig、resolveDefaultAgentId
//  - ../auto-reply/heartbeat.js 的 DEFAULT_HEARTBEAT_ACK_MAX_CHARS、DEFAULT_HEARTBEAT_EVERY、
//    resolveHeartbeatPrompt
//  - ../cli/parse-duration.js 的 parseDurationMs
//  - ../config/types.agent-defaults.js 的 AgentDefaultsConfig
//  - ../config/types.openclaw.js 的 OpenClawConfig
//  - ../routing/session-key.js 的 normalizeAgentId
// cross-wms 未移植这些模块，此处提供降级常量与内联实现。
import { normalizeOptionalString } from "../string-coerce.js";
import type { OpenClawConfig } from "../_runtime-stubs.js";

type HeartbeatConfig = HeartbeatSummaryConfig;

/** 心跳配置类型（降级，仅保留汇总用到的字段） */
export type HeartbeatSummaryConfig = {
  every?: string;
  prompt?: string;
  target?: string;
  model?: string;
  ackMaxChars?: number;
  timeoutSeconds?: number;
  isolatedSession?: boolean;
  skipWhenBusy?: boolean;
  suppressToolErrorWarnings?: boolean;
  lightContext?: boolean;
  includeReasoning?: boolean;
  activeHours?: {
    start?: string;
    end?: string;
    timezone?: string;
  };
  session?: string;
};

/** 规范化后的心跳配置（单个 agent）。 */
export type HeartbeatSummary = {
  enabled: boolean;
  every: string;
  everyMs: number | null;
  prompt: string;
  target: string;
  model?: string;
  ackMaxChars: number;
};

/** 默认心跳间隔（降级常量，源文件来自 ../auto-reply/heartbeat.js） */
const DEFAULT_HEARTBEAT_EVERY = "30m";

/** 默认心跳 ack 最大字符数（降级常量） */
const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 280;

const DEFAULT_HEARTBEAT_TARGET = "none";

/** 默认心跳 prompt（降级常量） */
const DEFAULT_HEARTBEAT_PROMPT = "";

/**
 * 规范化 agent ID。
 * 降级实现：源文件来自 ../routing/session-key.js，此处提供 trim + 空值回退。
 */
function normalizeAgentId(agentId?: string): string {
  const trimmed = agentId?.trim();
  return trimmed || "default";
}

/**
 * 解析默认 agent ID。
 * 降级实现：源文件来自 ../agents/agent-scope.js，此处从降级 config 中尽力提取。
 */
function resolveDefaultAgentId(cfg: OpenClawConfig): string {
  const agents = cfg.agents as { defaults?: { id?: string }; list?: Array<{ id?: string }> } | undefined;
  const list = agents?.list ?? [];
  if (list.length > 0) {
    const first = list[0]?.id?.trim();
    if (first) {
      return first;
    }
  }
  return agents?.defaults?.id?.trim() || "default";
}

/**
 * 解析 agent 配置。
 * 降级实现：源文件来自 ../agents/agent-scope.js，此处从 list 中按 id 查找。
 */
function resolveAgentConfig(cfg: OpenClawConfig, agentId?: string): { heartbeat?: HeartbeatConfig } | undefined {
  const agents = cfg.agents as { list?: Array<{ id?: string; heartbeat?: HeartbeatConfig }> } | undefined;
  const list = agents?.list ?? [];
  const normalized = normalizeAgentId(agentId);
  return list.find((entry) => normalizeAgentId(entry?.id) === normalized);
}

/**
 * 解析心跳 prompt。
 * 降级实现：源文件来自 ../auto-reply/heartbeat.js 的 resolveHeartbeatPrompt，
 * 此处返回 trim 后的 prompt 或默认空字符串。
 */
function resolveHeartbeatPromptText(prompt?: string): string {
  return normalizeOptionalString(prompt) ?? DEFAULT_HEARTBEAT_PROMPT;
}

/**
 * 解析时长字符串为毫秒。
 * 降级实现：源文件来自 ../cli/parse-duration.js 的 parseDurationMs。
 * 支持 "30m"、"1h"、"90s"、"5000" 等格式，默认单位为分钟。
 */
function parseDurationMs(raw: string, opts?: { defaultUnit?: "m" | "s" | "h" | "ms" }): number {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${raw}`);
  }
  const value = Number(match[1]);
  const unit = (match[2]?.toLowerCase() ?? opts?.defaultUnit ?? "m") as "ms" | "s" | "m" | "h";
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
  };
  return Math.floor(value * multipliers[unit]);
}

function hasExplicitHeartbeatAgents(cfg: OpenClawConfig): boolean {
  const agents = cfg.agents as { list?: Array<{ heartbeat?: unknown }> } | undefined;
  const list = agents?.list ?? [];
  return list.some((entry) => Boolean(entry?.heartbeat));
}

/** 返回心跳调度是否适用于某个 agent。 */
export function isHeartbeatEnabledForAgent(cfg: OpenClawConfig, agentId?: string): boolean {
  const resolvedAgentId = normalizeAgentId(agentId ?? resolveDefaultAgentId(cfg));
  const agents = cfg.agents as
    | { list?: Array<{ id?: string; heartbeat?: unknown }>; defaults?: { heartbeat?: unknown } }
    | undefined;
  const list = agents?.list ?? [];
  const hasExplicit = hasExplicitHeartbeatAgents(cfg);
  if (hasExplicit) {
    return list.some(
      (entry) => Boolean(entry?.heartbeat) && normalizeAgentId(entry?.id) === resolvedAgentId,
    );
  }
  if (agents?.defaults?.heartbeat) {
    return true;
  }
  return resolvedAgentId === resolveDefaultAgentId(cfg);
}

/** 解析心跳间隔字符串为毫秒。 */
export function resolveHeartbeatIntervalMs(
  cfg: OpenClawConfig,
  overrideEvery?: string,
  heartbeat?: HeartbeatConfig,
): number | null {
  const agents = cfg.agents as { defaults?: { heartbeat?: { every?: string } } } | undefined;
  const raw =
    overrideEvery ??
    heartbeat?.every ??
    agents?.defaults?.heartbeat?.every ??
    DEFAULT_HEARTBEAT_EVERY;
  if (!raw) {
    return null;
  }
  const trimmed = normalizeOptionalString(raw) ?? "";
  if (!trimmed) {
    return null;
  }
  let ms: number;
  try {
    ms = parseDurationMs(trimmed, { defaultUnit: "m" });
  } catch {
    return null;
  }
  if (ms <= 0) {
    return null;
  }
  return ms;
}

/** 解析某个 agent 的可用于显示的心跳设置。 */
export function resolveHeartbeatSummaryForAgent(
  cfg: OpenClawConfig,
  agentId?: string,
): HeartbeatSummary {
  const agents = cfg.agents as
    | { defaults?: { heartbeat?: HeartbeatConfig } }
    | undefined;
  const defaults = agents?.defaults?.heartbeat;
  const overrides = agentId ? resolveAgentConfig(cfg, agentId)?.heartbeat : undefined;
  const enabled = isHeartbeatEnabledForAgent(cfg, agentId);

  if (!enabled) {
    return {
      enabled: false,
      every: "disabled",
      everyMs: null,
      prompt: resolveHeartbeatPromptText(defaults?.prompt),
      target: defaults?.target ?? DEFAULT_HEARTBEAT_TARGET,
      model: defaults?.model,
      ackMaxChars: Math.max(0, defaults?.ackMaxChars ?? DEFAULT_HEARTBEAT_ACK_MAX_CHARS),
    };
  }

  const merged = defaults || overrides ? { ...defaults, ...overrides } : undefined;
  const every = merged?.every ?? defaults?.every ?? overrides?.every ?? DEFAULT_HEARTBEAT_EVERY;
  const everyMs = resolveHeartbeatIntervalMs(cfg, undefined, merged);
  const prompt = resolveHeartbeatPromptText(
    merged?.prompt ?? defaults?.prompt ?? overrides?.prompt,
  );
  const target =
    merged?.target ?? defaults?.target ?? overrides?.target ?? DEFAULT_HEARTBEAT_TARGET;
  const model = merged?.model ?? defaults?.model ?? overrides?.model;
  const ackMaxChars = Math.max(
    0,
    merged?.ackMaxChars ??
      defaults?.ackMaxChars ??
      overrides?.ackMaxChars ??
      DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  );

  return {
    enabled: true,
    every,
    everyMs,
    prompt,
    target,
    model,
    ackMaxChars,
  };
}
