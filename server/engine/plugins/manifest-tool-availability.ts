/**
 * Checks manifest-declared tool availability signals.
 *
 * 移植自 openclaw/src/plugins/manifest-tool-availability.ts。
 *
 * 降级策略：原文件依赖 @openclaw/normalization-core/string-coerce、
 * ../config/types.openclaw.js、./manifest-registry.js、./manifest.js。
 * 运行时函数降级为返回 true（保守可用）。
 */

import type {
  PluginManifestCapabilityProviderConfigSignal,
  PluginManifestCapabilityProviderAuthSignal,
} from "./manifest.js";

/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;

/** 占位：PluginManifestRecord。 */
type PluginManifestRecord = {
  id: string;
  toolMetadata?: Record<string, unknown>;
};

export type ManifestConfigAvailabilitySignal = PluginManifestCapabilityProviderConfigSignal;
export type ManifestAuthAvailabilitySignal = PluginManifestCapabilityProviderAuthSignal;

/** Checks whether a manifest config signal passes. */
export function manifestConfigSignalPasses(params: {
  signal: ManifestConfigAvailabilitySignal;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): boolean {
  void params;
  return true;
}

/** Checks whether a provider base URL guard passes. */
export function manifestProviderBaseUrlGuardPasses(params: {
  provider: string;
  baseUrl?: string;
  guard?: { provider: string; defaultBaseUrl?: string; allowedBaseUrls: string[] };
}): boolean {
  void params;
  return true;
}

/** Returns env vars declared by a manifest setup provider. */
export function manifestPluginSetupProviderEnvVars(params: {
  plugin: Pick<PluginManifestRecord, "id">;
  setup?: { providers?: Array<{ id: string; envVars?: string[] }> };
}): string[] {
  void params;
  return [];
}

/** True when a manifest declares a non-empty env candidate. */
export function hasNonEmptyManifestEnvCandidate(params: {
  envVars: string[];
  env?: NodeJS.ProcessEnv;
}): boolean {
  void params;
  return false;
}

/** Checks whether manifest-declared tools are available. */
export function hasManifestToolAvailability(params: {
  plugin: PluginManifestRecord;
  toolNames: string[];
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): boolean {
  void params;
  return true;
}
