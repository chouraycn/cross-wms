/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/node-catalog.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export function createKnownNodeCatalog(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createKnownNodeCatalog not implemented");
}

export function listKnownNodes(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] listKnownNodes not implemented");
}

export function getKnownNodeEntry(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getKnownNodeEntry not implemented");
}

export function getKnownNode(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getKnownNode not implemented");
}
