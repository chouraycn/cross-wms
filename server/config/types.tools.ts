export type MediaUnderstandingScopeMatch = {
  channel?: string;
  chatType?: string;
  keyPrefix?: string;
};

export type MediaUnderstandingScopeRule = {
  action: string;
  match?: MediaUnderstandingScopeMatch;
};

export type MediaUnderstandingScopeConfig = {
  default?: string;
  rules?: MediaUnderstandingScopeRule[];
};

export type MediaUnderstandingCapability = "image" | "audio" | "video";

export type MediaUnderstandingAttachmentsConfig = {
  mode?: "first" | "all";
  maxAttachments?: number;
  prefer?: "first" | "last" | "path" | "url";
};

export type MediaUnderstandingModelConfig = {
  provider?: string;
  model?: string;
  capabilities?: MediaUnderstandingCapability[];
  type?: "provider" | "cli";
  command?: string;
  args?: string[];
  maxChars?: number;
  maxBytes?: number;
  prompt?: string;
  timeoutSeconds?: number;
  language?: string;
  providerOptions?: Record<string, Record<string, string | number | boolean>>;
  deepgram?: {
    detectLanguage?: boolean;
    punctuate?: boolean;
    smartFormat?: boolean;
  };
  baseUrl?: string;
  headers?: Record<string, string>;
  request?: ConfiguredProviderRequest;
  profile?: string;
  preferredProfile?: string;
};

export type MediaUnderstandingConfig = {
  enabled?: boolean;
  scope?: MediaUnderstandingScopeConfig;
  maxBytes?: number;
  maxChars?: number;
  prompt?: string;
  _requestPromptOverride?: string;
  timeoutSeconds?: number;
  language?: string;
  _requestLanguageOverride?: string;
  attachments?: MediaUnderstandingAttachmentsConfig;
  models?: MediaUnderstandingModelConfig[];
  echoTranscript?: boolean;
  echoFormat?: string;
  providerOptions?: Record<string, Record<string, string | number | boolean>>;
  deepgram?: {
    detectLanguage?: boolean;
    punctuate?: boolean;
    smartFormat?: boolean;
  };
  baseUrl?: string;
  headers?: Record<string, string>;
  request?: ConfiguredProviderRequest;
};

export type LinkModelConfig = {
  type?: "cli";
  command: string;
  args?: string[];
  timeoutSeconds?: number;
};

export type LinkToolsConfig = {
  enabled?: boolean;
  scope?: MediaUnderstandingScopeConfig;
  maxLinks?: number;
  timeoutSeconds?: number;
  models?: LinkModelConfig[];
};

export type MediaToolsConfig = {
  models?: MediaUnderstandingModelConfig[];
  concurrency?: number;
  asyncCompletion?: {
    directSend?: boolean;
  };
  image?: MediaUnderstandingConfig;
  audio?: MediaUnderstandingConfig;
  video?: MediaUnderstandingConfig;
};

export type ToolProfileId = "minimal" | "coding" | "messaging" | "full";

export type ToolLoopDetectionDetectorConfig = {
  genericRepeat?: boolean;
  knownPollNoProgress?: boolean;
  pingPong?: boolean;
};

export type ToolLoopPostCompactionGuardConfig = {
  windowSize?: number;
};

export type ToolLoopDetectionConfig = {
  enabled?: boolean;
  historySize?: number;
  warningThreshold?: number;
  unknownToolThreshold?: number;
  criticalThreshold?: number;
  globalCircuitBreakerThreshold?: number;
  detectors?: ToolLoopDetectionDetectorConfig;
  postCompactionGuard?: ToolLoopPostCompactionGuardConfig;
};

export type ToolSearchConfig =
  | boolean
  | {
      enabled?: boolean;
      mode?: "code" | "tools" | "directory";
      codeTimeoutMs?: number;
      searchDefaultLimit?: number;
      maxSearchLimit?: number;
    };

export type CodeModeConfig =
  | boolean
  | {
      enabled?: boolean;
      runtime?: "quickjs-wasi";
      mode?: "only";
      languages?: Array<"javascript" | "typescript">;
      timeoutMs?: number;
      memoryLimitBytes?: number;
      maxOutputBytes?: number;
      maxSnapshotBytes?: number;
      maxPendingToolCalls?: number;
      snapshotTtlSeconds?: number;
      searchDefaultLimit?: number;
      maxSearchLimit?: number;
    };

export type SessionsToolsVisibility = "self" | "tree" | "agent" | "all";

export type ToolPolicyConfig = {
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
  profile?: ToolProfileId;
};

export type GroupToolPolicyConfig = {
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
};

export const TOOLS_BY_SENDER_KEY_TYPES = ["channel", "id", "e164", "username", "name"] as const;
export type ToolsBySenderKeyType = (typeof TOOLS_BY_SENDER_KEY_TYPES)[number];

export type GroupToolPolicyBySenderConfig = Record<string, GroupToolPolicyConfig>;

export type ExecToolConfig = {
  host?: "auto" | "sandbox" | "gateway" | "node";
  mode?: "deny" | "allowlist" | "ask" | "auto" | "full";
  security?: "deny" | "allowlist" | "full";
  ask?: "off" | "on-miss" | "always";
  node?: string;
  pathPrepend?: string[];
  safeBins?: string[];
  strictInlineEval?: boolean;
  commandHighlighting?: boolean;
  safeBinTrustedDirs?: string[];
  safeBinProfiles?: Record<string, SafeBinProfileFixture>;
  reviewer?: {
    model?: AgentModelConfig;
    timeoutMs?: number;
  };
  backgroundMs?: number;
  timeoutSec?: number;
  cleanupMs?: number;
  notifyOnExit?: boolean;
  notifyOnExitEmptySuccess?: boolean;
  applyPatch?: {
    enabled?: boolean;
    workspaceOnly?: boolean;
    allowModels?: string[];
  };
};

export type FsToolsConfig = {
  workspaceOnly?: boolean;
};

export type SessionsSpawnToolsConfig = {
  attachments?: {
    enabled?: boolean;
    maxTotalBytes?: number;
    maxFiles?: number;
    maxFileBytes?: number;
    retainOnSessionKeep?: boolean;
  };
};

export type AgentToolsConfig = {
  profile?: ToolProfileId;
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
  byProvider?: Record<string, ToolPolicyConfig>;
  toolsBySender?: GroupToolPolicyBySenderConfig;
  codeMode?: CodeModeConfig;
  elevated?: {
    enabled?: boolean;
    allowFrom?: AgentElevatedAllowFromConfig;
  };
  exec?: ExecToolConfig;
  fs?: FsToolsConfig;
  loopDetection?: ToolLoopDetectionConfig;
  message?: MessageToolsConfig;
  sandbox?: {
    tools?: {
      allow?: string[];
      alsoAllow?: string[];
      deny?: string[];
    };
  };
};

export type MemorySearchConfig = {
  enabled?: boolean;
  sources?: Array<"memory" | "sessions">;
  extraPaths?: string[];
  qmd?: {
    extraCollections?: MemoryQmdIndexPath[];
  };
  multimodal?: {
    enabled?: boolean;
    modalities?: Array<"image" | "audio" | "all">;
    maxFileBytes?: number;
  };
  experimental?: {
    sessionMemory?: boolean;
  };
  provider?: string;
  remote?: {
    baseUrl?: string;
    apiKey?: SecretInput;
    headers?: Record<string, string>;
    nonBatchConcurrency?: number;
    batch?: {
      enabled?: boolean;
      wait?: boolean;
      concurrency?: number;
      pollIntervalMs?: number;
      timeoutMinutes?: number;
    };
  };
  fallback?: string;
  model?: string;
  inputType?: string;
  queryInputType?: string;
  documentInputType?: string;
  outputDimensionality?: number;
  local?: {
    modelPath?: string;
    modelCacheDir?: string;
    contextSize?: number | "auto";
  };
  store?: {
    driver?: "sqlite";
    fts?: {
      tokenizer?: "unicode61" | "trigram";
    };
    vector?: {
      enabled?: boolean;
      extensionPath?: string;
    };
    cache?: {
      enabled?: boolean;
      maxEntries?: number;
    };
  };
  chunking?: {
    tokens?: number;
    overlap?: number;
  };
  sync?: {
    onSessionStart?: boolean;
    onSearch?: boolean;
    watch?: boolean;
    watchDebounceMs?: number;
    intervalMinutes?: number;
    embeddingBatchTimeoutSeconds?: number;
    sessions?: {
      deltaBytes?: number;
      deltaMessages?: number;
      postCompactionForce?: boolean;
    };
  };
  query?: {
    maxResults?: number;
    minScore?: number;
    hybrid?: {
      enabled?: boolean;
      vectorWeight?: number;
      textWeight?: number;
      candidateMultiplier?: number;
      mmr?: {
        enabled?: boolean;
        lambda?: number;
      };
      temporalDecay?: {
        enabled?: boolean;
        halfLifeDays?: number;
      };
    };
  };
  cache?: {
    enabled?: boolean;
    maxEntries?: number;
  };
};

export type ToolsConfig = {
  profile?: ToolProfileId;
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
  byProvider?: Record<string, ToolPolicyConfig>;
  toolsBySender?: GroupToolPolicyBySenderConfig;
  web?: {
    search?: {
      enabled?: boolean;
      provider?: string;
      maxResults?: number;
      timeoutSeconds?: number;
      cacheTtlMinutes?: number;
      apiKey?: SecretInput;
      openaiCodex?: {
        enabled?: boolean;
        mode?: "cached" | "live";
        allowedDomains?: string[];
        contextSize?: "low" | "medium" | "high";
        userLocation?: {
          country?: string;
          region?: string;
          city?: string;
          timezone?: string;
        };
      };
    } & Record<string, unknown>;
    x_search?: {
      enabled?: boolean;
      model?: string;
      inlineCitations?: boolean;
      maxTurns?: number;
      timeoutSeconds?: number;
      cacheTtlMinutes?: number;
    };
    fetch?: {
      enabled?: boolean;
      provider?: string;
      maxChars?: number;
      maxCharsCap?: number;
      maxResponseBytes?: number;
      timeoutSeconds?: number;
      cacheTtlMinutes?: number;
      maxRedirects?: number;
      userAgent?: string;
      readability?: boolean;
      useTrustedEnvProxy?: boolean;
      ssrfPolicy?: {
        allowRfc2544BenchmarkRange?: boolean;
        allowIpv6UniqueLocalRange?: boolean;
      };
      firecrawl?: {
        enabled?: boolean;
        apiKey?: SecretInput;
        baseUrl?: string;
        onlyMainContent?: boolean;
        maxAgeMs?: number;
        timeoutSeconds?: number;
      };
    };
  };
  media?: MediaToolsConfig;
  links?: LinkToolsConfig;
  message?: MessageToolsConfig;
  agentToAgent?: {
    enabled?: boolean;
    allow?: string[];
  };
  sessions?: {
    visibility?: SessionsToolsVisibility;
  };
  elevated?: {
    enabled?: boolean;
    allowFrom?: AgentElevatedAllowFromConfig;
  };
  exec?: ExecToolConfig;
  fs?: FsToolsConfig;
  loopDetection?: ToolLoopDetectionConfig;
  toolSearch?: ToolSearchConfig;
  codeMode?: CodeModeConfig;
  sessions_spawn?: SessionsSpawnToolsConfig;
  subagents?: {
    tools?: {
      allow?: string[];
      alsoAllow?: string[];
      deny?: string[];
    };
  };
  sandbox?: {
    tools?: {
      allow?: string[];
      alsoAllow?: string[];
      deny?: string[];
    };
  };
  experimental?: {
    planTool?: boolean;
  };
};

export type MessageToolsConfig = {
  allowCrossContextSend?: boolean;
  crossContext?: {
    allowWithinProvider?: boolean;
    allowAcrossProviders?: boolean;
    marker?: {
      enabled?: boolean;
      prefix?: string;
      suffix?: string;
    };
  };
  actions?: {
    allow?: string[];
  };
  broadcast?: {
    enabled?: boolean;
  };
};

type ConfiguredProviderRequest = {
  headers?: Record<string, SecretInput>;
  auth?:
    | { mode: "provider-default" }
    | { mode: "authorization-bearer"; token: SecretInput }
    | { mode: "header"; headerName: string; value: SecretInput; prefix?: string };
  proxy?:
    | { mode: "env-proxy"; tls?: ConfiguredProviderRequestTls }
    | { mode: "explicit-proxy"; url: string; tls?: ConfiguredProviderRequestTls };
  tls?: ConfiguredProviderRequestTls;
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

type AgentModelConfig = string | {
  primary?: string;
  fallbacks?: string[];
};

type AgentElevatedAllowFromConfig = Record<string, Array<string | number>>;

type MemoryQmdIndexPath = {
  path: string;
  name?: string;
  pattern?: string;
};

type SafeBinProfileFixture = {
  minPositional?: number;
  maxPositional?: number;
  allowedValueFlags?: string[];
  deniedFlags?: string[];
};
