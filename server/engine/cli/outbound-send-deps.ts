// CLI adapter for outbound sending dependencies used by message-style commands.
// 移植自 openclaw/src/cli/outbound-send-deps.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/outbound/send-deps.js` 的 `OutboundSendDeps` 类型与
//    `./outbound-send-mapping.js` 的 `createOutboundSendDepsFromCliSource`。
//    这些模块在 cross-wms 中尚未移植；这里提供降级 stub，
//    `createOutboundSendDeps` 抛出 "not supported" 错误，保留函数签名。

import type { CliDeps } from "./deps.types.js";

export type { CliDeps } from "./deps.types.js";

// ===== 内联降级：OutboundSendDeps =====
/** Outbound send dependencies (degraded placeholder). */
export type OutboundSendDeps = {
  sendMessage?: (...args: unknown[]) => Promise<unknown>;
};
// ===== OutboundSendDeps 结束 =====

/**
 * Convert the broad CLI dependency bundle into the narrow outbound-send dependency shape.
 *
 * 降级实现：openclaw 的 `outbound-send-mapping.js` 未移植；这里抛出
 * "not supported" 错误，保留函数签名以便未来替换为正式实现。
 */
export function createOutboundSendDeps(_deps: CliDeps): OutboundSendDeps {
  throw new Error(
    "createOutboundSendDeps: not supported in stub mode (outbound-send-mapping not ported).",
  );
}
