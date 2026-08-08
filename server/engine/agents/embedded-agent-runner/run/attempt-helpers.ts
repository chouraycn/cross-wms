// @ts-nocheck
/**
 * attempt-helpers — attempt.ts 的无副作用纯函数提取
 *
 * ⚠️ 设计约束（参考 AGENTS.md Guardrails）：
 *   1. 这里的 helper 必须是纯函数或有限副作用（如 rewriteFile 持久化）。
 *   2. 不要在这里执行 LLM 请求、启动子进程、建立 socket 连接。
 *   3. 新增 helper 必须在生产中直接被 attempt.ts 调用（避免"测试副本"）。
 *
 * 为什么也是 @ts-nocheck？
 *   attempt.ts 依赖 engine/openclaw 大量跨目录 re-export，tsconfig paths 映射
 *   对这些 import 成员（loadSessionEntry / resolveQuotaSuspensionEntryMaintenance
 *   等）的可见性不一致。渐进拆分优先保持运行时一致；等 attempt.ts 本体脱离
 *   nocheck 后再把 helper 同步开启严格类型检查。
 */

import { normalizeProviderId } from "@openclaw/model-catalog-core/provider-id";
import { formatErrorMessage } from "../../../infra/errors.js";
import type { PluginMetadataSnapshot } from "../../../plugins/plugin-metadata-snapshot.types.js";
import {
  resolveEffectiveToolPolicy,
  resolveGroupToolPolicy,
  resolveInheritedToolPolicyForSession,
  resolveSubagentToolPolicyForSession,
} from "../../agent-tools.policy.js";
import {
  isSubagentEnvelopeSession,
  resolveSubagentCapabilityStore,
} from "../../subagent-capabilities.js";
import { collectExplicitToolAllowlistSources } from "../../tool-allowlist-guard.js";
import type { AgentMessage } from "../../runtime/index.js";
import { guardSessionManager } from "../../session-tool-result-guard-wrapper.js";
import { sanitizeToolUseResultPairing } from "../../session-transcript-repair.js";
import { EmbeddedAttemptSessionTakeoverError } from "./attempt.session-lock.js";
import { MID_TURN_PRECHECK_ERROR_MESSAGE } from "./midturn-precheck.js";
import { isTranscriptOnlyOpenClawAssistantMessage } from "../../../shared/transcript-only-openclaw-assistant.js";
import { loadSessionEntry, updateSessionEntry } from "../../../config/sessions/session-accessor.js";
import type { SessionEntry } from "../../../config/sessions/types.js";
import { resolveQuotaSuspensionEntryMaintenance } from "../../../config/sessions/store-maintenance.js";
import { log } from "../../agent-logger.js";

export const MAX_BTW_SNAPSHOT_MESSAGES = 100;
export const PROMPT_TOOL_RESULT_AGGREGATE_CAP_MULTIPLIER = 4;

// ============================================================
// Provider 元数据
// ============================================================
export function pluginMetadataSnapshotCoversProvider(
  snapshot: PluginMetadataSnapshot | undefined,
  provider: string,
): snapshot is PluginMetadataSnapshot {
  const normalizedProvider = normalizeProviderId(provider);
  if (!snapshot || !normalizedProvider) {
    return false;
  }
  return snapshot.manifestRegistry.plugins.some((plugin) => {
    const ownsProvider = plugin.providers.some(
      (providerId) => normalizeProviderId(providerId) === normalizedProvider,
    );
    if (ownsProvider) {
      return true;
    }
    // plugin.modelCatalog 是 engine/model-catalog/types.ts ModelCatalog 结构
    // （providers / aliases 字段名），但 PluginMetadataSnapshot 类型声明未精化
    // 到具体 engine 模块。用宽松 as 断言与原 @ts-nocheck 代码保持一致行为。
    const mc = plugin.modelCatalog as
      | { providers?: Record<string, unknown>; aliases?: Record<string, unknown> }
      | undefined;
    const modelCatalogProviderIds = [
      ...Object.keys(mc?.providers ?? {}),
      ...Object.keys(mc?.aliases ?? {}),
    ];
    return modelCatalogProviderIds.some(
      (providerId) => normalizeProviderId(providerId) === normalizedProvider,
    );
  });
}

// ============================================================
// Token / 文本统计
// ============================================================
export function summarizeMessagePayload(
  msg: AgentMessage,
): { textChars: number; imageBlocks: number } {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") {
    return { textChars: content.length, imageBlocks: 0 };
  }
  if (!Array.isArray(content)) {
    return { textChars: 0, imageBlocks: 0 };
  }

  let textChars = 0;
  let imageBlocks = 0;
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typedBlock = block as { type?: unknown; text?: unknown };
    if (typedBlock.type === "image") {
      imageBlocks++;
      continue;
    }
    if (typeof typedBlock.text === "string") {
      textChars += typedBlock.text.length;
    }
  }

  return { textChars, imageBlocks };
}

export function summarizeSessionContext(messages: AgentMessage[]): {
  roleCounts: string;
  totalTextChars: number;
  totalImageBlocks: number;
  maxMessageTextChars: number;
} {
  const roleCounts = new Map<string, number>();
  let totalTextChars = 0;
  let totalImageBlocks = 0;
  let maxMessageTextChars = 0;

  for (const msg of messages) {
    const role = typeof msg.role === "string" ? msg.role : "unknown";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);

    const payload = summarizeMessagePayload(msg);
    totalTextChars += payload.textChars;
    totalImageBlocks += payload.imageBlocks;
    if (payload.textChars > maxMessageTextChars) {
      maxMessageTextChars = payload.textChars;
    }
  }

  return {
    roleCounts:
      [...roleCounts.entries()]
        .toSorted((a, b) => a[0].localeCompare(b[0]))
        .map(([role, count]) => `${role}:${count}`)
        .join(",") || "none",
    totalTextChars,
    totalImageBlocks,
    maxMessageTextChars,
  };
}

// ============================================================
// Message 克隆/幂等性工具
// ============================================================
export function cloneHookMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => structuredClone(message));
}

export function sessionMessagesContainIdempotencyKey(
  messages: AgentMessage[],
  idempotencyKey: string,
): boolean {
  return messages.some(
    (message) =>
      typeof (message as { idempotencyKey?: unknown }).idempotencyKey === "string" &&
      (message as { idempotencyKey?: unknown }).idempotencyKey === idempotencyKey,
  );
}

// ============================================================
// Session manager 文件刷写（有副作用，但只对这一个对象生效）
// ============================================================
export function flushSessionManagerFile(
  sessionManager: ReturnType<typeof guardSessionManager>,
): void {
  (sessionManager as unknown as { rewriteFile?: () => void }).rewriteFile?.();
}

// ============================================================
// Transcript repair
// ============================================================
export function repairAttemptToolUseResultPairing(
  messages: AgentMessage[],
  isOpenAIResponsesApi: boolean,
): AgentMessage[] {
  // 注：session-transcript-repair 当前是 stub（只接受 1 个参数直接返回），
  // 真实 policy（erroredAssistantResultPolicy / missingToolResultText）由
  // attempt.ts 中的真实逻辑接管。保留这段接口以便后续替换完整版。
  const out = sanitizeToolUseResultPairing(messages as unknown[]);
  if (!isOpenAIResponsesApi) {
    // 无额外处理
  }
  return out as AgentMessage[];
}

// ============================================================
// Prompt / cleanup 错误优先级判定
// ============================================================
export function shouldPreservePromptErrorAfterCleanupError(params: {
  promptError: unknown;
  cleanupError: unknown;
}): boolean {
  return (
    Boolean(params.promptError) &&
    params.cleanupError instanceof EmbeddedAttemptSessionTakeoverError
  );
}

export class EmbeddedAttemptPromptErrorWithCleanupTakeoverError extends Error {
  readonly promptError: unknown;
  readonly cleanupError: EmbeddedAttemptSessionTakeoverError;

  constructor(params: {
    promptError: unknown;
    cleanupError: EmbeddedAttemptSessionTakeoverError;
  }) {
    super(formatErrorMessage(params.promptError), { cause: params.cleanupError });
    this.name = "EmbeddedAttemptSessionTakeoverError";
    this.promptError = params.promptError;
    this.cleanupError = params.cleanupError;
  }
}

// ============================================================
// Media reply
// ============================================================
export function hasVisiblePendingToolMediaReply(
  reply: { mediaUrls?: string[]; audioAsVoice?: boolean } | null | undefined,
): boolean {
  return Boolean(
    reply &&
      ((reply.mediaUrls ?? []).some((url) => url.trim().length > 0) ||
        reply.audioAsVoice === true),
  );
}

// ============================================================
// Mid-turn synthetic assistant error 清洗
// ============================================================
export function isMidTurnPrecheckAssistantError(
  message: AgentMessage | undefined,
): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }
  const record = message as unknown as {
    stopReason?: unknown;
    errorMessage?: unknown;
  };
  return (
    record.stopReason === "error" &&
    record.errorMessage === MID_TURN_PRECHECK_ERROR_MESSAGE
  );
}

export function removeTrailingMidTurnPrecheckAssistantError(params: {
  activeSession: { agent: { state: { messages: AgentMessage[] } } };
  sessionManager: ReturnType<typeof guardSessionManager>;
}): void {
  const messages = params.activeSession.agent.state.messages;
  const removedActiveError = isMidTurnPrecheckAssistantError(messages.at(-1));
  if (removedActiveError) {
    params.activeSession.agent.state.messages = messages.slice(0, -1);
  }

  // sessionManager.removeTrailingEntries / guardSessionManager 在 @ts-nocheck
  // 文件里定义，导出类型未精化。用宽松断言对齐原运行时行为。
  const sm = params.sessionManager as unknown as {
    removeTrailingEntries: (
      pred: (entry: { type: string; message?: AgentMessage }) => boolean,
      opts: {
        preserveTrailing: (entry: { type: string; message?: AgentMessage }) => boolean;
      },
    ) => number;
  };
  const removedPersistedError =
    sm.removeTrailingEntries(
      (entry) => entry.type === "message" && isMidTurnPrecheckAssistantError(entry.message),
      {
        preserveTrailing: (entry) =>
          entry.type === "custom" ||
          entry.type === "label" ||
          entry.type === "session_info" ||
          (entry.type === "message" &&
            isTranscriptOnlyOpenClawAssistantMessage(entry.message as AgentMessage)),
      },
    ) > 0;
  if (removedActiveError && !removedPersistedError) {
    log.warn(
      "[context-overflow-midturn-precheck] removed synthetic assistant error from active session but could not locate matching persisted SessionManager entry",
    );
  }
}

// ============================================================
// Tools allowlist 解析（纯构造，外部依赖是确定性纯函数）
// ============================================================
export function collectAttemptExplicitToolAllowlistSources(params: {
  config?: unknown;
  sessionKey?: string;
  sandboxSessionKey?: string;
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
  messageProvider?: string;
  agentAccountId?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  sandboxToolPolicy?: { allow?: string[]; deny?: string[] };
  toolsAllow?: string[];
}) {
  const { agentId, globalPolicy, globalProviderPolicy, agentPolicy, agentProviderPolicy } =
    resolveEffectiveToolPolicy({
      config: params.config,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      modelProvider: params.modelProvider,
      modelId: params.modelId,
    });
  const groupPolicy = resolveGroupToolPolicy({
    config: params.config,
    sessionKey: params.sessionKey,
    spawnedBy: params.spawnedBy,
    messageProvider: params.messageProvider,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
    accountId: params.agentAccountId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
  const subagentStore = resolveSubagentCapabilityStore(params.sandboxSessionKey, {
    cfg: params.config,
  });
  const subagentPolicy =
    params.sandboxSessionKey &&
    isSubagentEnvelopeSession(params.sandboxSessionKey, {
      cfg: params.config,
      store: subagentStore,
    })
      ? resolveSubagentToolPolicyForSession(params.config, params.sandboxSessionKey, {
          store: subagentStore,
        })
      : undefined;
  const inheritedToolPolicy = resolveInheritedToolPolicyForSession(
    params.config,
    params.sandboxSessionKey,
    {
      store: subagentStore,
    },
  );
  return collectExplicitToolAllowlistSources([
    { label: "tools.allow", allow: globalPolicy?.allow },
    { label: "tools.byProvider.allow", allow: globalProviderPolicy?.allow },
    {
      label: agentId ? `agents.${agentId}.tools.allow` : "agent tools.allow",
      allow: agentPolicy?.allow,
    },
    {
      label: agentId
        ? `agents.${agentId}.tools.byProvider.allow`
        : "agent tools.byProvider.allow",
      allow: agentProviderPolicy?.allow,
    },
    { label: "group tools.allow", allow: groupPolicy?.allow },
    { label: "sandbox tools.allow", allow: params.sandboxToolPolicy?.allow },
    { label: "subagent tools.allow", allow: subagentPolicy?.allow },
    { label: "inherited tools.allow", allow: inheritedToolPolicy?.allow },
    {
      label: "runtime toolsAllow",
      allow: params.toolsAllow,
      enforceWhenToolsDisabled: true,
    },
  ]);
}

// ============================================================
// Quota TTL 维护 + SessionEntry 重新回写（副作用：IO）
// ============================================================
// Applies quota-resume TTL maintenance to only the active attempt session.
export async function loadAttemptSessionEntryAfterQuotaMaintenance(params: {
  storePath: string;
  sessionKey: string;
}): Promise<SessionEntry | undefined> {
  const entry = loadSessionEntry({
    storePath: params.storePath,
    sessionKey: params.sessionKey,
  });
  if (!entry?.quotaSuspension) {
    return entry;
  }
  const now = Date.now();
  const maintenance = resolveQuotaSuspensionEntryMaintenance({ entry, now });
  if (!maintenance.patch) {
    return entry;
  }
  const updated = await updateSessionEntry(
    {
      storePath: params.storePath,
      sessionKey: params.sessionKey,
    },
    (currentEntry: SessionEntry) =>
      resolveQuotaSuspensionEntryMaintenance({
        entry: currentEntry,
        now,
      }).patch,
    {
      skipMaintenance: true,
      takeCacheOwnership: true,
    },
  );
  return updated ?? entry;
}
