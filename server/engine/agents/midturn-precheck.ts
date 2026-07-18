/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/midturn-precheck.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type MidTurnPrecheckRequest = unknown;
export class MidTurnPrecheckSignal {
  constructor(..._args: unknown[]) { throw new Error("MidTurnPrecheckSignal not implemented (openclaw stub)"); }
}
export function isMidTurnPrecheckSignal(..._args: unknown[]): unknown {
  throw new Error("isMidTurnPrecheckSignal not implemented (openclaw stub)");
}
export const MID_TURN_PRECHECK_ERROR_MESSAGE: unknown = undefined;
