/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/server-chat.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export const createChatAbortMarker: unknown = undefined;

export const createChatRunRegistry: unknown = undefined;

export const createChatRunState: unknown = undefined;

export const createSessionEventSubscriberRegistry: unknown = undefined;

export const createSessionMessageSubscriberRegistry: unknown = undefined;

export const createToolEventRecipientRegistry: unknown = undefined;

export const ChatAbortMarker: unknown = undefined;

export const ChatRunEntry: unknown = undefined;

export const ChatRunRegistry: unknown = undefined;

export const ChatRunRegistration: unknown = undefined;

export const ChatRunState: unknown = undefined;

export const SessionEventSubscriberRegistry: unknown = undefined;

export const SessionMessageSubscriberRegistry: unknown = undefined;

export const ToolEventRecipientRegistry: unknown = undefined;

export type ChatEventBroadcast = unknown;

export type NodeSendToSession = unknown;

export type AgentEventHandlerOptions = unknown;

export function createAgentEventHandler(..._args: unknown[]): unknown {
  return undefined;
}
