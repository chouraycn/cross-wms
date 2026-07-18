/**
 * Plugin install overrides.
 * 移植自 openclaw/src/plugins/install-overrides.ts。
 * 降级策略：返回 undefined。
 */
export const PLUGIN_INSTALL_OVERRIDES_ENV = "OPENCLAW_PLUGIN_INSTALL_OVERRIDES";
export const ALLOW_PLUGIN_INSTALL_OVERRIDES_ENV = "OPENCLAW_ALLOW_PLUGIN_INSTALL_OVERRIDES";

export type PluginInstallOverride = {
  pluginId: string;
  source: "npm" | "local" | "clawhub" | "git";
  spec: string;
};

export function resolvePluginInstallOverride(params: {
  pluginId: string;
  env?: NodeJS.ProcessEnv;
}): PluginInstallOverride | undefined {
  void params;
  return undefined;
}
