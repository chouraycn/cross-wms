// CLI 端 SKILL.md 扫描器（轻量包装）
// 扫描 skills/ 目录下所有 SKILL.md 文件，解析 frontmatter。
// CLI 不依赖 Express，仅返回基础元数据。

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export interface ScannedSkillMd {
  dirName: string;
  name: string;
  description: string;
  body: string;
  hasSkillMd: boolean;
}

/** 解析 SKILL.md 内容的 frontmatter + body */
export function parseSkillMd(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: content };
  }
  const yamlText = content.slice(3, endIdx).replace(/^\n/, "");
  const body = content.slice(endIdx + 4).replace(/^\n/, "");
  const frontmatter: Record<string, string> = {};
  try {
    const parsed = yaml.load(yamlText) as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
          frontmatter[k] = JSON.stringify(v);
        } else {
          frontmatter[k] = String(v ?? "");
        }
      }
    }
  } catch {
    // 解析失败时使用空 frontmatter
  }
  return { frontmatter, body };
}

/** 扫描 skills/ 目录 */
export function scanWorkbuddySkills(): ScannedSkillMd[] {
  const results: ScannedSkillMd[] = [];
  const candidates = [
    path.join(process.cwd(), "skills"),
    path.join(process.cwd(), "server", "..", "skills"),
  ];
  const skillsDir = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
  if (!skillsDir) return results;

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(skillsDir, entry.name);
    const skillMdPath = path.join(dirPath, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;
    const content = fs.readFileSync(skillMdPath, "utf8");
    const { frontmatter } = parseSkillMd(content);
    const name = frontmatter.name || entry.name;
    const description = frontmatter.description || "";
    results.push({
      dirName: entry.name,
      name,
      description,
      body: content,
      hasSkillMd: true,
    });
  }
  return results;
}
