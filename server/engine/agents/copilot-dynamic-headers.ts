/**
 * Builds GitHub Copilot provider compatibility headers from message content.
 *
 * 降级说明：
 *  - openclaw `../llm/types.js` 的 `Context` 类型在 cross-wms 中未完整移植，
 *    这里定义仅包含本模块所需 `messages` 字段的本地最小占位类型。
 */

/** 消息内容块占位类型。 */
type MessageContentBlock = {
  type?: string;
  content?: unknown;
};

/** 对话消息占位类型（与 openclaw Message 兼容的最小子集）。 */
type Message = {
  role: string;
  content: string | MessageContentBlock[] | unknown;
};

/** 请求上下文占位类型（仅包含本模块所需 messages 字段）。 */
type Context = {
  messages: Message[];
};

/** @deprecated GitHub Copilot provider-owned helper; do not use from third-party plugins. */
export const COPILOT_EDITOR_VERSION = "vscode/1.107.0";
/** @deprecated GitHub Copilot provider-owned helper; do not use from third-party plugins. */
export const COPILOT_USER_AGENT = "GitHubCopilotChat/0.35.0";
/** @deprecated GitHub Copilot provider-owned helper; do not use from third-party plugins. */
export const COPILOT_EDITOR_PLUGIN_VERSION = "copilot-chat/0.35.0";
/** @deprecated GitHub Copilot provider-owned helper; do not use from third-party plugins. */
export const COPILOT_GITHUB_API_VERSION = "2025-04-01";
/** @deprecated GitHub Copilot provider-owned helper; do not use from third-party plugins. */
export const COPILOT_INTEGRATION_ID = "vscode-chat";

/** @deprecated GitHub Copilot provider-owned helper; do not use from third-party plugins. */
export function buildCopilotIdeHeaders(
  params: {
    includeApiVersion?: boolean;
  } = {},
): Record<string, string> {
  return {
    "Accept-Encoding": "identity",
    "Editor-Version": COPILOT_EDITOR_VERSION,
    "Editor-Plugin-Version": COPILOT_EDITOR_PLUGIN_VERSION,
    "User-Agent": COPILOT_USER_AGENT,
    ...(params.includeApiVersion ? { "X-Github-Api-Version": COPILOT_GITHUB_API_VERSION } : {}),
  };
}

function inferCopilotInitiator(messages: Context["messages"]): "agent" | "user" {
  const last = messages[messages.length - 1];
  if (!last) {
    return "user";
  }
  if (last.role === "user" && containsCopilotContentType(last.content, "tool_result")) {
    return "agent";
  }
  return last.role === "user" ? "user" : "agent";
}

function containsCopilotContentType(value: unknown, type: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsCopilotContentType(item, type));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as { type?: unknown; content?: unknown };
  return entry.type === type || containsCopilotContentType(entry.content, type);
}

/** Return true when Copilot should receive its vision request header. */
export function hasCopilotVisionInput(messages: Context["messages"]): boolean {
  return messages.some((message) => {
    if (message.role === "user" && Array.isArray(message.content)) {
      return message.content.some((item) => containsCopilotContentType(item, "image"));
    }
    if (message.role === "toolResult" && Array.isArray(message.content)) {
      return message.content.some((item) => containsCopilotContentType(item, "image"));
    }
    return false;
  });
}

/** Build per-request Copilot headers, including initiator and vision flags. */
export function buildCopilotDynamicHeaders(params: {
  messages: Context["messages"];
  hasImages: boolean;
}): Record<string, string> {
  return {
    ...buildCopilotIdeHeaders(),
    "Copilot-Integration-Id": COPILOT_INTEGRATION_ID,
    "Openai-Organization": "github-copilot",
    "x-initiator": inferCopilotInitiator(params.messages),
    ...(params.hasImages ? { "Copilot-Vision-Request": "true" } : {}),
  };
}
