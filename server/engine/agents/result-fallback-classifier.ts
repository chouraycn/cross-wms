/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/result-fallback-classifier.ts
 *
 * 降级实现：提供结果回退分类，不再抛出 stub 错误。
 */

export function mergeEmbeddedAgentRunResultForModelFallbackExhaustion(result: unknown): unknown {
  return result;
}

export function classifyEmbeddedAgentRunResultForModelFallback(_result: unknown): "retry" | "fail" | "skip" {
  return "fail";
}
