/**
 * 移植自 openclaw/src/agents/agent-tools.read.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { REQUIRED_PARAM_GROUPS, assertRequiredParams, getToolParamsRecord, wrapToolParamValidation } from "./agent-tools.params.js";
export function wrapToolWorkspaceRootGuard(..._args: unknown[]): unknown {
  throw new Error("wrapToolWorkspaceRootGuard not implemented (openclaw stub)");
}
export function resolveToolPathAgainstWorkspaceRoot(..._args: unknown[]): unknown {
  throw new Error("resolveToolPathAgainstWorkspaceRoot not implemented (openclaw stub)");
}
export function wrapToolMemoryFlushAppendOnlyWrite(..._args: unknown[]): unknown {
  throw new Error("wrapToolMemoryFlushAppendOnlyWrite not implemented (openclaw stub)");
}
export function wrapToolWorkspaceRootGuardWithOptions(..._args: unknown[]): unknown {
  throw new Error("wrapToolWorkspaceRootGuardWithOptions not implemented (openclaw stub)");
}
export function createSandboxedReadTool(..._args: unknown[]): unknown {
  throw new Error("createSandboxedReadTool not implemented (openclaw stub)");
}
export function createSandboxedWriteTool(..._args: unknown[]): unknown {
  throw new Error("createSandboxedWriteTool not implemented (openclaw stub)");
}
export function createSandboxedEditTool(..._args: unknown[]): unknown {
  throw new Error("createSandboxedEditTool not implemented (openclaw stub)");
}
export function createHostWorkspaceWriteTool(..._args: unknown[]): unknown {
  throw new Error("createHostWorkspaceWriteTool not implemented (openclaw stub)");
}
export function createHostWorkspaceEditTool(..._args: unknown[]): unknown {
  throw new Error("createHostWorkspaceEditTool not implemented (openclaw stub)");
}
export function createOpenClawReadTool(..._args: unknown[]): unknown {
  throw new Error("createOpenClawReadTool not implemented (openclaw stub)");
}
