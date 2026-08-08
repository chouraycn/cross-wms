 
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

export function createTalkHandoff(..._args: any[]): any {
  return undefined;
}

export function getTalkHandoff(..._args: any[]): any {
  return undefined;
}

export function joinTalkHandoff(..._args: any[]): any {
  return undefined;
}

export function startTalkHandoffTurn(..._args: any[]): any {
  return undefined;
}

export function endTalkHandoffTurn(..._args: any[]): any {
  return undefined;
}

export function cancelTalkHandoffTurn(..._args: any[]): any {
  return false;
}

export function revokeTalkHandoff(..._args: any[]): any {
  return undefined;
}

export function verifyTalkHandoffToken(..._args: any[]): any {
  return undefined;
}

export function clearTalkHandoffsForTest(..._args: any[]): any {
  return undefined;
}
