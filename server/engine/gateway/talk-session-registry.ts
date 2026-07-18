/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/talk-session-registry.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type UnifiedTalkSessionRecord = unknown;

export function rememberUnifiedTalkSession(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] rememberUnifiedTalkSession not implemented");
}

export function getUnifiedTalkSession(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getUnifiedTalkSession not implemented");
}

export function forgetUnifiedTalkSession(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] forgetUnifiedTalkSession not implemented");
}

export function requireUnifiedTalkSessionConn(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] requireUnifiedTalkSessionConn not implemented");
}
