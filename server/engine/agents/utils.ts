/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/utils.ts
 *
 * 完整移植：小型共享归一化辅助函数。
 */

export function normalizeContextTokenBudget(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

export function mapThinkingLevel(level?: string): string {
  if (!level) {
    return "off";
  }
  if (level === "adaptive") {
    return "high";
  }
  return level;
}
