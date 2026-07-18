// Command-specific secret target policy. Each exported helper returns the config secret IDs
// a command may inspect, with optional concrete-path filters for selected providers/accounts.
// 移植自 openclaw/src/cli/command-secret-targets.ts。
//
// 降级策略：
//  - 原模块依赖大量 openclaw 内部运行时模块（secrets/target-registry、channels/plugins/read-only、
//    plugins/web-*-providers.runtime、routing/session-key、secrets/channel-contract-api 等），
//    cross-wms 均未移植。
//  - 此处降级为返回静态预定义的 target IDs 集合，保留函数签名以便未来替换为正式实现。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

const STATIC_QR_REMOTE_TARGET_IDS = ["gateway.remote.token", "gateway.remote.password"] as const;
const STATIC_MODEL_TARGET_IDS = [
  "models.providers.*.apiKey",
  "models.providers.*.headers.*",
  "models.providers.*.request.headers.*",
  "models.providers.*.request.auth.token",
  "models.providers.*.request.auth.value",
  "models.providers.*.request.proxy.tls.ca",
  "models.providers.*.request.proxy.tls.cert",
  "models.providers.*.request.proxy.tls.key",
  "models.providers.*.request.proxy.tls.passphrase",
  "models.providers.*.request.tls.ca",
  "models.providers.*.request.tls.cert",
  "models.providers.*.request.tls.key",
  "models.providers.*.request.tls.passphrase",
] as const;
const STATIC_AGENT_RUNTIME_BASE_TARGET_IDS = [
  ...STATIC_MODEL_TARGET_IDS,
  "agents.defaults.memorySearch.remote.apiKey",
  "agents.list[].memorySearch.remote.apiKey",
  "agents.list[].tts.providers.*.apiKey",
  "messages.tts.providers.*.apiKey",
  "skills.entries.*.apiKey",
  "tools.web.search.apiKey",
  "tools.web.fetch.firecrawl.apiKey",
] as const;
const STATIC_MEMORY_EMBEDDING_TARGET_IDS = [
  ...STATIC_MODEL_TARGET_IDS,
  "agents.defaults.memorySearch.remote.apiKey",
  "agents.list[].memorySearch.remote.apiKey",
] as const;
const STATIC_TTS_TARGET_IDS = [
  ...STATIC_MODEL_TARGET_IDS,
  "agents.list[].tts.providers.*.apiKey",
  "messages.tts.providers.*.apiKey",
] as const;
const STATIC_GATEWAY_AUTH_TARGET_IDS = [
  "gateway.auth.token",
  "gateway.auth.password",
  "gateway.remote.token",
  "gateway.remote.password",
] as const;
const STATIC_STATUS_TARGET_IDS = [
  ...STATIC_GATEWAY_AUTH_TARGET_IDS,
  "agents.defaults.memorySearch.remote.apiKey",
  "agents.list[].memorySearch.remote.apiKey",
] as const;
const STATIC_SECURITY_AUDIT_TARGET_IDS = [...STATIC_GATEWAY_AUTH_TARGET_IDS] as const;

const STATIC_CAPABILITY_WEB_SEARCH_TARGET_IDS = [
  "tools.web.search.apiKey",
  "tools.web.search.*.apiKey",
] as const;
const STATIC_CAPABILITY_WEB_FETCH_TARGET_IDS = ["tools.web.fetch.firecrawl.apiKey"] as const;

export type CommandSecretTargetScope = {
  targetIds: Set<string>;
  allowedPaths?: Set<string>;
  forcedActivePaths?: Set<string>;
  optionalActivePaths?: Set<string>;
};

function toSet(values: readonly string[]): Set<string> {
  return new Set(values);
}

/** Return channel secret targets, optionally narrowed to one channel account subtree. */
export function getScopedChannelsCommandSecretTargets(_params: {
  config: OpenClawConfig;
  channel?: string | null;
  accountId?: string | null;
}): {
  targetIds: Set<string>;
  allowedPaths?: Set<string>;
} {
  // 降级：channel secret target registry 未移植；返回空集合。
  return { targetIds: new Set() };
}

/** Secret targets needed by QR remote pairing flows. */
export function getQrRemoteCommandSecretTargetIds(): Set<string> {
  return toSet(STATIC_QR_REMOTE_TARGET_IDS);
}

/** All registered channel secret targets, regardless of current config. */
export function getChannelsCommandSecretTargetIds(): Set<string> {
  // 降级：channel secret target registry 未移植；返回空集合。
  return new Set();
}

/** Channel secret targets contributed by channels currently present in config/read-only plugins. */
export function getConfiguredChannelsCommandSecretTargetIds(
  _config: OpenClawConfig,
  _env?: NodeJS.ProcessEnv,
): Set<string> {
  // 降级：channel secret target registry 未移植；返回空集合。
  return new Set();
}

/** Model-provider credential targets used by commands that can touch provider config. */
export function getModelsCommandSecretTargetIds(): Set<string> {
  return toSet(STATIC_MODEL_TARGET_IDS);
}

/** Credential targets required by memory embedding flows. */
export function getMemoryEmbeddingCommandSecretTargetIds(): Set<string> {
  return toSet(STATIC_MEMORY_EMBEDDING_TARGET_IDS);
}

/** Credential targets required by text-to-speech flows. */
export function getTtsCommandSecretTargetIds(): Set<string> {
  return toSet(STATIC_TTS_TARGET_IDS);
}

/** Agent runtime credential targets, optionally including all channel credential targets. */
export function getAgentRuntimeCommandSecretTargetIds(params?: {
  includeChannelTargets?: boolean;
}): Set<string> {
  if (params?.includeChannelTargets !== true) {
    return toSet(STATIC_AGENT_RUNTIME_BASE_TARGET_IDS);
  }
  return toSet(STATIC_AGENT_RUNTIME_BASE_TARGET_IDS);
}

/** Static web-fetch capability targets plus plugin-provided web-fetch credential targets. */
export function getCapabilityWebFetchCommandSecretTargetIds(): Set<string> {
  return toSet(STATIC_CAPABILITY_WEB_FETCH_TARGET_IDS);
}

/** Static web-search capability targets plus plugin-provided web-search credential targets. */
export function getCapabilityWebSearchCommandSecretTargetIds(): Set<string> {
  return toSet(STATIC_CAPABILITY_WEB_SEARCH_TARGET_IDS);
}

/** Web-fetch target scope for selected/auto-detected providers and configured fallback paths. */
export function getCapabilityWebFetchCommandSecretTargets(
  _config: OpenClawConfig,
  _options?: {
    providerId?: string | null;
  },
): CommandSecretTargetScope {
  return { targetIds: getCapabilityWebFetchCommandSecretTargetIds() };
}

/** Web-search target scope for selected/auto-detected providers and configured fallback paths. */
export function getCapabilityWebSearchCommandSecretTargets(
  _config: OpenClawConfig,
  _options?: {
    providerId?: string | null;
  },
): CommandSecretTargetScope {
  return { targetIds: getCapabilityWebSearchCommandSecretTargetIds() };
}

/** Status command targets; channel targets can be limited to configured channel plugins. */
export function getStatusCommandSecretTargetIds(
  _config?: OpenClawConfig,
  _env?: NodeJS.ProcessEnv,
  options?: { includeChannelTargets?: boolean },
): Set<string> {
  const channelTargetIds =
    options?.includeChannelTargets === false ? [] : [] as string[];
  return toSet([...STATIC_STATUS_TARGET_IDS, ...channelTargetIds]);
}

/** Secret targets that the security audit command is allowed to inspect. */
export function getSecurityAuditCommandSecretTargetIds(): Set<string> {
  return toSet(STATIC_SECURITY_AUDIT_TARGET_IDS);
}
