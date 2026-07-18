/**
 * 移植自 openclaw/src/agents/sandbox/manage.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SandboxContainerInfo = unknown;
export type SandboxBrowserInfo = unknown;
export function listSandboxContainers(..._args: unknown[]): unknown {
  throw new Error("listSandboxContainers not implemented (openclaw stub)");
}
export function listSandboxBrowsers(..._args: unknown[]): unknown {
  throw new Error("listSandboxBrowsers not implemented (openclaw stub)");
}
export function removeSandboxContainer(..._args: unknown[]): unknown {
  throw new Error("removeSandboxContainer not implemented (openclaw stub)");
}
export function removeSandboxBrowserContainer(..._args: unknown[]): unknown {
  throw new Error("removeSandboxBrowserContainer not implemented (openclaw stub)");
}
