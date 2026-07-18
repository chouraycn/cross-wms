// Gateway assistant-event text extractor.
// Normalizes provider stream event shapes into a display text delta.
//
// 降级说明：openclaw 原始实现依赖 `../infra/agent-events.js` 的 AgentEventPayload。
// cross-wms 的 infra/agent-events.ts 使用 AgentEventMap 风格，未导出 AgentEventPayload。
// 这里定义本地宽松占位类型，仅描述本模块所需的 data 字段形状。

/**
 * Agent 事件 payload 的宽松占位类型。
 *
 * 仅描述 assistant-text 提取所需的 data 字段；其余字段通过索引签名兼容。
 */
export type AgentEventPayload = {
  data: {
    delta?: unknown;
    text?: unknown;
    replaceable?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// Agent stream events may carry assistant text as either incremental delta or
// full text, depending on provider/runtime. Gateway display paths normalize the
// two shapes here before broadcasting.
/** Extracts the assistant-visible text delta from an agent event payload. */
export function resolveAssistantStreamDeltaText(evt: AgentEventPayload): string {
  const delta = evt.data.delta;
  const text = evt.data.text;
  return typeof delta === "string" ? delta : typeof text === "string" ? text : "";
}

export function isReplaceableAssistantStreamEvent(evt: AgentEventPayload): boolean {
  return evt.data.replaceable === true;
}

export function resolveAssistantStreamSnapshotText(evt: AgentEventPayload): string {
  const text = evt.data.text;
  if (typeof text === "string") {
    return text;
  }
  return resolveAssistantStreamDeltaText(evt);
}
