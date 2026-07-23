// 移植自 openclaw/src/config/plugin-auto-enable.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginAutoEnableCandidate = unknown;
export type PluginAutoEnableResult = {
  config: unknown;
  enabledPlugins: string[];
};
export const applyPluginAutoEnable: (params: {
  config: unknown;
  env?: NodeJS.ProcessEnv;
}) => PluginAutoEnableResult = (_params: { config: unknown; env?: NodeJS.ProcessEnv }) => {
  return { config: _params.config, enabledPlugins: [] };
};
export type materializePluginAutoEnableCandidates = unknown;
export const materializePluginAutoEnableCandidates: unknown = undefined;
export type detectPluginAutoEnableCandidates = unknown;
export const detectPluginAutoEnableCandidates: unknown = undefined;
export type resolvePluginAutoEnableCandidateReason = unknown;
export const resolvePluginAutoEnableCandidateReason: unknown = undefined;
