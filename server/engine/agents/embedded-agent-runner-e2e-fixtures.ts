/**
 * 移植自 openclaw/src/agents/test-helpers/embedded-agent-runner-e2e-fixtures.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type EmbeddedAgentRunnerTestWorkspace = unknown;
export function createEmbeddedAgentRunnerTestWorkspace(..._args: unknown[]): unknown {
  throw new Error("createEmbeddedAgentRunnerTestWorkspace not implemented (openclaw stub)");
}
export function cleanupEmbeddedAgentRunnerTestWorkspace(..._args: unknown[]): unknown {
  throw new Error("cleanupEmbeddedAgentRunnerTestWorkspace not implemented (openclaw stub)");
}
export function createEmbeddedAgentRunnerOpenAiConfig(..._args: unknown[]): unknown {
  throw new Error("createEmbeddedAgentRunnerOpenAiConfig not implemented (openclaw stub)");
}
export function immediateEnqueue(..._args: unknown[]): unknown {
  throw new Error("immediateEnqueue not implemented (openclaw stub)");
}
export function createMockUsage(..._args: unknown[]): unknown {
  throw new Error("createMockUsage not implemented (openclaw stub)");
}
export function buildEmbeddedRunnerAssistant(..._args: unknown[]): unknown {
  throw new Error("buildEmbeddedRunnerAssistant not implemented (openclaw stub)");
}
export function makeEmbeddedRunnerAttempt(..._args: unknown[]): unknown {
  throw new Error("makeEmbeddedRunnerAttempt not implemented (openclaw stub)");
}
export function createResolvedEmbeddedRunnerModel(..._args: unknown[]): unknown {
  throw new Error("createResolvedEmbeddedRunnerModel not implemented (openclaw stub)");
}
