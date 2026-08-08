import {
  splitSystemPromptCacheBoundary,
  stripSystemPromptCacheBoundary,
} from '../../agents/system-prompt-cache-boundary.js';
import { getEnvApiKey } from '../env-api-keys.js';
import { calculateCost, clampThinkingLevel } from '../model-utils.js';
import type {
  AssistantMessage,
  CacheRetention,
  Context,
  ImageContent,
  Message,
  Model,
  OpenAICompletionsCompat,
  SimpleStreamOptions,
  StreamFunction,
  StreamOptions,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCall,
  ToolResultMessage,
} from '../extended-types.js';
import { AssistantMessageEventStream } from '../utils/event-stream.js';
import { headersToRecord } from '../headers.js';
import { parseStreamingJson } from '../utils/json-parse.js';
import { sanitizeSurrogates } from '../utils/sanitize-unicode.js';
import { resolveCacheRetention } from './cache-retention.js';
import { isCloudflareProvider, resolveCloudflareBaseUrl } from './cloudflare.js';
import { clampOpenAIPromptCacheKey } from './openai-prompt-cache.js';
import { mapOpenAIStopReason } from './openai-stop-reason.js';
import { buildBaseOptions } from './simple-options.js';
import { transformMessages } from './transform-messages.js';

function hasToolHistory(messages: Message[]): boolean {
  for (const msg of messages) {
    if (msg.role === "toolResult") {
      return true;
    }
    if (msg.role === "assistant") {
      if (Array.isArray(msg.content) && msg.content.some((block) => block.type === "toolCall")) {
        return true;
      }
    }
  }
  return false;
}

function isTextContentBlock(block: { type: string }): block is TextContent {
  return block.type === "text";
}

function isThinkingContentBlock(block: { type: string }): block is ThinkingContent {
  return block.type === "thinking";
}

function isToolCallBlock(block: { type: string }): block is ToolCall {
  return block.type === "toolCall";
}

function isImageContentBlock(block: { type: string }): block is ImageContent {
  return block.type === "image";
}

export interface OpenAICompletionsOptions extends StreamOptions {
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

interface OpenAICompatCacheControl {
  type: "ephemeral";
  ttl?: string;
}

export const streamOpenAICompletions: StreamFunction<"openai-completions", OpenAICompletionsOptions> = (
  model: Model<"openai-completions">,
  context: Context,
  options?: OpenAICompletionsOptions,
) => {
  const stream = new AssistantMessageEventStream();

  void (async () => {
    const output = createOutput(model);

    try {
      const apiKey = options?.apiKey || getEnvApiKey(model.provider);
      if (!apiKey) {
        throw new Error(`No API key for provider: ${model.provider}`);
      }

      const transformedMessages = transformMessages(context.messages, model);

      stream.push({ type: "start", partial: output });
      await simulateCompletionsStream(model, output, stream, transformedMessages, context, options, apiKey);

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
      output.errorMessage = formatOpenAIError(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
};

export const streamSimpleOpenAICompletions: StreamFunction<"openai-completions", SimpleStreamOptions> = (
  model: Model<"openai-completions">,
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

  return streamOpenAICompletions(model, context, {
    ...base,
    reasoningEffort: reasoning ? (reasoning as OpenAICompletionsOptions["reasoningEffort"]) : undefined,
  } as OpenAICompletionsOptions);
};

function createOutput(model: Model<"openai-completions">): AssistantMessage {
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

function formatOpenAIError(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function simulateCompletionsStream(
  model: Model<"openai-completions">,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  _messages: Message[],
  _context: Context,
  _options: OpenAICompletionsOptions | undefined,
  _apiKey: string,
): Promise<void> {
  const currentBlock: TextContent | ThinkingContent | null = null;
  const blocks = output.content;
  const blockIndex = () => blocks.length - 1;
  const toolBlocksById = new Map<string, number>();

  const finishCurrentBlock = (block: TextContent | ThinkingContent | null) => {
    if (!block) return;
    if (block.type === "text") {
      stream.push({
        type: "text_end",
        contentIndex: blockIndex(),
        content: block.text,
        partial: output,
      });
    } else if (block.type === "thinking") {
      stream.push({
        type: "thinking_end",
        contentIndex: blockIndex(),
        content: block.thinking,
        partial: output,
      });
    }
  };

  output.usage.input = 0;
  output.usage.output = 0;
  output.usage.cacheRead = 0;
  output.usage.cacheWrite = 0;
  output.usage.totalTokens = 0;
  calculateCost(model, output.usage);

  finishCurrentBlock(currentBlock);

  for (const index of toolBlocksById.values()) {
    const block = output.content[index];
    if (block.type !== "toolCall") continue;
    const toolBlock = block as ToolCall & { partialArgs?: string };
    toolBlock.arguments = parseStreamingJson(toolBlock.partialArgs);
    delete toolBlock.partialArgs;
    stream.push({
      type: "toolcall_end",
      contentIndex: index,
      toolCall: toolBlock,
      partial: output,
    });
  }
}

export function buildOpenAIChatMessages(
  model: Model<"openai-completions">,
  context: Context,
  options?: OpenAICompletionsOptions,
): Array<Record<string, any>> {
  const modelInput = (model as unknown as { input?: string[] }).input || [];
  const transformedMessages = transformMessages(context.messages, model);
  const result: Array<Record<string, any>> = [];

  if (context.systemPrompt) {
    result.push({
      role: "system",
      content: sanitizeSurrogates(stripSystemPromptCacheBoundary(context.systemPrompt) as string),
    });
  }

  for (const msg of transformedMessages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: sanitizeSurrogates(msg.content) });
      } else {
        const content = msg.content.map((item) => {
          if (item.type === "text") {
            return { type: "text", text: sanitizeSurrogates(item.text) };
          }
          return {
            type: "image_url",
            image_url: { url: `data:${item.mimeType};base64,${item.data}` },
          };
        });
        result.push({ role: "user", content });
      }
    } else if (msg.role === "assistant") {
      const contentParts: Array<{ type: string; text?: string }> = [];
      const toolCalls: Array<Record<string, any>> = [];

      for (const block of msg.content) {
        if (block.type === "text") {
          if (block.text.trim().length > 0) {
            contentParts.push({ type: "text", text: sanitizeSurrogates(block.text) });
          }
        } else if (block.type === "thinking") {
          if (block.thinking.trim().length > 0) {
            contentParts.push({ type: "text", text: sanitizeSurrogates(block.thinking) });
          }
        } else if (block.type === "toolCall") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.arguments || {}),
            },
          });
        }
      }

      const assistantMsg: Record<string, any> = { role: "assistant" };
      if (contentParts.length > 0) {
        assistantMsg.content = contentParts.length === 1 ? contentParts[0].text : contentParts;
      }
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      if (contentParts.length > 0 || toolCalls.length > 0) {
        result.push(assistantMsg);
      }
    } else if (msg.role === "toolResult") {
      const textResult = msg.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      result.push({
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: sanitizeSurrogates(textResult),
      });
    }
  }

  return result;
}

export function buildOpenAITools(tools: Tool[]): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, any> } }> {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, any>,
    },
  }));
}
