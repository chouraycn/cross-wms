// 移植自 openclaw/src/config/plugin-auto-enable.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

import type { OpenClawConfig } from "./types.openclaw.js";

export type PluginAutoEnableCandidate = unknown;
export type PluginAutoEnableResult = {
  config: OpenClawConfig | undefined;
  enabledPlugins: string[];
  autoEnabledReasons: Record<string, string[]>;
};

export const applyPluginAutoEnable: (params: {
  config: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  manifestRegistry?: unknown;
  discovery?: unknown;
}) => PluginAutoEnableResult = (params: {
  config: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  manifestRegistry?: unknown;
  discovery?: unknown;
}) => {
  return { config: params.config, enabledPlugins: [], autoEnabledReasons: {} };
};

export type materializePluginAutoEnableCandidates = unknown;
export const materializePluginAutoEnableCandidates: unknown = undefined;
export type detectPluginAutoEnableCandidates = unknown;
export const detectPluginAutoEnableCandidates: unknown = undefined;
export type resolvePluginAutoEnableCandidateReason = unknown;
export const resolvePluginAutoEnableCandidateReason: unknown = undefined;
