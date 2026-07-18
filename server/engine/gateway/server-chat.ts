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

export const createChatAbortMarker: any = undefined;

export const createChatRunRegistry: any = undefined;

export const createChatRunState: any = undefined;

export const createSessionEventSubscriberRegistry: any = undefined;

export const createSessionMessageSubscriberRegistry: any = undefined;

export const createToolEventRecipientRegistry: any = undefined;

export const ChatAbortMarker: any = undefined;

export const ChatRunEntry: any = undefined;

export const ChatRunRegistry: any = undefined;

export const ChatRunRegistration: any = undefined;

export const ChatRunState: any = undefined;

export const SessionEventSubscriberRegistry: any = undefined;

export const SessionMessageSubscriberRegistry: any = undefined;

export const ToolEventRecipientRegistry: any = undefined;

export type ChatEventBroadcast = unknown;

export type NodeSendToSession = unknown;

export type AgentEventHandlerOptions = unknown;

export function createAgentEventHandler(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createAgentEventHandler not implemented");
}
