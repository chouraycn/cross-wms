/**
 * 移植自 openclaw/src/agents/embedded-agent-subscribe.handlers.lifecycle.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { handleCompactionEnd, handleCompactionStart } from "./embedded-agent-subscribe.handlers.compaction.js";
export function handleAgentStart(..._args: unknown[]): unknown {
  throw new Error("handleAgentStart not implemented (openclaw stub)");
}
export function handleAgentEnd(..._args: unknown[]): unknown {
  throw new Error("handleAgentEnd not implemented (openclaw stub)");
}
