/**
 * 移植自 openclaw/src/agents/tools/sessions-helpers.ts
 *
 * Shared session-tool data shapes and classification helpers.
 * cross-wms 简化实现：提供基本的 session 分类和 channel 解析。
 */

type SessionKind = "main" | "group" | "cron" | "hook" | "node" | "other";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Coarse session category used by session list/status tools. */
export type { SessionKind };

/** Compact run status shown by session tools. */
export type SessionRunStatus = "running" | "done" | "failed" | "killed" | "timeout";

/** Normalized session row returned by session list-style tools. */
export type SessionListRow = {
  key: string;
  agentId?: string;
  kind: SessionKind;
  channel: string;
  spawnedBy?: string;
  label?: string;
  displayName?: string;
  parentSessionKey?: string;
  updatedAt?: number | null;
  sessionId?: string;
  model?: string;
  status?: SessionRunStatus;
  startedAt?: number;
  endedAt?: number;
  runtimeMs?: number;
  childSessions?: string[];
};

/** Resolves config and sandbox visibility context for a session tool call. */
export function resolveSessionToolContext(opts?: {
  agentSessionKey?: string;
  sandboxed?: boolean;
  config?: unknown;
}) {
  return {
    cfg: opts?.config ?? {},
    sandboxed: opts?.sandboxed ?? false,
    agentSessionKey: opts?.agentSessionKey,
  };
}

/** Classifies a session key/gateway kind into the row category used by tools. */
export function classifySessionKind(params: {
  key: string;
  gatewayKind?: string | null;
  alias: string;
  mainKey: string;
}): SessionKind {
  const key = params.key;
  if (key === params.alias || key === params.mainKey) {
    return "main";
  }
  if (key.startsWith("cron:")) {
    return "cron";
  }
  if (key.startsWith("hook:")) {
    return "hook";
  }
  if (key.startsWith("node-") || key.startsWith("node:")) {
    return "node";
  }
  if (params.gatewayKind === "group") {
    return "group";
  }
  if (key.includes(":group:") || key.includes(":channel:")) {
    return "group";
  }
  return "other";
}

/** Derives the best channel label for a session row. */
export function deriveChannel(params: {
  key: string;
  kind: SessionKind;
  channel?: string | null;
  lastChannel?: string | null;
}): string {
  if (params.kind === "cron" || params.kind === "hook" || params.kind === "node") {
    return "internal";
  }
  const channel = normalizeOptionalString(params.channel ?? undefined);
  if (channel) {
    return channel;
  }
  const lastChannel = normalizeOptionalString(params.lastChannel ?? undefined);
  if (lastChannel) {
    return lastChannel;
  }
  const parts = params.key.split(":").filter(Boolean);
  if (parts.length >= 3 && (parts[1] === "group" || parts[1] === "channel")) {
    return parts[0];
  }
  return "unknown";
}
