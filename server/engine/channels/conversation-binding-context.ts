/**
 * Conversation-binding key resolver — 移植自 openclaw/src/channels/conversation-binding-context.ts
 *
 * 降级策略：
 *  - ../config/types.openclaw.js (OpenClawConfig) → cross-wms ../config/types/openclaw.js
 *  - ./conversation-resolution.js (resolveCommandConversationResolution,
 *    ResolveCommandConversationResolutionInput) → 本地降级实现
 *
 * 降级原因：cross-wms 的 conversation-resolution.ts 是独立简化实现，
 * 未导出 openclaw 的 resolveCommandConversationResolution。这里提供
 * 占位实现：始终返回 null，调用方在无法解析绑定时优雅降级。
 */
import type { OpenClawConfig } from "../config/types/openclaw.js";

/** 调用方输入（与 openclaw 一致的最小结构）。 */
type ResolveCommandConversationResolutionInput = {
  channel?: string;
  conversationId?: string | number;
  parentConversationId?: string | number;
  accountId?: string;
  threadId?: string | number;
  placementHint?: string;
};

/** 解析结果（与 openclaw 一致的最小结构）。 */
type CommandConversationResolution = {
  canonical: {
    channel: string;
    accountId: string;
    conversationId: string;
    parentConversationId?: string;
  };
  threadId?: string;
};

/**
 * 降级实现：始终返回 null。
 *
 * openclaw 中此函数解析命令/回复目标为 canonical channel/account/conversation 元组，
 * cross-wms 未移植对应解析逻辑。调用方需在 null 时跳过绑定键解析。
 */
function resolveCommandConversationResolution(
  _input: ResolveCommandConversationResolutionInput,
): CommandConversationResolution | null {
  return null;
}

/** Canonical identity tuple used as the stable key for conversation binding state. */
type ConversationBindingContext = {
  channel: string;
  accountId: string;
  conversationId: string;
  parentConversationId?: string;
  threadId?: string;
};

type ResolveConversationBindingContextInput = Omit<
  ResolveCommandConversationResolutionInput,
  "placementHint"
> & {
  cfg: OpenClawConfig;
};

/**
 * Resolves the canonical channel/account/conversation tuple used for conversation bindings.
 */
export function resolveConversationBindingContext(
  params: ResolveConversationBindingContextInput,
): ConversationBindingContext | null {
  const resolution = resolveCommandConversationResolution({
    ...params,
    // Binding keys must stay canonical; placement hints are only user-facing routing guidance.
    placementHint: false as unknown as string | undefined,
  });
  if (!resolution) {
    return null;
  }
  return {
    channel: resolution.canonical.channel,
    accountId: resolution.canonical.accountId,
    conversationId: resolution.canonical.conversationId,
    ...(resolution.canonical.parentConversationId
      ? { parentConversationId: resolution.canonical.parentConversationId }
      : {}),
    ...(resolution.threadId ? { threadId: resolution.threadId } : {}),
  };
}
