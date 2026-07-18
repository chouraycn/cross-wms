/**
 * 移植自 openclaw/src/agents/harness/errors.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export class MissingAgentHarnessError {
  constructor(..._args: unknown[]) { throw new Error("MissingAgentHarnessError not implemented (openclaw stub)"); }
}
export function isMissingAgentHarnessError(..._args: unknown[]): unknown {
  throw new Error("isMissingAgentHarnessError not implemented (openclaw stub)");
}
