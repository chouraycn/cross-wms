/**
 * 移植自 openclaw/src/agents/embedded-agent-subscribe.handlers.messages.ts
 *
 * Stream message handlers for embedded agent subscriptions.
 * Cross-wms simplified: provides no-op default implementations.
 */

export function consumePendingToolMediaIntoReply(params: {
  reply: Record<string, unknown>;
  pendingMedia?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return params.reply;
}

export function consumePendingToolMediaReply(params: {
  pendingMedia?: Array<Record<string, unknown>>;
}): Record<string, unknown> | undefined {
  return undefined;
}

export function readPendingToolMediaReply(params: {
  pendingMedia?: Array<Record<string, unknown>>;
}): Record<string, unknown> | undefined {
  return undefined;
}

export function consumePendingAssistantReplyDirectivesIntoReply(params: {
  reply: Record<string, unknown>;
  directives?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return params.reply;
}

export function hasAssistantVisibleReply(params: {
  reply: Record<string, unknown>;
}): boolean {
  const content = params.reply["content"];
  if (!content) return false;
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) return content.length > 0;
  return false;
}

export function handleMessageStart(params: {
  context: Record<string, unknown>;
  message: Record<string, unknown>;
}): void {
  // No-op in simplified cross-wms
}

export function handleMessageUpdate(params: {
  context: Record<string, unknown>;
  message: Record<string, unknown>;
}): void {
  // No-op in simplified cross-wms
}

export function handleMessageEnd(params: {
  context: Record<string, unknown>;
  message: Record<string, unknown>;
}): void {
  // No-op in simplified cross-wms
}
