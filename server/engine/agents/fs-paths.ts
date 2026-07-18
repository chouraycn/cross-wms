/**
 * 移植自 openclaw/src/agents/sandbox/fs-paths.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SandboxFsMount = unknown;
export type SandboxResolvedFsPath = unknown;
export function parseSandboxBindMount(..._args: unknown[]): unknown {
  throw new Error("parseSandboxBindMount not implemented (openclaw stub)");
}
export function buildSandboxFsMounts(..._args: unknown[]): unknown {
  throw new Error("buildSandboxFsMounts not implemented (openclaw stub)");
}
export function resolveWritableSandboxBindHostRoots(..._args: unknown[]): unknown {
  throw new Error("resolveWritableSandboxBindHostRoots not implemented (openclaw stub)");
}
export function hasSandboxBindContainerPathAliases(..._args: unknown[]): unknown {
  throw new Error("hasSandboxBindContainerPathAliases not implemented (openclaw stub)");
}
export function hasSandboxBindReadonlyHostShadows(..._args: unknown[]): unknown {
  throw new Error("hasSandboxBindReadonlyHostShadows not implemented (openclaw stub)");
}
export function resolveSandboxFsPathWithMounts(..._args: unknown[]): unknown {
  throw new Error("resolveSandboxFsPathWithMounts not implemented (openclaw stub)");
}
