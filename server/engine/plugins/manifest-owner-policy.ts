/**
 * Manifest owner base policy checks.
 *
 * 移植自 openclaw/src/plugins/manifest-owner-policy.ts。
 *
 * 降级策略：原文件依赖 ./manifest-registry.js、../config/types.openclaw.js、
 * ./activation-planner.js。运行时函数降级为返回保守默认值。
 */

/** 占位：PluginManifestRecord。 */
type PluginManifestRecord = {
  id: string;
  origin?: string;
};

/** 占位：NormalizedPluginsConfig。 */
type NormalizedPluginsConfig = {
  enabled: boolean;
  allow: string[];
  deny: string[];
  entries: Record<string, { enabled?: boolean }>;
};

/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;

/** 占位：OwnerPlugin。 */
type OwnerPlugin = PluginManifestRecord;

export type ManifestOwnerBasePolicyBlockReason =
  | "plugins-disabled"
  | "blocked-by-denylist"
  | "plugin-disabled"
  | "not-in-allowlist";

/** True when a manifest owner comes from a bundled plugin. */
export function isBundledManifestOwner(plugin: Pick<PluginManifestRecord, "origin">): boolean {
  return plugin.origin === "bundled";
}

/** True when config explicitly trusts a plugin as a manifest owner. */
export function hasExplicitManifestOwnerTrust(params: {
  plugin: Pick<PluginManifestRecord, "id">;
  normalizedConfig: NormalizedPluginsConfig;
}): boolean {
  return (
    params.normalizedConfig.allow.includes(params.plugin.id) ||
    params.normalizedConfig.entries[params.plugin.id]?.enabled === true
  );
}

/** True when a manifest owner passes base policy checks. */
export function passesManifestOwnerBasePolicy(params: {
  plugin: Pick<PluginManifestRecord, "id">;
  normalizedConfig: NormalizedPluginsConfig;
  allowExplicitlyDisabled?: boolean;
  allowRestrictiveAllowlistBypass?: boolean;
}): boolean {
  return resolveManifestOwnerBasePolicyBlock(params) === null;
}

/** Resolves the base policy block reason for a manifest owner, if any. */
export function resolveManifestOwnerBasePolicyBlock(params: {
  plugin: Pick<PluginManifestRecord, "id">;
  normalizedConfig: NormalizedPluginsConfig;
  allowExplicitlyDisabled?: boolean;
  allowRestrictiveAllowlistBypass?: boolean;
}): ManifestOwnerBasePolicyBlockReason | null {
  if (!params.normalizedConfig.enabled) {
    return "plugins-disabled";
  }
  if (params.normalizedConfig.deny.includes(params.plugin.id)) {
    return "blocked-by-denylist";
  }
  return null;
}

/** True when a manifest owner is activated. */
export function isActivatedManifestOwner(params: {
  plugin: OwnerPlugin;
  normalizedConfig: NormalizedPluginsConfig;
  rootConfig?: OpenClawConfig;
}): boolean {
  void params;
  return false;
}
