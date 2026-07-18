export type IsolatedAgentRunMode = "regular" | "dry-run" | "preview";

export type IsolatedAgentRunOrigin = "scheduled" | "manual" | "retry";

export type IsolatedAgentExitCode = "ok" | "error" | "timeout" | "cancelled";

export interface IsolatedAgentRunMetadata {
  runId: string;
  jobId: string;
  jobName: string;
  mode: IsolatedAgentRunMode;
  origin: IsolatedAgentRunOrigin;
  startedAtMs: number;
  completedAtMs?: number;
  durationMs?: number;
  exitCode?: IsolatedAgentExitCode;
  error?: string;
}

export interface IsolatedAgentRuntimeConfig {
  allowUnsafeExternalContent?: boolean;
  lightContext?: boolean;
  toolsAllow?: string[];
  timeoutSeconds?: number;
  noOutputTimeoutSeconds?: number;
  maxOutputBytes?: number;
}

export interface IsolatedAgentAuthProfile {
  kind: "none" | "api-key" | "oauth";
  apiKey?: string;
  oauthToken?: string;
  oauthRefreshToken?: string;
}

export interface IsolatedAgentModelSelection {
  model?: string;
  provider?: string;
  fallbacks?: string[];
}

export interface IsolatedAgentSubagentInfo {
  id: string;
  name: string;
  description?: string;
}

export interface IsolatedAgentSessionState {
  sessionId?: string;
  sessionKey?: string;
  threadId?: string;
  hasMessages?: boolean;
}

export interface IsolatedAgentDeliveryOptions {
  mode?: "none" | "announce" | "webhook";
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  bestEffort?: boolean;
}

export interface IsolatedAgentExternalContent {
  url?: string;
  content?: string;
  contentType?: string;
  cacheKey?: string;
}

export interface IsolatedAgentFallbackPolicy {
  enabled?: boolean;
  maxAttempts?: number;
  waitMs?: number;
  models?: string[];
}

export interface IsolatedAgentModelCatalog {
  models: IsolatedAgentModelInfo[];
}

export interface IsolatedAgentModelInfo {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
  maxInputTokens?: number;
  maxOutputTokens?: number;
}