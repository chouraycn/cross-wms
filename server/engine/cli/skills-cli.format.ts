// Formatting helpers for skills CLI output.
// 移植自 openclaw/src/cli/skills-cli.format.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`（theme/table）。
// 这里提供降级 stub，保留函数签名。

// ===== 内联降级：theme =====
const theme = {
  accent: (value: string) => value,
  muted: (value: string) => value,
  warn: (value: string) => value,
  error: (value: string) => value,
  info: (value: string) => value,
};
// ===== theme 结束 =====

/** Format a skill entry as a plain-text line. */
export function formatSkillLine(params: {
  name: string;
  description?: string;
  enabled?: boolean;
}): string {
  const status = params.enabled === false ? "[disabled]" : "[enabled]";
  const desc = params.description ? ` - ${params.description}` : "";
  return `${status} ${params.name}${desc}`;
}

/** Format a list of skill entries as a table or plain-text lines. */
export function formatSkillList(
  entries: Array<{ name: string; description?: string; enabled?: boolean }>,
): string {
  return entries.map((entry) => formatSkillLine(entry)).join("\n");
}

// 保留 theme 引用以便未来扩展。
void theme;
