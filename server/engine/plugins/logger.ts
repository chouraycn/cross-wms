// Builds plugin-scoped loggers for runtime and setup code.
//
// 移植自 openclaw/src/plugins/logger.ts。
//
// 降级策略：
//  - openclaw 原文件依赖 ./types.js 中的 PluginLogger 类型（单参数字符串签名）。
//    cross-wms 的 ./types.js 已定义 PluginLogger，但其方法签名变更为
//    `(...args: unknown[]) => void`，与 openclaw 的单参数版本兼容
//    （TypeScript 接口方法使用 bivariance，传入单字符串仍可工作）。
//  - 直接复用 cross-wms 的 PluginLogger 类型，无需进一步降级。

import type { PluginLogger } from "./types.js";

type LoggerLike = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
};

/** Adapts a generic logger to the plugin loader logger interface. */
export function createPluginLoaderLogger(logger: LoggerLike): PluginLogger {
  return {
    info: (msg: string) => logger.info(msg),
    warn: (msg: string) => logger.warn(msg),
    error: (msg: string) => logger.error(msg),
    debug: (msg: string) => logger.debug?.(msg),
  };
}
