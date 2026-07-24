// === SIMPLIFIED MIGRATION — 部分移植 ===
// Source: openclaw/src/secrets/provider-env-vars.ts
// Used by: server/engine/plugins/{provider-auth-ref,provider-auth-helpers}.ts
//
// openclaw 的完整实现依赖 plugin metadata snapshot、alias map、setup descriptors 等
// 深度依赖链。cross-wms 暂未移植这些子系统，此文件提供简化实现：
// 仅解析 core provider 的 env var 候选（不含 plugin 派生 candidate）。

export type ProviderAuthEvidence = {
  type: "local-file-with-env";
  fileEnvVar?: string;
  fallbackPaths?: readonly string[];
  requiresAnyEnv?: readonly string[];
  requiresAllEnv?: readonly string[];
  credentialMarker: string;
  source?: string;
};

export type ProviderAuthLookupMaps = {
  aliasMap: Readonly<Record<string, string>>;
  envCandidateMap: Readonly<Record<string, readonly string[]>>;
  authEvidenceMap: Readonly<Record<string, readonly ProviderAuthEvidence[]>>;
  setupProviderFallbackRefs: readonly string[];
};

export type ProviderEnvVarLookupParams = {
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  includeUntrustedWorkspacePlugins?: boolean;
  metadataSnapshot?: unknown;
};

const CORE_PROVIDER_AUTH_ENV_VAR_CANDIDATES: Record<string, readonly string[]> = {
  anthropic: ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
  openai: ["CODEX_API_KEY", "OPENAI_API_KEY"],
  voyage: ["VOYAGE_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
  "anthropic-openai": ["ANTHROPIC_API_KEY"],
  "qwen-dashscope": ["DASHSCOPE_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  "minimax-cn": ["MINIMAX_API_KEY"],
};

/** Resolves env var candidates for a provider using core fallback rules (simplified). */
export function getProviderEnvVars(
  providerId: string,
  _params?: ProviderEnvVarLookupParams,
): readonly string[] {
  return CORE_PROVIDER_AUTH_ENV_VAR_CANDIDATES[providerId] ?? [];
}

/** Resolves provider auth lookup maps (simplified — returns empty plugin-derived maps). */
export function resolveProviderAuthLookupMaps(
  _params?: ProviderEnvVarLookupParams,
): ProviderAuthLookupMaps {
  return {
    aliasMap: {},
    envCandidateMap: { ...CORE_PROVIDER_AUTH_ENV_VAR_CANDIDATES },
    authEvidenceMap: {},
    setupProviderFallbackRefs: [],
  };
}
