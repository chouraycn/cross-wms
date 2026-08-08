import { stripSystemPromptCacheBoundary } from '../../agents/system-prompt-cache-boundary.js';
import { calculateCost, clampThinkingLevel } from '../model-utils.js';
import type {
  AssistantMessage,
  Context,
  ImageContent,
  Model,
  SimpleStreamOptions,
  StopReason,
  TextContent,
  ThinkingBudgets,
  ThinkingContent,
  ThinkingLevel as AgentThinkingLevel,
  Tool,
  ToolCall,
  StreamOptions,
} from '../extended-types.js';
import type { AssistantMessageEventStream } from '../utils/event-stream.js';
import { sanitizeSurrogates } from '../utils/sanitize-unicode.js';
import { transformMessages } from './transform-messages.js';

export type GoogleApiType = "google-gemini";

export type GoogleThinkingLevel =
  | "THINKING_LEVEL_UNSPECIFIED"
  | "MINIMAL"
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type GoogleToolChoice = "auto" | "none" | "any";

export type GoogleThinkingOptions = {
  enabled: boolean;
  budgetTokens?: number;
  level?: GoogleThinkingLevel;
};

export type GoogleProviderOptions = StreamOptions & {
  toolChoice?: GoogleToolChoice;
  thinking?: GoogleThinkingOptions;
};

type ClampedGoogleThinkingLevel = Exclude<AgentThinkingLevel, "xhigh" | "max">;

export function isThinkingPart(part: { thought?: boolean; thoughtSignature?: string }): boolean {
  return part.thought === true;
}

export function retainThoughtSignature(
  existing: string | undefined,
  incoming: string | undefined,
): string | undefined {
  if (typeof incoming === "string" && incoming.length > 0) {
    return incoming;
  }
  return existing;
}

const base64SignaturePattern = /^[A-Za-z0-9+/]+={0,2}$/;

function isValidThoughtSignature(signature: string | undefined): boolean {
  if (!signature) {
    return false;
  }
  if (signature.length % 4 !== 0) {
    return false;
  }
  return base64SignaturePattern.test(signature);
}

function resolveThoughtSignature(
  isSameProviderAndModel: boolean,
  signature: string | undefined,
): string | undefined {
  return isSameProviderAndModel && isValidThoughtSignature(signature) ? signature : undefined;
}

export function requiresToolCallId(modelId: string): boolean {
  return modelId.startsWith("claude-") || modelId.startsWith("gpt-oss-");
}

function getGeminiMajorVersion(modelId: string): number | undefined {
  const match = modelId.toLowerCase().match(/^gemini(?:-live)?-(\d+)/);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

function supportsMultimodalFunctionResponse(modelId: string): boolean {
  const geminiMajorVersion = getGeminiMajorVersion(modelId);
  if (geminiMajorVersion !== undefined) {
    return geminiMajorVersion >= 3;
  }
  return true;
}

export type GeminiPart =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, any>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, any> } };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export function convertMessages(
  model: Model<GoogleApiType>,
  context: Context,
): GeminiContent[] {
  const modelInput = (model as unknown as { input?: string[] }).input || [];
  const contents: GeminiContent[] = [];
  const normalizeToolCallId = (id: string): string => {
    if (!requiresToolCallId(model.id)) {
      return id;
    }
    return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  };

  const transformedMessages = transformMessages(context.messages, model, normalizeToolCallId as (id: string, model: Model<GoogleApiType>, source: AssistantMessage) => string);

  const pendingToolResultImageTurns: GeminiContent[] = [];
  let activeToolResultParts: GeminiPart[] | undefined;
  const flushToolResultRun = (): void => {
    contents.push(...pendingToolResultImageTurns);
    pendingToolResultImageTurns.length = 0;
    activeToolResultParts = undefined;
  };

  for (const msg of transformedMessages) {
    if (msg.role !== "toolResult") {
      flushToolResultRun();
    }
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        contents.push({
          role: "user",
          parts: [{ text: sanitizeSurrogates(msg.content) }],
        });
      } else {
        const parts: GeminiPart[] = msg.content.map((item) => {
          if (item.type === "text") {
            return { text: sanitizeSurrogates(item.text) };
          }
          return {
            inlineData: {
              mimeType: item.mimeType,
              data: item.data,
            },
          };
        });
        if (parts.length === 0) {
          continue;
        }
        contents.push({
          role: "user",
          parts,
        });
      }
    } else if (msg.role === "assistant") {
      const parts: GeminiPart[] = [];
      const isSameProviderAndModel = msg.provider === model.provider && msg.model === model.id;

      for (const block of msg.content) {
        if (block.type === "text") {
          if (!block.text || block.text.trim() === "") {
            continue;
          }
          const thoughtSignature = resolveThoughtSignature(
            isSameProviderAndModel,
            block.textSignature,
          );
          parts.push({
            text: sanitizeSurrogates(block.text),
            ...(thoughtSignature && { thoughtSignature }),
          });
        } else if (block.type === "thinking") {
          if (!block.thinking || block.thinking.trim() === "") {
            continue;
          }
          if (isSameProviderAndModel) {
            const thoughtSignature = resolveThoughtSignature(
              isSameProviderAndModel,
              block.thinkingSignature,
            );
            parts.push({
              thought: true,
              text: sanitizeSurrogates(block.thinking),
              ...(thoughtSignature && { thoughtSignature }),
            });
          } else {
            parts.push({
              text: sanitizeSurrogates(block.thinking),
            });
          }
        } else if (block.type === "toolCall") {
          const thoughtSignature = resolveThoughtSignature(
            isSameProviderAndModel,
            block.thoughtSignature,
          );
          const part: GeminiPart = {
            functionCall: {
              name: block.name,
              args: block.arguments ?? {},
              ...(requiresToolCallId(model.id) ? { id: block.id } : {}),
            },
            ...(thoughtSignature && { thoughtSignature }),
          };
          parts.push(part);
        }
      }

      if (parts.length === 0) {
        continue;
      }
      contents.push({
        role: "model",
        parts,
      });
    } else if (msg.role === "toolResult") {
      const textContent = msg.content.filter((c): c is TextContent => c.type === "text");
      const textResult = textContent.map((c) => c.text).join("\n");
      const imageContent = modelInput.includes("image")
        ? msg.content.filter((c): c is ImageContent => c.type === "image")
        : [];

      const hasText = textResult.length > 0;
      const hasImages = imageContent.length > 0;

      const modelSupportsMultimodalFunctionResponse = supportsMultimodalFunctionResponse(model.id);

      const responseValue = hasText
        ? sanitizeSurrogates(textResult)
        : hasImages
          ? "(see attached image)"
          : "";

      const responseObj: Record<string, any> = msg.isError
        ? { error: responseValue }
        : { output: responseValue };

      if (modelSupportsMultimodalFunctionResponse && hasImages) {
        const functionResponseParts: GeminiPart[] = [
          {
            functionResponse: {
              name: msg.toolName,
              response: responseObj,
            },
          },
        ];
        for (const img of imageContent) {
          functionResponseParts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            },
          });
        }
        if (!activeToolResultParts) {
          activeToolResultParts = functionResponseParts;
          contents.push({
            role: "user",
            parts: activeToolResultParts,
          });
        } else {
          activeToolResultParts.push(...functionResponseParts);
        }
      } else {
        if (hasImages && !modelSupportsMultimodalFunctionResponse) {
          pendingToolResultImageTurns.push({
            role: "user",
            parts: imageContent.map((img) => ({
              inlineData: {
                mimeType: img.mimeType,
                data: img.data,
              },
            })),
          });
        }

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.toolName,
                response: responseObj,
              },
            },
          ],
        });
      }
    }
  }

  flushToolResultRun();
  return contents;
}

export function convertSystemInstruction(
  context: Context,
): string | undefined {
  if (!context.systemPrompt) {
    return undefined;
  }
  return sanitizeSurrogates(stripSystemPromptCacheBoundary(context.systemPrompt) as string);
}

export function convertTools(tools: Tool[]): Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, any> }> }> {
  if (tools.length === 0) {
    return [];
  }
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, any>,
      })),
    },
  ];
}

export function mapGoogleFinishReason(reason: string | undefined): StopReason {
  if (!reason) return "stop";
  switch (reason) {
    case "STOP":
    case "MAX_TOKENS":
      return reason === "STOP" ? "stop" : "length";
    case "TOOL_CALL":
    case "FUNCTION_CALL":
      return "toolUse";
    case "RECITATION":
    case "SAFETY":
    case "LANGUAGE":
    case "OTHER":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
    case "MALFORMED_FUNCTION_CALL":
      return "error";
    default:
      return "stop";
  }
}

const THINKING_LEVEL_MAP: Record<ClampedGoogleThinkingLevel, GoogleThinkingLevel> = {
  off: "THINKING_LEVEL_UNSPECIFIED",
  minimal: "MINIMAL",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};

export function resolveGoogleThinkingConfig(
  model: Model<GoogleApiType>,
  options?: GoogleProviderOptions,
): GoogleThinkingOptions | undefined {
  if (!model.reasoning) return undefined;

  const thinkingLevel = options?.thinkingLevel ?? "off";
  if (thinkingLevel === "off") return undefined;

  const clampedLevel = (thinkingLevel === "xhigh" || thinkingLevel === "max"
    ? "high"
    : thinkingLevel) as ClampedGoogleThinkingLevel;

  const defaultBudgets: ThinkingBudgets = {
    off: 0,
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 16384,
    max: 32768,
  };

  return {
    enabled: true,
    level: THINKING_LEVEL_MAP[clampedLevel],
    budgetTokens: defaultBudgets[clampedLevel],
  };
}

export function buildGoogleGenerationConfig(
  model: Model<GoogleApiType>,
  options?: GoogleProviderOptions,
): Record<string, any> {
  const config: Record<string, any> = {};

  if (options?.temperature !== undefined) {
    config.temperature = options.temperature;
  }
  if (options?.maxTokens !== undefined) {
    config.maxOutputTokens = options.maxTokens;
  }
  if (options?.stop && options.stop.length > 0) {
    config.stopSequences = options.stop;
  }

  const thinkingConfig = resolveGoogleThinkingConfig(model, options);
  if (thinkingConfig) {
    config.thinkingConfig = thinkingConfig;
  }

  return config;
}

export function createGoogleOutput(model: Model<GoogleApiType>): AssistantMessage {
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
