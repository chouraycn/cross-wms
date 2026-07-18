/**
 * Mutable assistant stream compatibility types.
 *
 * Shared by wrappers that decorate async iteration and final result resolution without changing providers.
 *
 * 移植自 openclaw/src/agents/stream-compat.ts
 * 降级策略：AssistantMessage/AssistantMessageEvent 在 cross-wms 的 llm/types.ts 中不存在，
 * 定义本地最小占位类型（结构化字段由消费方在运行时 duck-type 校验）。
 */

// 降级类型：AssistantMessage 的最小占位（openclaw 的 ../llm/types.js 中定义）
export type AssistantMessage = {
  role?: string;
  content?: unknown;
  [key: string]: unknown;
};

// 降级类型：AssistantMessageEvent 的最小占位（openclaw 的 ../llm/types.js 中定义）
export type AssistantMessageEvent = {
  type?: string;
  delta?: unknown;
  [key: string]: unknown;
};

export interface MutableAssistantMessageEventStream extends AsyncIterable<AssistantMessageEvent> {
  result: () => Promise<AssistantMessage>;
}
