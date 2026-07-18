/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/server-restart-sentinel.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export async function recoverPendingRestartContinuationDeliveries(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] recoverPendingRestartContinuationDeliveries not implemented");
}

export async function scheduleRestartSentinelWake(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] scheduleRestartSentinelWake not implemented");
}

export async function refreshLatestUpdateRestartSentinel(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] refreshLatestUpdateRestartSentinel not implemented");
}

export function getLatestUpdateRestartSentinel(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getLatestUpdateRestartSentinel not implemented");
}

export function recordLatestUpdateRestartSentinel(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] recordLatestUpdateRestartSentinel not implemented");
}
