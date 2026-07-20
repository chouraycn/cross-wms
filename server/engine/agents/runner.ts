/**
 * 移植自 openclaw/src/agents/sessions/extensions/runner.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExtensionErrorListener = unknown;
export type NewSessionHandler = unknown;
export type ForkHandler = unknown;
export type NavigateTreeHandler = unknown;
export type SwitchSessionHandler = unknown;
export type ReloadHandler = unknown;
export type ShutdownHandler = unknown;
export class ExtensionRunner {
  // Stub: not fully ported
}
export function emitSessionShutdownEvent(..._args: unknown[]): unknown {
  return undefined;
}
