// 移植自 openclaw/src/gateway/server-methods/chat.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const augmentChatHistoryWithCanvasBlocks: unknown = undefined;

export const DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS: unknown = undefined;

export const dropPreSessionStartAnnouncePairs: unknown = undefined;

export const resolveEffectiveChatHistoryMaxChars: unknown = undefined;

export const sanitizeChatHistoryMessages: unknown = undefined;

export const sanitizeChatSendMessageInput: unknown = undefined;

export const CHAT_HISTORY_MAX_SINGLE_MESSAGE_BYTES: unknown = undefined;

export function buildOversizedHistoryPlaceholder(...args: unknown[]): unknown {
  throw new Error("not implemented: buildOversizedHistoryPlaceholder");
}

export function replaceOversizedChatHistoryMessages(...args: unknown[]): unknown {
  throw new Error("not implemented: replaceOversizedChatHistoryMessages");
}

export function enforceChatHistoryFinalBudget(...args: unknown[]): unknown {
  throw new Error("not implemented: enforceChatHistoryFinalBudget");
}

export const chatHandlers: unknown = undefined;
