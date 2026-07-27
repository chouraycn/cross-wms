export const MODEL_APIS = [
  "openai-completions",
  "openai-responses",
  "openai-chatgpt-responses",
  "anthropic-messages",
  "google-generative-ai",
  "google-vertex",
  "github-copilot",
  "bedrock-converse-stream",
  "ollama",
  "azure-openai-responses",
] as const;

export type ModelApi = (typeof MODEL_APIS)[number];

export type SupportedThinkingFormat =
  | "openai"
  | "deepseek"
  | "openrouter"
  | "together"
  | "qwen"
  | "qwen-chat-template"
  | "zai";

export const MODEL_THINKING_FORMATS = [
  "openai",
  "openrouter",
  "deepseek",
  "together",
  "qwen",
  "qwen-chat-template",
  "zai",
] as const satisfies readonly SupportedThinkingFormat[];

export function isModelThinkingFormat(value: string): value is SupportedThinkingFormat {
  return (MODEL_THINKING_FORMATS as readonly string[]).includes(value);
}

export type ModelCompatConfig = {
  supportsStore?: boolean;
  supportsPromptCacheKey?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  supportsTools?: boolean;
  supportsStrictMode?: boolean;
  requiresStringContent?: boolean;
  strictMessageKeys?: boolean;
  visibleReasoningDetailTypes?: string[];
  supportedReasoningEfforts?: string[];
  reasoningEffortMap?: Record<string, string>;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  thinkingFormat?: SupportedThinkingFormat;
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  requiresReasoningContentOnAssistantMessages?: boolean;
  toolSchemaProfile?: string;
  unsupportedToolSchemaKeywords?: string[];
  nativeWebSearchTool?: boolean;
  toolCallArgumentsEncoding?: string;
  requiresMistralToolIds?: boolean;
  requiresOpenAiAnthropicToolPayload?: boolean;
};

export type ModelImageInputConfig = {
  maxBytes?: number;
  maxPixels?: number;
  maxSidePx?: number;
  preferredSidePx?: number;
  tokenMode?: "tile" | "detail" | "provider";
};

export type ModelMediaInputConfig = {
  image?: ModelImageInputConfig;
};

export type ModelProviderAuthMode = "api-key" | "aws-sdk" | "oauth" | "token";

export type ModelProviderLocalServiceConfig = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  healthUrl?: string;
  readyTimeoutMs?: number;
  idleStopMs?: number;
};

export type ModelDefinitionConfig = {
  id: string;
  name: string;
  api?: ModelApi;
  baseUrl?: string;
  reasoning: boolean;
  input: Array<"text" | "image" | "video" | "audio">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    tieredPricing?: Array<{
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      range: [number, number] | [number];
    }>;
  };
  contextWindow: number;
  contextTokens?: number;
  maxTokens: number;
  thinkingLevelMap?: Record<string, string | null>;
  params?: Record<string, unknown>;
  agentRuntime?: AgentRuntimePolicyConfig;
  headers?: Record<string, string>;
  compat?: ModelCompatConfig;
  mediaInput?: ModelMediaInputConfig;
  metadataSource?: "models-add";
};

export type ModelProviderConfig = {
  baseUrl: string;
  apiKey?: SecretInput;
  auth?: ModelProviderAuthMode;
  api?: ModelApi;
  contextWindow?: number;
  contextTokens?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  region?: string;
  injectNumCtxForOpenAICompat?: boolean;
  params?: Record<string, unknown>;
  agentRuntime?: AgentRuntimePolicyConfig;
  localService?: ModelProviderLocalServiceConfig;
  headers?: Record<string, SecretInput>;
  authHeader?: boolean;
  request?: ConfiguredModelProviderRequest;
  models: ModelDefinitionConfig[];
};

export type ModelProviderDeclarationConfig = ModelProviderConfig;

export type ModelProviderConfigInput = Omit<Partial<ModelProviderConfig>, "models"> & {
  models?: ModelDefinitionConfig[];
};

export type BedrockDiscoveryConfig = {
  enabled?: boolean;
  region?: string;
  providerFilter?: string[];
  refreshInterval?: number;
  defaultContextWindow?: number;
  defaultMaxTokens?: number;
};

export type DiscoveryToggleConfig = {
  enabled?: boolean;
};

export type ModelPricingConfig = {
  enabled?: boolean;
};

export type ModelsConfig = {
  mode?: "merge" | "replace";
  providers?: Record<string, ModelProviderConfig>;
  pricing?: ModelPricingConfig;
};

export type ModelsConfigInput = Omit<ModelsConfig, "providers"> & {
  providers?: Record<string, ModelProviderConfigInput>;
};

type AgentRuntimePolicyConfig = {
  id?: string;
};

type ConfiguredModelProviderRequest = {
  headers?: Record<string, SecretInput>;
  auth?:
    | { mode: "provider-default" }
    | { mode: "authorization-bearer"; token: SecretInput }
    | { mode: "header"; headerName: string; value: SecretInput; prefix?: string };
  proxy?:
    | { mode: "env-proxy"; tls?: ConfiguredProviderRequestTls }
    | { mode: "explicit-proxy"; url: string; tls?: ConfiguredProviderRequestTls };
  tls?: ConfiguredProviderRequestTls;
  allowPrivateNetwork?: boolean;
};

type ConfiguredProviderRequestTls = {
  ca?: SecretInput;
  cert?: SecretInput;
  key?: SecretInput;
  passphrase?: SecretInput;
  serverName?: string;
  insecureSkipVerify?: boolean;
};

type SecretInput = string | SecretRef;

type SecretRef = {
  source: "env" | "file" | "exec";
  provider: string;
  id: string;
};
