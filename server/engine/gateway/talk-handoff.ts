/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/talk-handoff.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type TalkHandoffCreateParams = unknown;

export type TalkHandoffRecord = unknown;

export type TalkHandoffPublicRecord = unknown;

export type TalkHandoffCreateResult = unknown;

export type TalkHandoffJoinResult = unknown;

export type TalkHandoffRevokeResult = unknown;

export type TalkHandoffTurnResult = unknown;

export function createTalkHandoff(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createTalkHandoff not implemented");
}

export function getTalkHandoff(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] getTalkHandoff not implemented");
}

export function joinTalkHandoff(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] joinTalkHandoff not implemented");
}

export function startTalkHandoffTurn(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] startTalkHandoffTurn not implemented");
}

export function endTalkHandoffTurn(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] endTalkHandoffTurn not implemented");
}

export function cancelTalkHandoffTurn(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] cancelTalkHandoffTurn not implemented");
}

export function revokeTalkHandoff(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] revokeTalkHandoff not implemented");
}

export function verifyTalkHandoffToken(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] verifyTalkHandoffToken not implemented");
}

export function clearTalkHandoffsForTest(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] clearTalkHandoffsForTest not implemented");
}
