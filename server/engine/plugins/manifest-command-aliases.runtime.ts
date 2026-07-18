/**
 * Resolves manifest-declared command and tool ownership at runtime.
 *
 * 移植自 openclaw/src/plugins/manifest-command-aliases.runtime.ts。
 *
 * 降级策略：原文件依赖 @openclaw/normalization-core/string-coerce、
 * ../config/types.openclaw.js、./activation-planner.js、./manifest-command-aliases.js、
 * ./manifest-contract-eligibility.js、./manifest-tool-availability.js。
 * 所有运行时函数降级为返回 undefined 或抛出 "not implemented"。
 */

/** 占位：OpenClawConfig。 */
type OpenClawConfig = unknown;

/** 占位：PluginManifestCommandAliasRegistry。 */
type PluginManifestCommandAliasRegistry = unknown;

/** 占位：PluginManifestCommandAliasRecord。 */
type PluginManifestCommandAliasRecord = {
  pluginId: string;
  command: string;
  alias: string;
};

/** 占位：PluginManifestToolOwnerRecord。 */
type PluginManifestToolOwnerRecord = {
  toolName: string;
  pluginId: string;
  availability?: "loaded" | "manifest-only";
};

/** Resolves the manifest owner for a CLI command alias when one is declared. */
export function resolveManifestCommandAliasOwner(params: {
  command: string | undefined;
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  registry?: PluginManifestCommandAliasRegistry;
}): PluginManifestCommandAliasRecord | undefined {
  void params;
  return undefined;
}

/** Resolves the plugin id that should be activated for a CLI command surface. */
export function resolveManifestCliCommandSurfaceOwner(params: {
  command: string | undefined;
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  registry?: PluginManifestCommandAliasRegistry;
}): string | undefined {
  void params;
  return undefined;
}

/** Resolve which plugin owns an agent-tool name. */
export function resolveManifestToolOwner(params: {
  toolName: string | undefined;
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  registry?: PluginManifestCommandAliasRegistry;
}): PluginManifestToolOwnerRecord | undefined {
  void params;
  return undefined;
}
