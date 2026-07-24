// 移植自 openclaw/src/config/plugin-auto-enable.types.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

import type { OpenClawConfig } from "./types.openclaw.js";

export type PluginAutoEnableCandidate = unknown;
export type PluginAutoEnableResult = {
  config: OpenClawConfig | undefined;
  enabledPlugins: string[];
  autoEnabledReasons: Record<string, string[]>;
};
