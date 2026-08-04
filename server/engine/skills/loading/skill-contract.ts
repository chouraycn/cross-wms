// Skill contract types describe loaded skill metadata, sources, and prompt surfaces.
// Skill 类型统一在 ../types.ts 定义（含可选 sourceInfo），这里重新导出避免重复定义导致类型不兼容。
export type { Skill } from "../types.js";

export { createSyntheticSourceInfo } from "../../agents/sessions/source-info.js";

// 再导出 frontmatter/source 的解析器，保持 server 旧调用方（discovery/skill-index.ts、测试）可用。
export { resolveSkillKey } from "./frontmatter.js";
export { resolveSkillSource, resolveSkillTelemetrySource } from "./source.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Keep this formatter's XML layout byte-for-byte aligned with the upstream
 * Agent Skills formatter so we can avoid importing the full session runtime
 * package root on the cold skills path. Visibility policy is applied upstream
 * before calling this helper.
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "If a skill's <version> differs from a previous turn, re-read its SKILL.md before using it.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];
  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    if (skill.promptVersion) {
      lines.push(`    <version>${escapeXml(skill.promptVersion)}</version>`);
    }
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}
