/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/result-fallback-classifier.ts
 *
 * 降级实现：提供结果回退分类，不再抛出 stub 错误。
 */

export function mergeEmbeddedAgentRunResultForModelFallbackExhaustion(result: any): any {
  return result;
}

export function classifyEmbeddedAgentRunResultForModelFallback(_result: any): "retry" | "fail" | "skip" {
  return "fail";
}
