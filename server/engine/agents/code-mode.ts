/**
 * 移植自 openclaw/src/agents/code-mode.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { CODE_MODE_EXEC_TOOL_NAME, CODE_MODE_WAIT_TOOL_NAME, isCodeModeControlTool } from "./code-mode-control-tools.js";
export type CodeModeConfig = unknown;
export const testing: unknown = undefined;
export function resolveCodeModeConfig(..._args: unknown[]): unknown {
  throw new Error("resolveCodeModeConfig not implemented (openclaw stub)");
}
export function createCodeModeTools(..._args: unknown[]): unknown {
  throw new Error("createCodeModeTools not implemented (openclaw stub)");
}
export function applyCodeModeCatalog(..._args: unknown[]): unknown {
  throw new Error("applyCodeModeCatalog not implemented (openclaw stub)");
}
export function addClientToolsToCodeModeCatalog(..._args: unknown[]): unknown {
  throw new Error("addClientToolsToCodeModeCatalog not implemented (openclaw stub)");
}
