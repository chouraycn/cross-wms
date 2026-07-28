import { stripSystemPromptCacheBoundary } from '../../agents/system-prompt-cache-boundary.js';
import { getEnvApiKey } from '../env-api-keys.js';
import { calculateCost, clampThinkingLevel } from '../model-utils.js';
import type {
  AssistantMessage,
  Context,
  Message,
  Model,
  SimpleStreamOptions,
  StopReason,
  StreamFunction,
  StreamOptions,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCall,
} from '../extended-types.js';
import { AssistantMessageEventStream } from '../utils/event-stream.js';
import { shortHash } from '../utils/hash.js';
import { parseStreamingJson } from '../utils/json-parse.js';
import { sanitizeSurrogates } from '../utils/sanitize-unicode.js';
import { buildBaseOptions } from './simple-options.js';
import { transformMessages } from './transform-messages.js';

const MISTRAL_TOOL_CALL_ID_LENGTH = 9;
const MAX_MISTRAL_ERROR_BODY_CHARS = 4000;

type MistralReasoningEffort = "none" | "high";

export interface MistralOptions extends StreamOptions {
  toolChoice?:
    | "auto"
    | "none"
    | "any"
    | "required"
    | { type: "function"; function: { name: string } };
  promptMode?: "reasoning";
  reasoningEffort?: MistralReasoningEffort;
}

export const streamMistral: StreamFunction<"mistral-chat", MistralOptions> = (
  model: Model<"mistral-chat">,
  context: Context,
  options?: MistralOptions,
) => {
  const stream = new AssistantMessageEventStream();

  void (async () => {
    const output = createOutput(model);

    try {
      const apiKey = options?.apiKey || getEnvApiKey(model.provider);
      if (!apiKey) {
        throw new Error(`No API key for provider: ${model.provider}`);
      }

      const normalizeMistralToolCallId = createMistralToolCallIdNormalizer();
      const transformedMessages = transformMessages(context.messages, model, (id) =>
        normalizeMistralToolCallId(id),
      );

      let payload = buildChatPayload(model, context, transformedMessages, options);
      const nextPayload = await options?.onPayload?.(payload, model);
      if (nextPayload !== undefined) {
        payload = nextPayload as Record<string, unknown>;
      }

      stream.push({ type: "start", partial: output });
      await simulateChatStream(model, output, stream, payload, options, apiKey);

      if (options?.signal?.aborted) {
        throw new Error("Request was aborted");
      }

      if (output.stopReason === "aborted" || output.stopReason === "error") {
        throw new Error("An unknown error occurred");
      }

      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end();
    } catch (error) {
      for (const block of output.content) {
        delete (block as { partialArgs?: string }).partialArgs;
      }
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = formatMistralError(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
};

export const streamSimpleMistral: StreamFunction<"mistral-chat", SimpleStreamOptions> = (
  model: Model<"mistral-chat">,
  context: Context,
  options?: SimpleStreamOptions,
) => {
  const apiKey = options?.apiKey || getEnvApiKey(model.provider);
  if (!apiKey) {
    throw new Error(`No API key for provider: ${model.provider}`);
  }

  const base = buildBaseOptions(model as unknown as Parameters<typeof buildBaseOptions>[0], options as unknown as Parameters<typeof buildBaseOptions>[1], apiKey);
  const clampedReasoning = options?.reasoning?.level
    ? clampThinkingLevel(model, options.reasoning.level)
    : undefined;
  const reasoning = clampedReasoning === "off" ? undefined : clampedReasoning;
  const shouldUseReasoning = model.reasoning && reasoning !== undefined;

  return streamMistral(model, context, {
    ...base,
    promptMode: shouldUseReasoning && usesPromptModeReasoning(model) ? "reasoning" : undefined,
    reasoningEffort:
      shouldUseReasoning && usesReasoningEffort(model)
        ? mapReasoningEffort(model, reasoning)
        : undefined,
  } as MistralOptions);
};

function createOutput(model: Model<"mistral-chat">): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function createMistralToolCallIdNormalizer(): (id: string) => string {
  const idMap = new Map<string, string>();
  const reverseMap = new Map<string, string>();

  return (id: string): string => {
    const existing = idMap.get(id);
    if (existing) {
      return existing;
    }

    let attempt = 0;
    while (true) {
      const candidate = deriveMistralToolCallId(id, attempt);
      const owner = reverseMap.get(candidate);
      if (!owner || owner === id) {
        idMap.set(id, candidate);
        reverseMap.set(candidate, id);
        return candidate;
      }
      attempt++;
    }
  };
}

function deriveMistralToolCallId(id: string, attempt: number): string {
  const normalized = id.replace(/[^a-zA-Z0-9]/g, "");
  if (attempt === 0 && normalized.length === MISTRAL_TOOL_CALL_ID_LENGTH) {
    return normalized;
  }
  const seedBase = normalized || id;
  const seed = attempt === 0 ? seedBase : `${seedBase}:${attempt}`;
  return shortHash(seed)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, MISTRAL_TOOL_CALL_ID_LENGTH);
}

function formatMistralError(error: unknown): string {
  if (error instanceof Error) {
    const sdkError = error as Error & { statusCode?: unknown; body?: unknown };
    const statusCode = typeof sdkError.statusCode === "number" ? sdkError.statusCode : undefined;
    const bodyText = typeof sdkError.body === "string" ? sdkError.body.trim() : undefined;
    if (statusCode !== undefined && bodyText) {
      return `Mistral API error (${statusCode}): ${truncateErrorText(bodyText, MAX_MISTRAL_ERROR_BODY_CHARS)}`;
    }
    if (statusCode !== undefined) {
      return `Mistral API error (${statusCode}): ${error.message}`;
    }
    return error.message;
  }
  return safeJsonStringify(error);
}

function truncateErrorText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}... [truncated ${text.length - maxChars} chars]`;
}

function safeJsonStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function buildChatPayload(
  model: Model<"mistral-chat">,
  context: Context,
  messages: Message[],
  options?: MistralOptions,
): Record<string, unknown> {
  const modelInput = (model as unknown as { input?: string[] }).input || [];
  const payload: Record<string, unknown> = {
    model: model.id,
    stream: true,
    messages: toChatMessages(messages, modelInput.includes("image")),
  };

  if (context.tools?.length) {
    const tools = toFunctionTools(context.tools);
    if (tools.length > 0) {
      payload.tools = tools;
    }
  }
  if (options?.temperature !== undefined) {
    payload.temperature = options.temperature;
  }
  if (options?.maxTokens !== undefined) {
    payload.maxTokens = options.maxTokens;
  }
  if (options?.stop !== undefined && options.stop.length > 0) {
    payload.stop = options.stop;
  }
  if (options?.toolChoice) {
    payload.toolChoice = options.toolChoice;
  }
  if (options?.promptMode) {
    payload.promptMode = options.promptMode;
  }
  if (options?.reasoningEffort) {
    payload.reasoningEffort = options.reasoningEffort;
  }

  if (context.systemPrompt) {
    const msgs = payload.messages as Array<Record<string, unknown>>;
    msgs.unshift({
      role: "system",
      content: sanitizeSurrogates(stripSystemPromptCacheBoundary(context.systemPrompt) as string),
    });
  }

  return payload;
}

async function simulateChatStream(
  model: Model<"mistral-chat">,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  _payload: Record<string, unknown>,
  _options: MistralOptions | undefined,
  _apiKey: string,
): Promise<void> {
  const currentBlock: TextContent | ThinkingContent | null = null;
  const blocks = output.content;
  const blockIndex = () => blocks.length - 1;

  const finishCurrentBlock = (block: TextContent | ThinkingContent | null) => {
    if (!block) {
      return;
    }
    if (block.type === "text") {
      stream.push({
        type: "text_end",
        contentIndex: blockIndex(),
        content: block.text,
        partial: output,
      });
      return;
    }
    if (block.type === "thinking") {
      stream.push({
        type: "thinking_end",
        contentIndex: blockIndex(),
        content: block.thinking,
        partial: output,
      });
    }
  };

  finishCurrentBlock(currentBlock);
}

function toFunctionTools(tools: Tool[]): Array<{ type: "function"; function: Record<string, unknown> }> {
  return tools.flatMap((tool) => {
    try {
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: stripSymbolKeys(tool.parameters) as Record<string, unknown>,
          strict: false,
        },
      };
    } catch {
      return [];
    }
  });
}

function stripSymbolKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripSymbolKeys(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = stripSymbolKeys(entry);
    }
    return result;
  }

  return value;
}

function toChatMessages(
  messages: Message[],
  supportsImages: boolean,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: sanitizeSurrogates(msg.content) });
        continue;
      }
      const hadImages = msg.content.some((item) => item.type === "image");
      const content: Array<Record<string, unknown>> = msg.content
        .filter((item) => item.type === "text" || supportsImages)
        .map((item) => {
          if (item.type === "text") {
            return { type: "text", text: sanitizeSurrogates(item.text) };
          }
          return { type: "image_url", imageUrl: `data:${item.mimeType};base64,${item.data}` };
        });
      if (content.length > 0) {
        result.push({ role: "user", content });
        continue;
      }
      if (hadImages && !supportsImages) {
        result.push({ role: "user", content: "(image omitted: model does not support images)" });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const contentParts: Array<Record<string, unknown>> = [];
      const toolCalls: Array<Record<string, unknown>> = [];

      for (const block of msg.content) {
        if (block.type === "text") {
          if (block.text.trim().length > 0) {
            contentParts.push({ type: "text", text: sanitizeSurrogates(block.text) });
          }
          continue;
        }
        if (block.type === "thinking") {
          if (block.thinking.trim().length > 0) {
            contentParts.push({
              type: "thinking",
              thinking: [{ type: "text", text: sanitizeSurrogates(block.thinking) }],
            });
          }
          continue;
        }
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.arguments || {}) },
        });
      }

      const assistantMessage: Record<string, unknown> = { role: "assistant" };
      if (contentParts.length > 0) {
        assistantMessage.content = contentParts;
      }
      if (toolCalls.length > 0) {
        assistantMessage.toolCalls = toolCalls;
      }
      if (contentParts.length > 0 || toolCalls.length > 0) {
        result.push(assistantMessage);
      }
      continue;
    }

    if (msg.role === "toolResult") {
      const toolContent: Array<Record<string, unknown>> = [];
      const textResult = msg.content
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? sanitizeSurrogates(part.text) : ""))
        .join("\n");
      const hasImages = msg.content.some((part) => part.type === "image");
      const toolText = buildToolResultText(textResult, hasImages, supportsImages, msg.isError);
      toolContent.push({ type: "text", text: toolText });
      for (const part of msg.content) {
        if (!supportsImages) {
          continue;
        }
        if (part.type !== "image") {
          continue;
        }
        toolContent.push({
          type: "image_url",
          imageUrl: `data:${part.mimeType};base64,${part.data}`,
        });
      }
      result.push({
        role: "tool",
        toolCallId: msg.toolCallId,
        name: msg.toolName,
        content: toolContent,
      });
    }
  }

  return result;
}

function buildToolResultText(
  text: string,
  hasImages: boolean,
  supportsImages: boolean,
  isError: boolean | undefined,
): string {
  const trimmed = text.trim();
  const errorPrefix = isError ? "[tool error] " : "";

  if (trimmed.length > 0) {
    const imageSuffix =
      hasImages && !supportsImages ? "\n[tool image omitted: model does not support images]" : "";
    return `${errorPrefix}${trimmed}${imageSuffix}`;
  }

  if (hasImages) {
    if (supportsImages) {
      return isError ? "[tool error] (see attached image)" : "(see attached image)";
    }
    return isError
      ? "[tool error] (image omitted: model does not support images)"
      : "(image omitted: model does not support images)";
  }

  return isError ? "[tool error] (no tool output)" : "(no tool output)";
}

function usesReasoningEffort(model: Model<"mistral-chat">): boolean {
  return (
    model.id === "mistral-small-2603" ||
    model.id === "mistral-small-latest" ||
    model.id === "mistral-medium-3.5"
  );
}

function usesPromptModeReasoning(model: Model<"mistral-chat">): boolean {
  return !!model.reasoning && !usesReasoningEffort(model);
}

function mapReasoningEffort(
  model: Model<"mistral-chat">,
  level: Exclude<SimpleStreamOptions["reasoning"], undefined>["level"],
): MistralReasoningEffort {
  return (model.thinkingLevelMap?.[level as keyof typeof model.thinkingLevelMap] ?? "high") as MistralReasoningEffort;
}

function mapChatStopReason(reason: string | null): StopReason {
  if (reason === null) {
    return "stop";
  }
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
    case "model_length":
      return "length";
    case "tool_calls":
      return "toolUse";
    case "error":
      return "error";
    default:
      return "stop";
  }
}
