/**
 * Assistant stream message builders.
 *
 * Centralizes zero-cost usage records and assistant message construction for simple stream transports.
 *
 * 降级说明：
 *  - openclaw `../llm/types.js` 的 `AssistantMessage`、`StopReason`、`Usage` 类型
 *    在 cross-wms 中部分缺失（cross-wms `Usage` 无 `totalTokens` 字段）。
 *    这里定义与 openclaw 结构兼容的本地类型。
 */

/** Provider 内容块类型占位（与 openclaw TextContent | ThinkingContent | ToolCall 兼容）。 */
type AssistantContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  thinkingSignature?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  textSignature?: string;
};

/** Provider API id（与 openclaw Api 兼容，字符串字面量超集）。 */
type Api = string;

/** Provider id（与 openclaw Provider 兼容）。 */
type Provider = string;

/** 规范化助手停止原因（与 openclaw StopReason 兼容）。 */
export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

/** Usage 记录（与 openclaw Usage 兼容，包含 totalTokens）。 */
export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
};

/** 助手消息（与 openclaw AssistantMessage 兼容的本地占位类型）。 */
export type AssistantMessage = {
  role: "assistant";
  content: AssistantContentBlock[];
  api: Api;
  provider: Provider;
  model: string;
  responseModel?: string;
  responseId?: string;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  errorCode?: string;
  errorType?: string;
  errorBody?: string;
  timestamp: number;
};

type StreamModelDescriptor = {
  api: string;
  provider: string;
  id: string;
};

export function buildZeroUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function buildUsageWithNoCost(params: {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}): Usage {
  const input = params.input ?? 0;
  const output = params.output ?? 0;
  const cacheRead = params.cacheRead ?? 0;
  const cacheWrite = params.cacheWrite ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: params.totalTokens ?? input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function buildAssistantMessage(params: {
  model: StreamModelDescriptor;
  content: AssistantMessage["content"];
  stopReason: StopReason;
  usage: Usage;
  timestamp?: number;
}): AssistantMessage {
  return {
    role: "assistant",
    content: params.content,
    stopReason: params.stopReason,
    api: params.model.api,
    provider: params.model.provider,
    model: params.model.id,
    usage: params.usage,
    timestamp: params.timestamp ?? Date.now(),
  };
}

export function buildAssistantMessageWithZeroUsage(params: {
  model: StreamModelDescriptor;
  content: AssistantMessage["content"];
  stopReason: StopReason;
  timestamp?: number;
}): AssistantMessage {
  return buildAssistantMessage({
    model: params.model,
    content: params.content,
    stopReason: params.stopReason,
    usage: buildZeroUsage(),
    timestamp: params.timestamp,
  });
}

// Single canonical sentinel placed in the `content` array of any assistant turn
// that failed before the model produced its own content. AWS Bedrock Converse
// rejects assistant messages with `content: []` during replay ("The content
// field in the Message object at messages.N is empty."), which can persist into
// the session file and trap subsequent turns in a validation-failure loop. The
// raw provider error text is intentionally NOT placed in `content` because that
// array is replayed back to the model on the next turn — provider error strings
// can carry hostnames or upstream metadata, and replaying them as assistant
// content opens a prompt-injection surface (CWE-200). The detailed error stays
// in the peer `errorMessage` field, which clients/UIs read directly and
// providers do not include in their wire payloads.
//
// This constant is the single source of truth used by replay normalization and
// session-file repair as well, so a session repaired offline reads identically
// to a live stream-error turn (and the repair pass remains idempotent).
export const STREAM_ERROR_FALLBACK_TEXT = "[assistant turn failed before producing content]";

export function buildStreamErrorAssistantMessage(params: {
  model: StreamModelDescriptor;
  errorMessage: string;
  timestamp?: number;
}): AssistantMessage & { stopReason: "error"; errorMessage: string } {
  return {
    ...buildAssistantMessageWithZeroUsage({
      model: params.model,
      content: [{ type: "text", text: STREAM_ERROR_FALLBACK_TEXT }],
      stopReason: "error",
      timestamp: params.timestamp,
    }),
    stopReason: "error",
    errorMessage: params.errorMessage,
  };
}
