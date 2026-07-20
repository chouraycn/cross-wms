/**
 * Identifies messaging tools and send actions during embedded-agent runs.
 * Ported from openclaw/src/agents/embedded-agent-messaging.ts
 * Simplified: channel plugin integration replaced with core-only logic.
 */

const CORE_MESSAGING_TOOLS = new Set(["sessions_send", "message"]);
const MESSAGE_TOOL_SEND_ACTIONS = new Set([
  "send",
  "thread-reply",
  "sendWithEffect",
  "sendAttachment",
  "upload-file",
]);
const MESSAGE_TOOL_READ_ONLY_ACTIONS = new Set([
  "read",
  "reactions",
  "list-pins",
  "permissions",
  "thread-list",
  "search",
  "sticker-search",
  "member-info",
  "role-info",
  "emoji-list",
  "channel-info",
  "channel-list",
  "voice-status",
  "event-list",
  "download-file",
]);
const MESSAGE_TOOL_MUTATION_ACTIONS = new Set<string>();
const MESSAGE_TOOL_CONVERSATION_CREATE_ACTIONS = new Set([
  "thread-create",
  "topic-create",
  "threadcreate",
  "createforumtopic",
]);

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

/** Return true when a message action sends or uploads user-visible content. */
export function isMessageToolSendActionName(action: unknown): boolean {
  const normalized = normalizeOptionalString(action) ?? "";
  return MESSAGE_TOOL_SEND_ACTIONS.has(normalized);
}

/** Return true when a message action creates a visible destination conversation. */
export function isMessageToolConversationCreateActionName(action: unknown): boolean {
  const normalized = normalizeOptionalString(action)?.toLowerCase() ?? "";
  return MESSAGE_TOOL_CONVERSATION_CREATE_ACTIONS.has(normalized);
}

/** Return true for core or channel-plugin messaging tool names. */
export function isMessagingTool(toolName: string): boolean {
  return CORE_MESSAGING_TOOLS.has(toolName);
}

/** Return true when the specific tool invocation is an outbound send. */
export function isMessagingToolSendAction(
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  const action = normalizeOptionalString(args.action) ?? "";
  if (toolName === "sessions_send") {
    return true;
  }
  if (toolName === "message") {
    return isMessageToolSendActionName(action);
  }
  return false;
}

/** Return true when a visible delivery has one target worth recording as evidence. */
export function isMessagingToolTargetEvidenceAction(
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  if (toolName === "message") {
    const action = normalizeOptionalString(args.action) ?? "";
    return (
      isMessageToolConversationCreateActionName(action) ||
      isMessageToolSendActionName(action)
    );
  }
  return isMessagingToolSendAction(toolName, args);
}

/** Return true when a messaging invocation can create visible outbound delivery. */
export function isMessagingToolDeliveryAction(
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  if (toolName === "message") {
    const action = normalizeOptionalString(args.action) ?? "";
    return (
      MESSAGE_TOOL_MUTATION_ACTIONS.has(action) || isMessageToolConversationCreateActionName(action)
    );
  }
  return isMessagingToolSendAction(toolName, args);
}
