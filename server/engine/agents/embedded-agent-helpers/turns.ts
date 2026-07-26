/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/turns.ts
 *
 * Normalizes embedded-agent conversation turn ordering for provider contracts.
 *
 * 注：cross-wms 中没有 runtime/index.js，此处定义本地 AgentMessage 类型
 * （足够支持 Extract<..., { role: "..." }> 模式）。
 * cross-wms 的 tool-call-id.ts 是另一套实现（UUID 注册表），不含
 * extractToolCallsFromAssistant / extractToolResultId，因此将其内联为本模块私有 helper。
 */
import { normalizeOptionalString } from "../../infra/string-coerce.js";
import { isThinkingLikeBlock } from "../thinking-block.js";

/**
 * 本地消息类型 — 仅描述 turns.ts 实际访问的字段。
 * 注：cross-wms 中没有 runtime/index.js，此处定义本地类型。
 * 不使用 Extract<AgentMessage, {role:...}> 模式，因为 catch-all `{ role: string }`
 * 成员会导致联合类型坍缩。改用显式类型别名。
 */
type AssistantMessage = {
  role: "assistant";
  content?: unknown;
  usage?: unknown;
  stopReason?: string;
  errorMessage?: string;
  [key: string]: unknown;
};
type UserMessage = { role: "user"; content: unknown; timestamp?: number; [key: string]: unknown };
type ToolResultMessage = { role: "toolResult"; content?: unknown; [key: string]: unknown };
type ToolMessage = { role: "tool"; content?: unknown; [key: string]: unknown };
type OtherMessage = { role: string; content?: unknown; [key: string]: unknown };
type AgentMessage = AssistantMessage | UserMessage | ToolResultMessage | ToolMessage | OtherMessage;

/** 按 role 字面量选取对应消息类型（替代 Extract<AgentMessage, {role: TRole}>）。 */
type MessageByRole<TRole extends "assistant" | "user"> = TRole extends "assistant"
  ? AssistantMessage
  : TRole extends "user"
    ? UserMessage
    : never;

type AnthropicContentBlock = {
  type: "text" | "toolUse" | "toolCall" | "functionCall" | "toolResult" | "tool";
  text?: string;
  id?: string;
  name?: string;
  toolUseId?: string;
  toolCallId?: string;
};
type UserContentBlock = { type: string; text?: string; [key: string]: unknown };

const TOOL_CALL_TYPES = new Set(["toolCall", "toolUse", "functionCall"]);

type ToolCallLike = {
  id: string;
  name?: string;
};

// 内联自 openclaw/src/agents/tool-call-id.ts
// cross-wms 的 tool-call-id.ts 是另一套 UUID 注册表实现，不含这些函数。
function extractToolCallsFromAssistant(
  msg: AssistantMessage,
): ToolCallLike[] {
  const content = msg.content;
  if (!Array.isArray(content)) {
    return [];
  }

  const toolCalls: ToolCallLike[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const rec = block as { type?: unknown; id?: unknown; name?: unknown };
    if (typeof rec.id !== "string" || !rec.id) {
      continue;
    }
    if (typeof rec.type === "string" && TOOL_CALL_TYPES.has(rec.type)) {
      toolCalls.push({
        id: rec.id,
        name: typeof rec.name === "string" ? rec.name : undefined,
      });
    }
  }
  return toolCalls;
}

// 内联自 openclaw/src/agents/tool-call-id.ts
function extractToolResultIds(msg: ToolResultMessage): string[] {
  const ids: string[] = [];
  const record = msg as {
    toolCallId?: unknown;
    toolUseId?: unknown;
    tool_call_id?: unknown;
    tool_use_id?: unknown;
    callId?: unknown;
    call_id?: unknown;
  };
  for (const value of [
    record.toolCallId,
    record.toolUseId,
    record.tool_call_id,
    record.tool_use_id,
    record.callId,
    record.call_id,
  ]) {
    const id = normalizeOptionalString(value);
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function extractToolResultId(
  msg: ToolResultMessage,
): string | null {
  return extractToolResultIds(msg)[0] ?? null;
}

function isToolCallBlock(block: AnthropicContentBlock): boolean {
  return block.type === "toolUse" || block.type === "toolCall" || block.type === "functionCall";
}

function isAbortedAssistantTurn(message: AgentMessage): boolean {
  const stopReason = (message as { stopReason?: unknown }).stopReason;
  return stopReason === "aborted" || stopReason === "error";
}

function extractToolResultMatchIds(record: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const value of [
    record.toolUseId,
    record.toolCallId,
    record.tool_use_id,
    record.tool_call_id,
    record.callId,
    record.call_id,
  ]) {
    const id = normalizeOptionalString(value);
    if (id) {
      ids.add(id);
    }
  }
  return ids;
}

function extractToolResultMatchName(record: Record<string, unknown>): string | null {
  return normalizeOptionalString(record.toolName) ?? normalizeOptionalString(record.name) ?? null;
}

function collectAnyToolResultIds(message: AgentMessage): Set<string> {
  const ids = new Set<string>();
  const role = (message as { role?: unknown }).role;
  if (role === "toolResult") {
    const toolResultId = extractToolResultId(
      message as ToolResultMessage,
    );
    if (toolResultId) {
      ids.add(toolResultId);
    }
  } else if (role === "tool") {
    const record = message as unknown as Record<string, unknown>;
    for (const id of extractToolResultMatchIds(record)) {
      ids.add(id);
    }
  }

  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return ids;
  }

  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as Record<string, unknown>;
    if (record.type !== "toolResult" && record.type !== "tool") {
      continue;
    }
    for (const id of extractToolResultMatchIds(record)) {
      ids.add(id);
    }
  }

  return ids;
}

function collectTrustedToolResultMatches(message: AgentMessage): Map<string, Set<string>> {
  const matches = new Map<string, Set<string>>();
  const role = (message as { role?: unknown }).role;
  const addMatch = (ids: Iterable<string>, toolName: string | null) => {
    for (const id of ids) {
      const bucket = matches.get(id) ?? new Set<string>();
      if (toolName) {
        bucket.add(toolName);
      }
      matches.set(id, bucket);
    }
  };

  if (role === "toolResult") {
    const record = message as unknown as Record<string, unknown>;
    addMatch(
      [
        ...extractToolResultMatchIds(record),
        ...(() => {
          const canonicalId = extractToolResultId(
            message as ToolResultMessage,
          );
          return canonicalId ? [canonicalId] : [];
        })(),
      ],
      extractToolResultMatchName(record),
    );
  } else if (role === "tool") {
    const record = message as unknown as Record<string, unknown>;
    addMatch(extractToolResultMatchIds(record), extractToolResultMatchName(record));
  }

  return matches;
}

function collectFutureToolResultMatches(
  messages: AgentMessage[],
  startIndex: number,
): Map<string, Set<string>> {
  const matches = new Map<string, Set<string>>();
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const candidate = messages[index];
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    if ((candidate as { role?: unknown }).role === "assistant") {
      break;
    }
    for (const [id, toolNames] of collectTrustedToolResultMatches(candidate)) {
      const bucket = matches.get(id) ?? new Set<string>();
      for (const toolName of toolNames) {
        bucket.add(toolName);
      }
      matches.set(id, bucket);
    }
  }
  return matches;
}

function collectFutureToolResultIds(messages: AgentMessage[], startIndex: number): Set<string> {
  const ids = new Set<string>();
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const candidate = messages[index];
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    if ((candidate as { role?: unknown }).role === "assistant") {
      break;
    }
    for (const id of collectAnyToolResultIds(candidate)) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * Strips dangling tool-call blocks from assistant messages when no later
 * tool-result span before the next assistant turn resolves them.
 * This fixes the "tool_use ids found without tool_result blocks" error from Anthropic.
 */
function stripDanglingAnthropicToolUses(messages: AgentMessage[]): AgentMessage[] {
  const result: AgentMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") {
      result.push(msg);
      continue;
    }

    const msgRole = (msg as { role?: unknown }).role as string | undefined;
    if (msgRole !== "assistant") {
      result.push(msg);
      continue;
    }

    const assistantMsg = msg as {
      content?: AnthropicContentBlock[];
    };
    const originalContent = Array.isArray(assistantMsg.content) ? assistantMsg.content : [];
    if (originalContent.length === 0) {
      result.push(msg);
      continue;
    }
    if (
      extractToolCallsFromAssistant(msg as AssistantMessage).length ===
      0
    ) {
      result.push(msg);
      continue;
    }
    const hasThinking = originalContent.some((block) => isThinkingLikeBlock(block));
    const validToolResultMatches = collectFutureToolResultMatches(messages, i);
    const validToolUseIds = collectFutureToolResultIds(messages, i);

    if (hasThinking) {
      const allToolCallsResolvable = originalContent.every((block) => {
        if (!block || !isToolCallBlock(block)) {
          return true;
        }
        const blockId = normalizeOptionalString(block.id);
        const blockName = normalizeOptionalString(block.name);
        if (!blockId || !blockName) {
          return false;
        }
        const matchingToolNames = validToolResultMatches.get(blockId);
        if (!matchingToolNames) {
          return false;
        }
        return matchingToolNames.size === 0 || matchingToolNames.has(blockName);
      });
      if (allToolCallsResolvable) {
        result.push(msg);
      } else {
        result.push({
          ...assistantMsg,
          content: isAbortedAssistantTurn(msg)
            ? []
            : ([{ type: "text", text: "[tool calls omitted]" }] as AnthropicContentBlock[]),
        } as AgentMessage);
      }
      continue;
    }

    const filteredContent = originalContent.filter((block) => {
      if (!block) {
        return false;
      }
      if (!isToolCallBlock(block)) {
        return true;
      }
      const blockId = normalizeOptionalString(block.id);
      return blockId ? validToolUseIds.has(blockId) : false;
    });

    if (filteredContent.length === originalContent.length) {
      result.push(msg);
      continue;
    }

    if (originalContent.length > 0 && filteredContent.length === 0) {
      result.push({
        ...assistantMsg,
        content: isAbortedAssistantTurn(msg)
          ? []
          : ([{ type: "text", text: "[tool calls omitted]" }] as AnthropicContentBlock[]),
      } as AgentMessage);
    } else {
      result.push({
        ...assistantMsg,
        content: filteredContent,
      } as AgentMessage);
    }
  }

  return result;
}

function validateTurnsWithConsecutiveMerge<TRole extends "assistant" | "user">(params: {
  messages: AgentMessage[];
  role: TRole;
  merge: (
    previous: MessageByRole<TRole>,
    current: MessageByRole<TRole>,
  ) => MessageByRole<TRole>;
}): AgentMessage[] {
  const { messages, role, merge } = params;
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const result: AgentMessage[] = [];
  let lastRole: string | undefined;

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      result.push(msg);
      continue;
    }

    const msgRole = (msg as { role?: unknown }).role as string | undefined;
    if (!msgRole) {
      result.push(msg);
      continue;
    }

    if (msgRole === lastRole && lastRole === role) {
      const lastMsg = result[result.length - 1];
      const currentMsg = msg as MessageByRole<TRole>;

      if (lastMsg && typeof lastMsg === "object") {
        const lastTyped = lastMsg as MessageByRole<TRole>;
        result[result.length - 1] = merge(lastTyped, currentMsg);
        continue;
      }
    }

    result.push(msg);
    lastRole = msgRole;
  }

  return result;
}

function mergeConsecutiveAssistantTurns(
  previous: AssistantMessage,
  current: AssistantMessage,
): AssistantMessage {
  const mergedContent = [
    ...(Array.isArray(previous.content) ? previous.content : []),
    ...(Array.isArray(current.content) ? current.content : []),
  ];
  return {
    ...previous,
    content: mergedContent,
    // 使用三元而非 `&&` 短路：`current.usage` 类型为 `unknown`，
    // `unknown && X` 的结果类型仍为 `unknown`，无法 spread。
    ...(current.usage ? { usage: current.usage } : {}),
    ...(current.stopReason ? { stopReason: current.stopReason } : {}),
    ...(current.errorMessage ? { errorMessage: current.errorMessage } : {}),
  };
}

/**
 * Validates and fixes conversation turn sequences for Gemini API.
 * Gemini requires strict alternating user→assistant→tool→user pattern.
 * Merges consecutive assistant messages together.
 */
export function validateGeminiTurns(messages: AgentMessage[]): AgentMessage[] {
  return validateTurnsWithConsecutiveMerge({
    messages,
    role: "assistant",
    merge: mergeConsecutiveAssistantTurns,
  });
}

/** Merge adjacent user turns into a single provider-compatible user message. */
export function mergeConsecutiveUserTurns(
  previous: UserMessage,
  current: UserMessage,
): UserMessage {
  const mergedContent = [
    ...normalizeUserContentForMerge(previous.content),
    ...normalizeUserContentForMerge(current.content),
  ];

  return {
    ...current,
    content: mergedContent,
    timestamp: current.timestamp ?? previous.timestamp,
  };
}

function normalizeUserContentForMerge(content: unknown): UserContentBlock[] {
  if (Array.isArray(content)) {
    return content as UserContentBlock[];
  }
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return [];
}

/**
 * Validates and fixes conversation turn sequences for Anthropic API.
 * Anthropic requires strict alternating user→assistant pattern.
 * Merges consecutive user messages together.
 * Also strips dangling tool_use blocks that lack corresponding tool_result blocks.
 */
export function validateAnthropicTurns(messages: AgentMessage[]): AgentMessage[] {
  // Merge first so an injected assistant turn cannot hide the tool result that
  // resolves the preceding signed tool call. Stripping first would destroy the
  // active Anthropic tool-use turn before the adjacent turns can be repaired.
  const mergedAssistant = validateTurnsWithConsecutiveMerge({
    messages,
    role: "assistant",
    merge: mergeConsecutiveAssistantTurns,
  });
  const stripped = stripDanglingAnthropicToolUses(mergedAssistant);

  return validateTurnsWithConsecutiveMerge({
    messages: stripped,
    role: "user",
    merge: mergeConsecutiveUserTurns,
  });
}
