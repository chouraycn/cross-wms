/**
 * 移植自 openclaw/src/agents/test-helpers/host-sandbox-fs-bridge.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function createSandboxFsBridgeFromResolver(..._args: unknown[]): unknown {
  throw new Error("createSandboxFsBridgeFromResolver not implemented (openclaw stub)");
}
export function createHostSandboxFsBridge(..._args: unknown[]): unknown {
  throw new Error("createHostSandboxFsBridge not implemented (openclaw stub)");
}
