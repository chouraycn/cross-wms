/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/tool-result-context-guard.ts
 *
 * Installs context guards for oversized tool-result histories.
 * cross-wms 简化实现：提供基本的上下文溢出检测和消息截断保护。
 */

const CHARS_PER_TOKEN_ESTIMATE = 4;
const TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE = 3.5;
const SINGLE_TOOL_RESULT_CONTEXT_SHARE = 0.5;
const PREEMPTIVE_OVERFLOW_RATIO = 0.9;

export const PREEMPTIVE_CONTEXT_OVERFLOW_MESSAGE =
  "Context overflow: estimated context size exceeds safe threshold during tool loop.";

export const CONTEXT_LIMIT_TRUNCATION_NOTICE = (omittedChars: number): string =>
  `\n[... ${omittedChars.toLocaleString()} characters truncated ...]\n`;

/** Format a truncation notice for omitted characters. */
export function formatContextLimitTruncationNotice(omittedChars: number): string {
  return CONTEXT_LIMIT_TRUNCATION_NOTICE(omittedChars);
}

function isToolResultMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const msg = message as Record<string, unknown>;
  return msg.role === "tool" || msg.role === "tool_result";
}

function getToolResultText(message: unknown): string | undefined {
  if (!isToolResultMessage(message)) {
    return undefined;
  }
  const msg = message as Record<string, unknown>;
  if (typeof msg.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    const textParts: string[] = [];
    for (const block of msg.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        textParts.push((block as Record<string, unknown>).text as string);
      }
    }
    return textParts.length > 0 ? textParts.join("\n") : undefined;
  }
  return undefined;
}

function estimateMessageChars(message: unknown): number {
  if (!message || typeof message !== "object") {
    return 0;
  }
  const text = getToolResultText(message);
  if (text) {
    return text.length / TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE;
  }
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") {
    return content.length / CHARS_PER_TOKEN_ESTIMATE;
  }
  return 0;
}

function truncateTextToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 0) {
    return formatContextLimitTruncationNotice(text.length);
  }
  const suffix = formatContextLimitTruncationNotice(Math.max(1, text.length - maxChars));
  const bodyBudget = maxChars - suffix.length;
  const cutPoint = Math.max(0, bodyBudget);
  return text.slice(0, cutPoint) + suffix;
}

function truncateToolResultToChars(
  msg: Record<string, unknown>,
  maxChars: number,
): Record<string, unknown> {
  if (!isToolResultMessage(msg)) {
    return msg;
  }
  const estimatedChars = estimateMessageChars(msg);
  if (estimatedChars <= maxChars) {
    return msg;
  }
  const rawText = getToolResultText(msg);
  if (!rawText) {
    return { ...msg, content: formatContextLimitTruncationNotice(1) };
  }
  const textBudget = Math.max(0, Math.floor(maxChars / (4 / TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE)));
  if (textBudget <= 0) {
    return { ...msg, content: formatContextLimitTruncationNotice(rawText.length) };
  }
  if (rawText.length <= textBudget) {
    return { ...msg, content: rawText };
  }
  return { ...msg, content: truncateTextToBudget(rawText, textBudget) };
}

/** Install a context guard on an agent that truncates oversized tool results. */
export function installToolResultContextGuard(params: {
  agent: { transformContext?: unknown };
  contextWindowTokens: number;
}): () => void {
  const contextWindowTokens = Math.max(1, Math.floor(params.contextWindowTokens));
  const maxContextChars = Math.max(
    1_024,
    Math.floor(contextWindowTokens * CHARS_PER_TOKEN_ESTIMATE * PREEMPTIVE_OVERFLOW_RATIO),
  );
  const maxSingleToolResultChars = Math.max(
    1_024,
    Math.floor(
      contextWindowTokens * TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE * SINGLE_TOOL_RESULT_CONTEXT_SHARE,
    ),
  );

  const mutableAgent = params.agent as Record<string, unknown>;
  const originalTransformContext = mutableAgent.transformContext;

  mutableAgent.transformContext = async (messages: unknown[], _signal?: AbortSignal) => {
    const sourceMessages = Array.isArray(messages) ? messages : [];
    let needsTruncation = false;
    for (const message of sourceMessages) {
      if (isToolResultMessage(message) && estimateMessageChars(message) > maxSingleToolResultChars) {
        needsTruncation = true;
        break;
      }
    }

    let contextMessages = sourceMessages;
    if (needsTruncation) {
      contextMessages = sourceMessages.map((msg) => {
        if (isToolResultMessage(msg) && estimateMessageChars(msg) > maxSingleToolResultChars) {
          return truncateToolResultToChars(msg as Record<string, unknown>, maxSingleToolResultChars);
        }
        return msg;
      });
    }

    // Check total context size
    let totalEstimatedChars = 0;
    for (const message of contextMessages) {
      totalEstimatedChars += estimateMessageChars(message);
    }
    if (totalEstimatedChars > maxContextChars) {
      throw new Error(PREEMPTIVE_CONTEXT_OVERFLOW_MESSAGE);
    }

    return contextMessages;
  };

  return () => {
    mutableAgent.transformContext = originalTransformContext;
  };
}

/** Install a context engine loop hook for per-iteration compaction. */
export function installContextEngineLoopHook(params: {
  agent: { transformContext?: unknown };
  contextEngine?: unknown;
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  tokenBudget?: number;
  modelId: string;
}): () => void {
  // Simplified: no context engine in cross-wms, return a no-op uninstall
  return () => {};
}

/** Mark the transcript prompt text on a message. */
export function markTranscriptPromptText(_message: unknown, _text: string): void {
  // No-op in cross-wms: transcript prompt text tracking not supported
}
