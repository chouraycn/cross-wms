/**
 * 移植自 openclaw/src/agents/modes/interactive/components/visual-truncate.ts
 *
 * 完整移植：视觉行截断辅助函数。
 */

export function truncateToVisualLines(text: string, maxLines: number, maxLineWidth?: number): string {
  if (maxLines <= 0) {
    return "";
  }
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return text;
  }
  const truncated = lines.slice(0, maxLines).join("\n");
  const maxWidth = maxLineWidth ?? Infinity;
  if (maxWidth < Infinity) {
    return truncated
      .split("\n")
      .map((line) => (line.length > maxWidth ? line.slice(0, maxWidth) + "…" : line))
      .join("\n");
  }
  return truncated;
}
