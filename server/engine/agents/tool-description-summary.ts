/**
 * 移植自 openclaw/src/agents/tool-description-summary.ts
 *
 * 降级实现：提供工具描述摘要，不再抛出 stub 错误。
 */

export function summarizeToolDescriptionText(description: string, _maxLength?: number): string {
  return description;
}

export function describeToolForVerbose(tool: { name?: string; description?: string }): string {
  return `${tool.name ?? "unknown"}: ${tool.description ?? ""}`;
}
