// 静默插件 JSON logger，提供给 plugins list/inspect 命令在 JSON 模式下使用。
// 移植自 openclaw/src/cli/plugins-json-logger.ts。
//
// 降级策略：
//  - 原模块依赖 `../plugins/types.js` 的 `PluginLogger` 类型。
//    cross-wms 的 `../plugins/types.js` 已导出同名类型，行为一致。

import type { PluginLogger } from "../plugins/types.js";

export const quietPluginJsonLogger: PluginLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
