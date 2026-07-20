/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/chat-abort.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type ChatAbortControllerEntry = unknown;

export type RestartRecoveryCandidate = unknown;

export type ChatAbortOps = unknown;

export function isChatStopCommandText(..._args: unknown[]): any {
  return false;
}

export function resolveChatRunExpiresAtMs(..._args: unknown[]): any {
  return undefined;
}

export function resolveAgentRunExpiresAtMs(..._args: unknown[]): any {
  return undefined;
}

export function registerChatAbortController(..._args: unknown[]): any {
  return undefined;
}

export function resolveInFlightRunSnapshot(..._args: unknown[]): any {
  return undefined;
}

export function boundInFlightRunSnapshotForChatHistory(..._args: unknown[]): any {
  return undefined;
}

export function abortTrackedChatRunById(..._args: unknown[]): any {
  return undefined;
}

export function abortChatRunById(..._args: unknown[]): any {
  return undefined;
}

export function updateChatRunProvider(..._args: unknown[]): any {
  return undefined;
}

export function abortChatRunsForProvider(..._args: unknown[]): any {
  return undefined;
}
