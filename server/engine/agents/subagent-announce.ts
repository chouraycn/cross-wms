/**
 * 移植自 openclaw/src/agents/subagent-announce.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { buildSubagentSystemPrompt } from "./subagent-system-prompt.js";
export { captureSubagentCompletionReply } from "./subagent-announce-output.js";
export type { SubagentRunOutcome } from "./subagent-announce-output.js";
export type SubagentAnnounceType = unknown;
export const testing: unknown = undefined;
export async function runSubagentAnnounceFlow(..._args: unknown[]): Promise<unknown> {
  throw new Error("runSubagentAnnounceFlow not implemented (openclaw stub)");
}
