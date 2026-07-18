/**
 * 移植自 openclaw/src/agents/sandbox-paths.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveSandboxInputPath(..._args: unknown[]): unknown {
  throw new Error("resolveSandboxInputPath not implemented (openclaw stub)");
}
export function resolveSandboxPath(..._args: unknown[]): unknown {
  throw new Error("resolveSandboxPath not implemented (openclaw stub)");
}
export async function assertSandboxPath(..._args: unknown[]): Promise<unknown> {
  throw new Error("assertSandboxPath not implemented (openclaw stub)");
}
export function assertMediaNotDataUrl(..._args: unknown[]): unknown {
  throw new Error("assertMediaNotDataUrl not implemented (openclaw stub)");
}
export async function resolveAllowedManagedMediaPath(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveAllowedManagedMediaPath not implemented (openclaw stub)");
}
export async function resolveSandboxedMediaSource(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveSandboxedMediaSource not implemented (openclaw stub)");
}
