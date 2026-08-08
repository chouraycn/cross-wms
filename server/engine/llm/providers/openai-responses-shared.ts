import { stripSystemPromptCacheBoundary } from '../../agents/system-prompt-cache-boundary.js';
import { calculateCost, clampThinkingLevel } from '../model-utils.js';
import type {
  Api,
  AssistantMessage,
  Context,
  ImageContent,
  Model,
  SimpleStreamOptions,
  StopReason,
  StreamOptions,
  TextContent,
  TextSignatureV1,
  ThinkingContent,
  ToolCall,
  Usage,
} from '../extended-types.js';
import type { AssistantMessageEventStream } from '../utils/event-stream.js';
import { shortHash } from '../utils/hash.js';
import { headersToRecord } from '../headers.js';
import { parseStreamingJson } from '../utils/json-parse.js';
import { sanitizeSurrogates } from '../utils/sanitize-unicode.js';
import { convertResponsesToolPayload, convertResponsesTools } from './openai-responses-tools.js';
import { transformMessages } from './transform-messages.js';

export { convertResponsesToolPayload, convertResponsesTools };
export type { ConvertResponsesToolsOptions } from './openai-responses-tools.js';

type ReplayableResponseOutputMessage = { id?: string; role?: string; content: Array<{ type: string; text?: string }> };
type ReplayableResponseReasoningItem = { id?: string; summary?: string[] };
type ResponsesTextContentPart = { type: string; text?: string };

export type OpenAIResponsesStreamEvent = {
  type: string;
  [key: string]: any;
};

function normalizeResponsesReasoningReplayItem(params: {
  item: ReplayableResponseReasoningItem;
  replayResponsesItemIds: boolean;
}): ReplayableResponseReasoningItem {
  const next = { ...(params.item as ReplayableResponseReasoningItem & Record<string, any>) };
  if (!Array.isArray(next.summary)) {
    next.summary = [];
  }
  if (!params.replayResponsesItemIds) {
    delete next.id;
  }
  return next as ReplayableResponseReasoningItem;
}

function encodeTextSignatureV1(id: string, phase?: TextSignatureV1["phase"]): string {
  const payload: TextSignatureV1 = { v: 1, id };
  if (phase) {
    payload.phase = phase;
  }
  return JSON.stringify(payload);
}

function parseTextSignature(
  signature: string | undefined,
): { id?: string; phase?: TextSignatureV1["phase"] } | undefined {
  if (!signature) {
    return undefined;
  }
  if (signature.startsWith("{")) {
    try {
      const parsed = JSON.parse(signature) as Partial<TextSignatureV1>;
      if (parsed.v === 1) {
        const id = typeof parsed.id === "string" ? parsed.id : undefined;
        const phase =
          parsed.phase === "commentary" || parsed.phase === "final_answer"
            ? parsed.phase
            : undefined;
        if (id !== undefined || phase !== undefined) {
          return { id, phase };
        }
        return undefined;
      }
    } catch {
      // Fall through to legacy plain-string handling.
    }
  }
  return { id: signature };
}

function resolveReplayableResponsesMessageId(params: {
  textSignatureId?: string;
  fallbackId: string;
  fallbackOrdinal: number;
  previousReplayItemWasReasoning: boolean;
}): string | undefined {
  if (!params.textSignatureId) {
    return params.fallbackOrdinal === 0
      ? params.fallbackId
      : `${params.fallbackId}_${params.fallbackOrdinal}`;
  }
  return params.previousReplayItemWasReasoning ? params.textSignatureId : undefined;
}

export interface OpenAIResponsesStreamOptions {
  serviceTier?: string;
  resolveServiceTier?: (
    responseServiceTier: string | undefined,
    requestServiceTier: string | undefined,
  ) => string | undefined;
  applyServiceTierPricing?: (
    usage: Usage,
    serviceTier: string | undefined,
  ) => void;
}

export interface ConvertResponsesMessagesOptions {
  includeSystemPrompt?: boolean;
  replayResponsesItemIds?: boolean;
}

export type ResponsesReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ResponsesReasoningSummary = "auto" | "detailed" | "concise" | null;

type ResponsesCommonParamsOptions = Pick<StreamOptions, "maxTokens" | "temperature"> & {
  reasoningEffort?: ResponsesReasoningEffort;
  reasoningSummary?: ResponsesReasoningSummary;
};

export function buildResponsesCommonParams<TApi extends Api>(
  model: Model<TApi>,
  options: ResponsesCommonParamsOptions,
): Record<string, any> {
  const params: Record<string, any> = {};

  if (options.temperature !== undefined) {
    params.temperature = options.temperature;
  }
  if (options.maxTokens !== undefined) {
    params.max_output_tokens = options.maxTokens;
  }

  if (options.reasoningEffort || options.reasoningSummary) {
    const reasoning: Record<string, any> = {};
    if (options.reasoningEffort) {
      reasoning.effort = options.reasoningEffort;
    }
    if (options.reasoningSummary !== undefined) {
      reasoning.summary = options.reasoningSummary;
    }
    if (Object.keys(reasoning).length > 0) {
      params.reasoning = reasoning;
    }
  }

  return params;
}

export function convertResponsesMessages<TApi extends Api>(
  messages: any[],
  model: Model<TApi>,
  options?: ConvertResponsesMessagesOptions,
): any[] {
  const includeSystemPrompt = options?.includeSystemPrompt ?? true;
  const normalizedMessages = transformMessages(
    messages as Parameters<typeof transformMessages>[0],
    model,
  );

  const result: any[] = [];
  let systemText = "";

  for (const msg of normalizedMessages) {
    const m = msg as { role: string; content: any };
    if (m.role === "system" && includeSystemPrompt) {
      if (typeof m.content === "string") {
        systemText += (systemText ? "\n\n" : "") + m.content;
      }
      continue;
    }

    if (m.role === "user") {
      const contentItems: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [];
      if (typeof m.content === "string") {
        contentItems.push({ type: "input_text", text: sanitizeSurrogates(m.content) });
      } else if (Array.isArray(m.content)) {
        for (const item of m.content) {
          const block = item as { type: string; text?: string; data?: string; mimeType?: string };
          if (block.type === "text") {
            contentItems.push({ type: "input_text", text: sanitizeSurrogates(block.text || "") });
          } else if (block.type === "image") {
            contentItems.push({
              type: "input_image",
              image_url: {
                url: `data:${block.mimeType};base64,${block.data}`,
                detail: "auto",
              },
            });
          }
        }
      }
      if (contentItems.length > 0) {
        result.push({ role: "user", content: contentItems });
      }
      continue;
    }

    if (m.role === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      const contentItems: any[] = [];
      for (const block of assistantMsg.content) {
        if (block.type === "text") {
          contentItems.push({ type: "output_text", text: sanitizeSurrogates(block.text) });
        } else if (block.type === "thinking") {
          contentItems.push({
            type: "reasoning",
            summary: block.thinking ? [{ type: "text", text: sanitizeSurrogates(block.thinking) }] : [],
          });
        } else if (block.type === "toolCall") {
          contentItems.push({
            type: "function_call",
            name: block.name,
            arguments: JSON.stringify(block.arguments || {}),
            id: block.id,
          });
        }
      }
      if (contentItems.length > 0) {
        result.push({ role: "assistant", content: contentItems });
      }
      continue;
    }

    if (m.role === "toolResult") {
      const toolMsg = msg as { toolCallId: string; toolName: string; content: Array<{ type: string; text?: string }>; isError?: boolean };
      const textContent = (toolMsg.content || [])
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text?: string }) => c.text || "")
        .join("\n");
      result.push({
        type: "function_call_output",
        call_id: toolMsg.toolCallId,
        output: textContent,
      });
    }
  }

  if (systemText && includeSystemPrompt) {
    result.unshift({
      role: "system",
      content: [{ type: "input_text", text: sanitizeSurrogates(stripSystemPromptCacheBoundary(systemText) as string) }],
    });
  }

  return result;
}

export async function processResponsesStream(
  model: Model,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  _responseStream: AsyncIterable<OpenAIResponsesStreamEvent>,
  options?: OpenAIResponsesStreamOptions,
): Promise<void> {
  const blocks = output.content;
  const blockIndex = () => blocks.length - 1;
  const currentBlock: TextContent | ThinkingContent | null = null;

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

  finishCurrentBlock(currentBlock);

  for (let i = 0; i < 3; i++) {
    output.usage.input = 0;
    output.usage.output = 0;
    output.usage.cacheRead = 0;
    output.usage.cacheWrite = 0;
    output.usage.totalTokens = 0;
    calculateCost(model, output.usage);
  }
}

export function mapResponsesStopReason(reason: string | undefined): StopReason {
  if (!reason) return "stop";
  switch (reason) {
    case "stop":
    case "end_turn":
      return "stop";
    case "length":
    case "max_tokens":
      return "length";
    case "tool_calls":
    case "tool_use":
      return "toolUse";
    case "content_filter":
      return "error";
    default:
      return "stop";
  }
}
