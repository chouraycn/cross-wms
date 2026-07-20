// Default CLI dependency surface with lazy outbound channel send adapters.
// 移植自 openclaw/src/cli/deps.ts。
//
// 降级策略：
//  - 原模块依赖 `../channels/registry.js` 的 `normalizeChannelId`、
//    `../infra/outbound/send-deps.js` 的 `OutboundSendDeps`、
//    `../shared/lazy-runtime.js` 的 `createLazyRuntimeSurface`、
//    `./outbound-send-mapping.js`、`./send-runtime/channel-outbound-send.js`。
//    这些模块在 cross-wms 中尚未移植；这里提供降级 stub，
//    `createDefaultDeps` 返回空对象，`createOutboundSendDeps` 抛出
//    "not supported" 错误，保留函数签名以便未来替换为正式实现。

import type { CliDeps } from "./deps.types.js";

export type { CliDeps } from "./deps.types.js";

// ===== 内联降级：OutboundSendDeps =====
/** Outbound send dependencies (degraded placeholder). */
export type OutboundSendDeps = {
  sendMessage?: (...args: unknown[]) => Promise<unknown>;
};
// ===== OutboundSendDeps 结束 =====

/**
 * Create the default CLI dependency surface with lazy outbound channel send adapters.
 *
 * 降级实现：openclaw 的 `channels/registry.js`、`shared/lazy-runtime.js`、
 * `outbound-send-mapping.js`、`send-runtime/channel-outbound-send.js` 未移植；
 * 这里返回空对象，保留函数签名以便未来替换为正式实现。
 */
export function createDefaultDeps(): CliDeps {
  return {};
}

/**
 * Create outbound send dependencies from CLI deps.
 *
 * 降级实现：openclaw 的 `outbound-send-mapping.js` 未移植；这里抛出
 * "not supported" 错误，保留函数签名以便未来替换为正式实现。
 */
export function createOutboundSendDeps(_deps: CliDeps): OutboundSendDeps {
  console.error('createOutboundSendDeps is not available in cross-wms');
      process.exit(1);
}
