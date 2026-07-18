/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/talk-transcription-relay.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export function createTalkTranscriptionRelaySession(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] createTalkTranscriptionRelaySession not implemented");
}

export function sendTalkTranscriptionRelayAudio(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] sendTalkTranscriptionRelayAudio not implemented");
}

export function stopTalkTranscriptionRelaySession(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] stopTalkTranscriptionRelaySession not implemented");
}

export function cancelTalkTranscriptionRelayTurn(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] cancelTalkTranscriptionRelayTurn not implemented");
}

export function clearTalkTranscriptionRelaySessionsForTest(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] clearTalkTranscriptionRelaySessionsForTest not implemented");
}
