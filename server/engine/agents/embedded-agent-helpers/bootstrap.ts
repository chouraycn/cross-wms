/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/bootstrap.ts
 *
 * 简化版：仅包含 sanitizeGoogleTurnOrdering。
 * 完整的 bootstrap.ts 模块（476 行）负责构建/清理 embedded-agent session 的 bootstrap
 * 上下文，依赖较深（config 类型、agent-scope、workspace 等），此处仅提取被
 * google.ts 引用的核心函数。
 *
 * 注：原始 sanitizeGoogleTurnOrdering 委托给 ../../shared/google-turn-ordering.ts
 * 的 sanitizeGoogleAssistantFirstOrdering。cross-wms 中没有该文件，因此将其内联。
 */

/**
 * 本地 AgentMessage 类型 — 仅描述此函数实际访问的字段。
 * 通过 role 字面量支持类型推断，并保留 [key: string]: any 以兼容历史数据。
 */
type AgentMessage = { role?: any; content?: any; [key: string]: any };

const GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT = "(session bootstrap)";

/** Add a synthetic user bootstrap when Google-style providers receive assistant-first turns. */
function sanitizeGoogleAssistantFirstOrdering(messages: AgentMessage[]): AgentMessage[] {
  const first = messages[0] as { role?: any; content?: any } | undefined;
  const role = first?.role;
  const content = first?.content;
  if (
    role === "user" &&
    typeof content === "string" &&
    content.trim() === GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT
  ) {
    return messages;
  }
  if (role !== "assistant") {
    return messages;
  }

  // Google chat APIs reject assistant-first transcripts. The bootstrap marker
  // makes the mutation idempotent while preserving the original assistant turn.
  const bootstrap: AgentMessage = {
    role: "user",
    content: GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT,
    timestamp: Date.now(),
  } as AgentMessage;

  return [bootstrap, ...messages];
}

export function sanitizeGoogleTurnOrdering(messages: AgentMessage[]): AgentMessage[] {
  return sanitizeGoogleAssistantFirstOrdering(messages);
}
