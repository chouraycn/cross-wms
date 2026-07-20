/**
 * Transcript replay policy resolution.
 * Ported from openclaw/src/agents/transcript-policy.ts
 */

type ToolCallIdMode = "strict" | "relaxed";

type TranscriptSanitizeMode = "full" | "images-only";

export type TranscriptPolicy = {
  sanitizeMode: TranscriptSanitizeMode;
  sanitizeToolCallIds: boolean;
  toolCallIdMode?: ToolCallIdMode;
  duplicateToolCallIdStyle?: "openai";
  preserveNativeAnthropicToolUseIds: boolean;
  repairToolUseResultPairing: boolean;
  preserveSignatures: boolean;
  sanitizeThoughtSignatures?: {
    allowBase64Only?: boolean;
    includeCamelCase?: boolean;
  };
  sanitizeThinkingSignatures: boolean;
  dropThinkingBlocks: boolean;
  dropReasoningFromHistory?: boolean;
  applyGoogleTurnOrdering: boolean;
  validateGeminiTurns: boolean;
  validateAnthropicTurns: boolean;
  allowSyntheticToolResults: boolean;
};

const SIGNED_THINKING_PROVIDERS = new Set(["anthropic", "amazon-bedrock", "anthropic-vertex"]);

function normalizeProviderId(provider: string | null | undefined): string {
  if (!provider) return "";
  return provider.toLowerCase().trim();
}

/** Return true when a provider family owns signed thinking blocks. */
export function providerRequiresSignedThinking(provider?: string | null): boolean {
  return SIGNED_THINKING_PROVIDERS.has(normalizeProviderId(provider));
}

/** Decide whether signed thinking can be replayed under the current provider policy. */
export function shouldAllowProviderOwnedThinkingReplay(params: {
  modelApi?: string | null;
  provider?: string | null;
  policy: Pick<
    TranscriptPolicy,
    "validateAnthropicTurns" | "preserveSignatures" | "dropThinkingBlocks"
  >;
}): boolean {
  const hasProviderOwnedSignedThinking =
    params.policy.preserveSignatures || providerRequiresSignedThinking(params.provider);
  const isAnthropicApi =
    params.modelApi === "anthropic-messages" || params.modelApi === "bedrock-converse-stream";
  return (
    isAnthropicApi &&
    params.policy.validateAnthropicTurns &&
    hasProviderOwnedSignedThinking &&
    !params.policy.dropThinkingBlocks
  );
}

const DEFAULT_TRANSCRIPT_POLICY: TranscriptPolicy = {
  sanitizeMode: "images-only",
  sanitizeToolCallIds: false,
  toolCallIdMode: undefined,
  duplicateToolCallIdStyle: undefined,
  preserveNativeAnthropicToolUseIds: false,
  repairToolUseResultPairing: true,
  preserveSignatures: false,
  sanitizeThoughtSignatures: undefined,
  sanitizeThinkingSignatures: false,
  dropThinkingBlocks: false,
  dropReasoningFromHistory: false,
  applyGoogleTurnOrdering: false,
  validateGeminiTurns: false,
  validateAnthropicTurns: false,
  allowSyntheticToolResults: false,
};

/** Resolve and cache the effective replay policy for a provider/model/config tuple. */
export function resolveTranscriptPolicy(params: {
  modelApi?: string | null;
  provider?: string | null;
  modelId?: string | null;
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  model?: unknown;
  runtimeHandle?: unknown;
}): TranscriptPolicy {
  const provider = normalizeProviderId(params.provider);
  const modelApi = params.modelApi;
  const isAnthropic = modelApi === "anthropic-messages" || modelApi === "bedrock-converse-stream";
  const isGoogle = modelApi === "google-gemini" || modelApi === "gemini";
  const isOpenAi = modelApi === "openai-completions" || modelApi === "openai-responses";

  // Apply provider-specific overrides to the default policy
  const policy: TranscriptPolicy = { ...DEFAULT_TRANSCRIPT_POLICY };

  if (isAnthropic) {
    policy.sanitizeMode = "full";
    policy.sanitizeToolCallIds = true;
    policy.toolCallIdMode = "strict";
    policy.preserveSignatures = true;
    policy.validateAnthropicTurns = true;
    policy.allowSyntheticToolResults = true;
  }

  if (isGoogle) {
    policy.sanitizeMode = "full";
    policy.sanitizeToolCallIds = true;
    policy.toolCallIdMode = "strict";
    policy.sanitizeThoughtSignatures = { allowBase64Only: true, includeCamelCase: true };
    policy.applyGoogleTurnOrdering = true;
    policy.validateGeminiTurns = true;
    policy.allowSyntheticToolResults = true;
  }

  if (isOpenAi) {
    policy.sanitizeToolCallIds = true;
    policy.toolCallIdMode = "strict";
    policy.applyGoogleTurnOrdering = true;
    policy.validateGeminiTurns = true;
    policy.validateAnthropicTurns = true;
    policy.allowSyntheticToolResults = true;
  }

  return policy;
}
