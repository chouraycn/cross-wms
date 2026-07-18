/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/talk-realtime-relay.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export function createTalkRealtimeRelaySession(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createTalkRealtimeRelaySession not implemented");
}

export function sendTalkRealtimeRelayAudio(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] sendTalkRealtimeRelayAudio not implemented");
}

export function submitTalkRealtimeRelayToolResult(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] submitTalkRealtimeRelayToolResult not implemented");
}

export function registerTalkRealtimeRelayAgentRun(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] registerTalkRealtimeRelayAgentRun not implemented");
}

export async function steerTalkRealtimeRelayAgentRun(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] steerTalkRealtimeRelayAgentRun not implemented");
}

export function cancelTalkRealtimeRelayTurn(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] cancelTalkRealtimeRelayTurn not implemented");
}

export function stopTalkRealtimeRelaySession(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] stopTalkRealtimeRelaySession not implemented");
}

export function clearTalkRealtimeRelaySessionsForTest(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] clearTalkRealtimeRelaySessionsForTest not implemented");
}
