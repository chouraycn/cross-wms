/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/thinking.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isAssistantMessageWithContent(..._args: unknown[]): unknown {
  throw new Error("isAssistantMessageWithContent not implemented (openclaw stub)");
}
export function stripThinkingSignaturesFromMessage(..._args: unknown[]): unknown {
  throw new Error("stripThinkingSignaturesFromMessage not implemented (openclaw stub)");
}
export function stripStaleThinkingSignaturesForCompactionReplay(..._args: unknown[]): unknown {
  throw new Error("stripStaleThinkingSignaturesForCompactionReplay not implemented (openclaw stub)");
}
export function stripInvalidThinkingSignatures(..._args: unknown[]): unknown {
  throw new Error("stripInvalidThinkingSignatures not implemented (openclaw stub)");
}
export function dropThinkingBlocks(..._args: unknown[]): unknown {
  throw new Error("dropThinkingBlocks not implemented (openclaw stub)");
}
export function shouldPreserveLatestAssistantThinking(..._args: unknown[]): unknown {
  throw new Error("shouldPreserveLatestAssistantThinking not implemented (openclaw stub)");
}
export function stripThinkingBlocksFromMessage(..._args: unknown[]): unknown {
  throw new Error("stripThinkingBlocksFromMessage not implemented (openclaw stub)");
}
export function dropReasoningFromHistory(..._args: unknown[]): unknown {
  throw new Error("dropReasoningFromHistory not implemented (openclaw stub)");
}
export function assessLastAssistantMessage(..._args: unknown[]): unknown {
  throw new Error("assessLastAssistantMessage not implemented (openclaw stub)");
}
export function wrapAnthropicStreamWithRecovery(..._args: unknown[]): unknown {
  throw new Error("wrapAnthropicStreamWithRecovery not implemented (openclaw stub)");
}
export const OMITTED_ASSISTANT_REASONING_TEXT: unknown = undefined;
