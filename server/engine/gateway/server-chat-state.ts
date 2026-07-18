/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/server-chat-state.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type ChatRunTiming = unknown;

export type ChatRunRegistration = unknown;

export type ChatRunEntry = unknown;

export type ChatAbortMarker = unknown;

export type BufferedAgentEvent = unknown;

export type ChatRunRegistry = unknown;

export type ChatRunState = unknown;

export type ToolEventRecipientRegistry = unknown;

export type SessionEventSubscriberRegistry = unknown;

export type SessionMessageSubscriberRegistry = unknown;

export function createChatRunEntry(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createChatRunEntry not implemented");
}

export function createChatAbortMarker(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createChatAbortMarker not implemented");
}

export function chatAbortMarkerTimestampMs(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] chatAbortMarkerTimestampMs not implemented");
}

export function isChatAbortMarkerCurrent(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] isChatAbortMarkerCurrent not implemented");
}

export function createChatRunRegistry(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createChatRunRegistry not implemented");
}

export function createChatRunState(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createChatRunState not implemented");
}

export function createSessionEventSubscriberRegistry(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createSessionEventSubscriberRegistry not implemented");
}

export function createSessionMessageSubscriberRegistry(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createSessionMessageSubscriberRegistry not implemented");
}

export function createToolEventRecipientRegistry(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createToolEventRecipientRegistry not implemented");
}
