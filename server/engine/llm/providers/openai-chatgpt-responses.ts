import { stripSystemPromptCacheBoundary } from '../../agents/system-prompt-cache-boundary.js';
import { getEnvApiKey } from '../env-api-keys.js';
import { clampThinkingLevel } from '../model-utils.js';
import { registerSessionResourceCleanup } from '../session-resources.js';
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  SimpleStreamOptions,
  StreamFunction,
  StreamOptions,
  Usage,
} from '../extended-types.js';
import {
  appendAssistantMessageDiagnostic,
  createAssistantMessageDiagnostic,
  formatThrownValue,
} from '../utils/diagnostics.js';
import { AssistantMessageEventStream } from '../utils/event-stream.js';
import { headersToRecord } from '../headers.js';
import { resolveOpenAICodexAccountId } from '../utils/openai-chatgpt-jwt.js';
import { clampOpenAIPromptCacheKey } from './openai-prompt-cache.js';
import {
  convertResponsesMessages,
  convertResponsesToolPayload,
  processResponsesStream,
} from './openai-responses-shared.js';
import type { OpenAIResponsesStreamEvent } from './openai-responses-shared.js';
import { buildBaseOptions } from './simple-options.js';

const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const CODEX_TOOL_CALL_PROVIDERS = new Set(["openai", "opencode"]);
const WEBSOCKET_MESSAGE_TOO_BIG_CLOSE_CODE = 1009;

type CodexResponseStatus =
  | "completed"
  | "incomplete"
  | "failed"
  | "cancelled"
  | "queued"
  | "in_progress";

const CODEX_RESPONSE_STATUSES = new Set<CodexResponseStatus>([
  "completed",
  "incomplete",
  "failed",
  "cancelled",
  "queued",
  "in_progress",
]);

export interface OpenAICodexResponsesOptions extends StreamOptions {
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  reasoningSummary?: "auto" | "concise" | "detailed" | "off" | "on" | null;
  serviceTier?: string;
  textVerbosity?: "low" | "medium" | "high";
}

interface RequestBody {
  model: string;
  store?: boolean;
  input?: unknown;
  stream?: boolean;
}

export const streamOpenAICodexResponses: StreamFunction<"openai-responses", OpenAICodexResponsesOptions> = (
  model: Model<"openai-responses">,
  context: Context,
  options?: OpenAICodexResponsesOptions,
) => {
  const stream = new AssistantMessageEventStream();

  void (async () => {
    const output = createOutput(model);

    try {
      const apiKey = options?.apiKey || getEnvApiKey(model.provider);
      if (!apiKey) {
        throw new Error(`No API key for provider: ${model.provider}`);
      }

      stream.push({ type: "start", partial: output });
      await simulateCodexStream(model, output, stream, context, options, apiKey);

      if (options?.signal?.aborted) {
        throw new Error("Request was aborted");
      }

      if (output.stopReason === "aborted" || output.stopReason === "error") {
        throw new Error("An unknown error occurred");
      }

      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end();
    } catch (error) {
      appendAssistantMessageDiagnostic(
        output as unknown as Parameters<typeof appendAssistantMessageDiagnostic>[0],
        createAssistantMessageDiagnostic("stream_error", error),
      );
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = formatThrownValue(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
};

export const streamSimpleOpenAICodex: StreamFunction<"openai-responses", SimpleStreamOptions> = (
  model: Model<"openai-responses">,
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

  return streamOpenAICodexResponses(model, context, {
    ...base,
    reasoningEffort: reasoning ? (reasoning as OpenAICodexResponsesOptions["reasoningEffort"]) : undefined,
  } as OpenAICodexResponsesOptions);
};

function createOutput(model: Model<"openai-responses">): AssistantMessage {
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

async function simulateCodexStream(
  model: Model<"openai-responses">,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  _context: Context,
  _options: OpenAICodexResponsesOptions | undefined,
  _apiKey: string,
): Promise<void> {
  await processResponsesStream(model, output, stream, [] as unknown as AsyncIterable<OpenAIResponsesStreamEvent>);
}

export function buildCodexRequestBody(
  model: Model<"openai-responses">,
  context: Context,
  options?: OpenAICodexResponsesOptions,
): RequestBody {
  const body: RequestBody = {
    model: model.id,
  };

  return body;
}

export function buildCodexHeaders(
  _model: Model<"openai-responses">,
  _apiKey: string,
  _options?: OpenAICodexResponsesOptions,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

export function getCodexBaseUrl(model: Model<"openai-responses">): string {
  const modelBaseUrl = (model as unknown as { baseUrl?: string }).baseUrl;
  return modelBaseUrl || DEFAULT_CODEX_BASE_URL;
}
