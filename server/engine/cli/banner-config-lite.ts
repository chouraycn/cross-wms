// Lightweight banner config reader kept out of the full CLI import path.
// 移植自 openclaw/src/cli/banner-config-lite.ts。
//
// 降级策略：
//  - 原模块依赖 ../config/config.js 的 createConfigIO。cross-wms 未移植；
//    readCliBannerTaglineMode 降级为始终返回 undefined。

import type { TaglineMode } from "./tagline.js";

/** Parse a persisted CLI banner tagline mode. */
export function parseTaglineMode(value: unknown): TaglineMode | undefined {
  if (value === "random" || value === "default" || value === "off") {
    return value;
  }
  return undefined;
}

/** Read the banner tagline mode without pulling in full CLI command registration. */
export function readCliBannerTaglineMode(_env: NodeJS.ProcessEnv = process.env): TaglineMode | undefined {
  // 降级：openclaw 的 config/config.js 未移植；始终返回 undefined。
  return undefined;
}
