/**
 * 移植自 openclaw/src/agents/harness/user-input-bridge.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AgentHarnessUserInputOption = unknown;
export type AgentHarnessUserInputQuestion = unknown;
export type AgentHarnessUserInputAnswers = unknown;
export type AgentHarnessUserInputPromptOptions = unknown;
export function emptyAgentHarnessUserInputAnswers(..._args: unknown[]): unknown {
  throw new Error("emptyAgentHarnessUserInputAnswers not implemented (openclaw stub)");
}
export function formatAgentHarnessUserInputPrompt(..._args: unknown[]): unknown {
  throw new Error("formatAgentHarnessUserInputPrompt not implemented (openclaw stub)");
}
export function deliverAgentHarnessUserInputPrompt(..._args: unknown[]): unknown {
  throw new Error("deliverAgentHarnessUserInputPrompt not implemented (openclaw stub)");
}
export function buildAgentHarnessUserInputAnswers(..._args: unknown[]): unknown {
  throw new Error("buildAgentHarnessUserInputAnswers not implemented (openclaw stub)");
}
export function normalizeAgentHarnessUserInputAnswer(..._args: unknown[]): unknown {
  throw new Error("normalizeAgentHarnessUserInputAnswer not implemented (openclaw stub)");
}
