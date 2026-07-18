/**
 * 移植自 openclaw/src/agents/agent-bundle-lsp-runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type BundleLspToolRuntime = unknown;
export function spawnLspServerProcess(..._args: unknown[]): unknown {
  throw new Error("spawnLspServerProcess not implemented (openclaw stub)");
}
export async function createBundleLspToolRuntime(..._args: unknown[]): Promise<unknown> {
  throw new Error("createBundleLspToolRuntime not implemented (openclaw stub)");
}
export async function disposeAllBundleLspRuntimes(..._args: unknown[]): Promise<unknown> {
  throw new Error("disposeAllBundleLspRuntimes not implemented (openclaw stub)");
}
