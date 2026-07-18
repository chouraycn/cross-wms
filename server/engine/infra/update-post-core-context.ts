// 移植自 openclaw/src/infra/update-post-core-context.ts
// 降级说明：OpenClawConfig 降级为 Record<string, unknown>。
import type { OpenClawConfig } from "./_runtime-stubs.js";

export const POST_CORE_UPDATE_SOURCE_CONFIG_PATH_ENV =
  "OPENCLAW_UPDATE_POST_CORE_SOURCE_CONFIG_PATH";

export type PreUpdateConfigRestoreInput = {
  sourceConfig: OpenClawConfig;
  authoredConfig: OpenClawConfig;
};
