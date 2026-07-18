/**
 * 移植自 openclaw/src/agents/embedded-agent-subscribe.handlers.tools.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function countActiveToolExecutions(..._args: unknown[]): unknown {
  throw new Error("countActiveToolExecutions not implemented (openclaw stub)");
}
export function handleToolExecutionStart(..._args: unknown[]): unknown {
  throw new Error("handleToolExecutionStart not implemented (openclaw stub)");
}
export function handleToolExecutionUpdate(..._args: unknown[]): unknown {
  throw new Error("handleToolExecutionUpdate not implemented (openclaw stub)");
}
export async function handleToolExecutionEnd(..._args: unknown[]): Promise<unknown> {
  throw new Error("handleToolExecutionEnd not implemented (openclaw stub)");
}
