/**
 * Routing session key 辅助 — 用于构建与规范化 agent-scoped 会话密钥
 *
 * 这些函数从 openclaw/src/routing/session-key.ts 移植，仅包含
 * 不依赖 normalizeSessionKeyPreservingOpaquePeerIds 的子集。
 * 对于 case-preserving peer id 场景，调用方需自行处理后再传入。
 *
 * 参考 openclaw/src/routing/session-key.ts
 */
import {
  parseAgentSessionKey,
  isCronRunSessionKey,
} from "./session-key.js";
import { normalizeOptionalString } from "../infra/string-coerce.js";
import { normalizeAccountId } from "../infra/account-id.js";

export {
  parseAgentSessionKey,
  isCronRunSessionKey,
} from "./session-key.js";
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "../infra/account-id.js";

export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_MAIN_KEY = "main";
export type SessionKeyShape = "missing" | "agent" | "legacy_or_alias" | "malformed_agent";

// Pre-compiled regex
const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function scopedHeartbeatWakeOptions<T extends object>(
  sessionKey: string,
  wakeOptions: T,
  mainKey?: string,
  scope?: "per-sender" | "global",
): T | (T & { sessionKey: string }) | (T & { agentId: string }) {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return wakeOptions;
  }
  if (isCronRunSessionKey(sessionKey)) {
    // 全局作用域 agent 排空字面量 "global" 队列，而非 agent-main；
    // 针对 agent:<id>:main 的定向 wake 无法解析。丢弃 sessionKey 但保留
    // agent 目标，使多 agent 全局作用域配置仍能唤醒发起 agent 的心跳。
    if (scope === "global") {
      return { ...wakeOptions, agentId: parsed.agentId };
    }
    return {
      ...wakeOptions,
      sessionKey: buildAgentMainSessionKey({ agentId: parsed.agentId, mainKey }),
    };
  }
  return { ...wakeOptions, sessionKey };
}

export function resolveEventSessionKey(
  sessionKey: string,
  mainKey?: string,
  scope?: "per-sender" | "global",
): string {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed || !isCronRunSessionKey(sessionKey)) {
    return sessionKey;
  }
  // 全局作用域 agent 通过字面量 "global" 队列入队/排空；agent-main
  // 会将事件滞留在心跳从不查看的队列中。
  if (scope === "global") {
    return "global";
  }
  return buildAgentMainSessionKey({ agentId: parsed.agentId, mainKey });
}

export function normalizeMainKey(value: string | undefined | null): string {
  return normalizeLowercaseStringOrEmpty(value) || DEFAULT_MAIN_KEY;
}

export function toAgentRequestSessionKey(storeKey: string | undefined | null): string | undefined {
  const raw = (storeKey ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseAgentSessionKey(raw)?.rest ?? raw;
}

export function agentSessionKeysMatchByRequestKey(
  left: string | undefined | null,
  right: string | undefined | null,
): boolean {
  const leftRaw = (left ?? "").trim();
  const rightRaw = (right ?? "").trim();
  if (!leftRaw || !rightRaw) {
    return false;
  }
  return (
    leftRaw === rightRaw || toAgentRequestSessionKey(leftRaw) === toAgentRequestSessionKey(rightRaw)
  );
}

/** 规范化到 store 形式（包含 agent: 前缀） */
export function toAgentStoreSessionKey(params: {
  agentId: string;
  requestKey: string | undefined | null;
  mainKey?: string | undefined;
}): string {
  const raw = (params.requestKey ?? "").trim();
  const lowered = normalizeLowercaseStringOrEmpty(raw);
  if (!raw || lowered === DEFAULT_MAIN_KEY) {
    return buildAgentMainSessionKey({ agentId: params.agentId, mainKey: params.mainKey });
  }
  const parsed = parseAgentSessionKey(raw);
  if (parsed) {
    return `agent:${parsed.agentId}:${parsed.rest}`;
  }
  const normalized = lowered;
  if (lowered.startsWith("agent:")) {
    return normalized;
  }
  return `agent:${normalizeAgentId(params.agentId)}:${normalized}`;
}

export function resolveAgentIdFromSessionKey(sessionKey: string | undefined | null): string {
  const parsed = parseAgentSessionKey(sessionKey);
  return normalizeAgentId(parsed?.agentId ?? DEFAULT_AGENT_ID);
}

export function classifySessionKeyShape(sessionKey: string | undefined | null): SessionKeyShape {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return "missing";
  }
  if (parseAgentSessionKey(raw)) {
    return "agent";
  }
  return normalizeLowercaseStringOrEmpty(raw).startsWith("agent:")
    ? "malformed_agent"
    : "legacy_or_alias";
}

export function isUnscopedSessionKeySentinel(sessionKey: string | undefined | null): boolean {
  const lowered = normalizeLowercaseStringOrEmpty(sessionKey);
  return lowered === "global" || lowered === "unknown";
}

export function scopeLegacySessionKeyToAgent(params: {
  agentId?: string | undefined;
  sessionKey?: string | undefined;
  mainKey?: string | undefined;
}): string | undefined {
  const raw = (params.sessionKey ?? "").trim();
  if (!raw) {
    return undefined;
  }
  const agentId = params.agentId?.trim();
  if (!agentId || classifySessionKeyShape(raw) !== "legacy_or_alias") {
    return raw;
  }
  return toAgentStoreSessionKey({
    agentId,
    requestKey: raw,
    mainKey: params.mainKey,
  });
}

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  const normalized = normalizeLowercaseStringOrEmpty(trimmed);
  // 保持 path-safe + shell-friendly。
  if (VALID_ID_RE.test(trimmed)) {
    return normalized;
  }
  // 尽力 fallback：将无效字符折叠为 "-"
  return (
    normalized
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function normalizeOptionalAgentId(value: unknown): string | undefined {
  const trimmed = normalizeOptionalString(value);
  return trimmed ? normalizeAgentId(trimmed) : undefined;
}

export function isValidAgentId(value: string | undefined | null): boolean {
  const trimmed = (value ?? "").trim();
  return Boolean(trimmed) && VALID_ID_RE.test(trimmed);
}

export function sanitizeAgentId(value: string | undefined | null): string {
  return normalizeAgentId(value);
}

export function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.mainKey);
  return `agent:${agentId}:${mainKey}`;
}

export function buildGroupHistoryKey(params: {
  channel: string;
  accountId?: string | null;
  peerKind: "group" | "channel";
  peerId: string;
}): string {
  const channel = normalizeLowercaseStringOrEmpty(params.channel) || "unknown";
  const accountId = normalizeAccountId(params.accountId);
  const peerId = normalizeLowercaseStringOrEmpty(params.peerId) || "unknown";
  return `${channel}:${accountId}:${params.peerKind}:${peerId}`;
}

export function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
  useSuffix?: boolean;
  normalizeThreadId?: (threadId: string) => string;
}): { sessionKey: string; parentSessionKey?: string } {
  const threadId = (params.threadId ?? "").trim();
  if (!threadId) {
    return { sessionKey: params.baseSessionKey, parentSessionKey: undefined };
  }
  const normalizedThread =
    params.normalizeThreadId?.(threadId) ?? normalizeLowercaseStringOrEmpty(threadId);
  const useSuffix = params.useSuffix ?? true;
  const sessionKey = useSuffix
    ? `${params.baseSessionKey}:thread:${normalizedThread}`
    : params.baseSessionKey;
  return { sessionKey, parentSessionKey: params.parentSessionKey };
}
