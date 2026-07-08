/**
 * ACP Persistent Bindings - Resolve
 * 持久绑定解析（openclaw 兼容）
 *
 * 参考 openclaw/src/acp/persistent-bindings.resolve.ts 设计
 */

import { createHash } from "node:crypto";
import type {
  ConfiguredAcpBindingSpec,
  ConfiguredAcpBindingChannel,
  AcpBindingConfigShape,
  AcpRuntimeSessionMode,
  ResolvedConfiguredAcpBinding,
  SessionBindingRecord,
  BindingResolveResult,
} from "./persistentBindingsTypes.js";

/** 标准化字符串（去除空白） */
export function normalizeText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

/** 标准化小写字符串 */
export function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value === "string") {
    return value.toLowerCase().trim();
  }
  return "";
}

/** 标准化可选小写字符串 */
export function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const trimmed = normalizeText(value);
  return trimmed ? trimmed.toLowerCase() : undefined;
}

/** 标准化 account id */
export function normalizeAccountId(accountId: string): string {
  return accountId.trim() || "default";
}

/** 清理 agent id（只保留字母数字下划线横线） */
export function sanitizeAgentId(agentId: string): string {
  return agentId.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-");
}

/** 标准化 binding 模式（默认为 persistent） */
export function normalizeMode(value: unknown): AcpRuntimeSessionMode {
  const raw = normalizeOptionalLowercaseString(value);
  return raw === "oneshot" ? "oneshot" : "persistent";
}

/** 提取支持的 ACP binding config keys */
export function normalizeBindingConfig(raw: unknown): AcpBindingConfigShape {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const shape = raw as AcpBindingConfigShape;
  return {
    mode: shape.mode ? normalizeMode(shape.mode) : undefined,
    cwd: normalizeText(shape.cwd),
    backend: normalizeText(shape.backend),
    label: normalizeText(shape.label),
    acpAgentId: normalizeText(shape.acpAgentId),
    parentConversationId: normalizeText(shape.parentConversationId),
  };
}

/** 构建绑定 hash */
function buildBindingHash(params: {
  channel: ConfiguredAcpBindingChannel;
  accountId: string;
  conversationId: string;
}): string {
  return createHash("sha256")
    .update(`${params.channel}:${params.accountId}:${params.conversationId}`)
    .digest("hex")
    .slice(0, 16);
}

/** 构建稳定的 ACP session key（配置化绑定） */
export function buildConfiguredAcpSessionKey(spec: ConfiguredAcpBindingSpec): string {
  const hash = buildBindingHash({
    channel: spec.channel,
    accountId: spec.accountId,
    conversationId: spec.conversationId,
  });
  return `agent:${sanitizeAgentId(spec.agentId)}:acp:binding:${spec.channel}:${spec.accountId}:${hash}`;
}

/** 解析 session key 回到 channel/account identity */
export function parseConfiguredAcpSessionKey(
  sessionKey: string,
): { channel: ConfiguredAcpBindingChannel; accountId: string } | null {
  const trimmed = sessionKey.trim();
  if (!trimmed.startsWith("agent:")) {
    return null;
  }
  const rest = trimmed.slice(trimmed.indexOf(":") + 1);
  const nextSeparator = rest.indexOf(":");
  if (nextSeparator === -1) {
    return null;
  }
  const tokens = rest.slice(nextSeparator + 1).split(":");
  if (tokens.length !== 5 || tokens[0] !== "acp" || tokens[1] !== "binding") {
    return null;
  }
  const channel = normalizeText(tokens[2]);
  if (!channel) {
    return null;
  }
  return {
    channel,
    accountId: normalizeAccountId(tokens[3] ?? "default"),
  };
}

/** 从 session key 解析 agent id */
function resolveAgentIdFromSessionKey(sessionKey: string): string | undefined {
  const trimmed = sessionKey.trim();
  if (!trimmed.startsWith("agent:")) {
    return undefined;
  }
  const rest = trimmed.slice(7); // "agent:"
  const nextSeparator = rest.indexOf(":");
  if (nextSeparator === -1) {
    return undefined;
  }
  return normalizeText(rest.slice(0, nextSeparator));
}

/** 将配置化绑定规范转换为 session 绑定记录 */
export function toConfiguredAcpBindingRecord(spec: ConfiguredAcpBindingSpec): SessionBindingRecord {
  return {
    bindingId: `config:acp:${spec.channel}:${spec.accountId}:${spec.conversationId}`,
    targetSessionKey: buildConfiguredAcpSessionKey(spec),
    targetKind: "session",
    conversation: {
      channel: spec.channel,
      accountId: spec.accountId,
      conversationId: spec.conversationId,
      parentConversationId: spec.parentConversationId,
    },
    status: "active",
    boundAt: 0,
    metadata: {
      source: "config",
      mode: spec.mode || "persistent",
      agentId: spec.agentId,
      ...(spec.acpAgentId ? { acpAgentId: spec.acpAgentId } : {}),
      label: spec.label,
      ...(spec.backend ? { backend: spec.backend } : {}),
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
    },
  };
}

/** 从 session 绑定记录解析配置化绑定规范 */
export function resolveConfiguredAcpBindingSpecFromRecord(
  record: SessionBindingRecord,
): ConfiguredAcpBindingSpec | null {
  if (record.targetKind !== "session") {
    return null;
  }
  const conversationId = record.conversation.conversationId.trim();
  if (!conversationId) {
    return null;
  }
  const agentId = normalizeText(record.metadata?.agentId) ?? resolveAgentIdFromSessionKey(record.targetSessionKey);
  if (!agentId) {
    return null;
  }
  return {
    channel: record.conversation.channel,
    accountId: normalizeAccountId(record.conversation.accountId),
    conversationId,
    parentConversationId: normalizeText(record.conversation.parentConversationId),
    agentId,
    acpAgentId: normalizeText(record.metadata?.acpAgentId),
    mode: normalizeMode(record.metadata?.mode),
    cwd: normalizeText(record.metadata?.cwd),
    backend: normalizeText(record.metadata?.backend),
    label: normalizeText(record.metadata?.label),
  };
}

/** 将 session 绑定记录转换为解析后的配置化绑定 */
export function toResolvedConfiguredAcpBinding(
  record: SessionBindingRecord,
): ResolvedConfiguredAcpBinding | null {
  const spec = resolveConfiguredAcpBindingSpecFromRecord(record);
  if (!spec) {
    return null;
  }
  return {
    spec,
    record,
  };
}

/** 解析 binding - 主入口 */
export function resolveConfiguredAcpBinding(params: {
  record: SessionBindingRecord;
}): BindingResolveResult {
  const spec = resolveConfiguredAcpBindingSpecFromRecord(params.record);
  if (!spec) {
    return { ok: false, error: "Invalid binding record" };
  }
  return {
    ok: true,
    binding: { spec, record: params.record },
  };
}

/** 检查 session key 是否为配置化 ACP session key */
export function isConfiguredAcpSessionKey(sessionKey: string): boolean {
  return parseConfiguredAcpSessionKey(sessionKey) !== null;
}
