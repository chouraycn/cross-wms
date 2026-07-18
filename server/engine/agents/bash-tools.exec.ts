/**
 * 移植自 openclaw/src/agents/bash-tools.exec.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type { BashSandboxConfig } from "./bash-tools.shared.js";
export type { ExecElevatedDefaults, ExecToolDefaults, ExecToolDetails } from "./bash-tools.exec-types.js";
export const execTool: unknown = undefined;
export const testing: unknown = undefined;
export function createExecTool(..._args: unknown[]): unknown {
  throw new Error("createExecTool not implemented (openclaw stub)");
}
