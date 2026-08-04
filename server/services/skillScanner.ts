/**
 * 技能扫描器 — 扫描 ~/.workbuddy/skills/ 下的 SKILL.md 技能包
 *
 * 从 routes/skills.ts 提取为独立 leaf 模块，打破 routes/skills.ts ↔ services/skillRecommender.ts 循环依赖。
 */
import fs from 'fs';
import path from 'path';
import { parseSkillMdContent } from './skillMdParser.js';
import { AppPaths } from '../config/appPaths.js';

// ===================== 类型定义 =====================

/** SKILL.md 扫描结果（不含 body，仅元数据） */
export interface ScannedSkillMd {
  dirName: string;
  name: string;
  description: string;
  body: string; // 扫描接口为空，read 接口返回完整内容
  hasSkillMd: boolean;
}

// ===================== SKILL.md 解析工具（基于 js-yaml） =====================

// NOTE: parseSkillMd() 现已委托给 src/services/skill/skillMdParser.ts
// 这里保留一个兼容包装，供 scanWorkbuddySkills() 使用

/** 兼容包装：使用新的 js-yaml 解析器解析 SKILL.md 内容，返回原有格式的 frontmatter + body */
export function parseSkillMd(content: string): { frontmatter: Record<string, string>; body: string } {
  const parsed = parseSkillMdContent(content);
  const frontmatter: Record<string, string> = {};

  // 将新格式 frontmatter 转换为旧格式（key: string）
  for (const [key, value] of Object.entries(parsed.frontmatter)) {
    if (Array.isArray(value)) {
      frontmatter[key] = JSON.stringify(value);
    } else if (typeof value === 'object' && value !== null) {
      frontmatter[key] = JSON.stringify(value);
    } else {
      frontmatter[key] = String(value);
    }
  }

  return { frontmatter, body: parsed.body };
}

// ===================== SKILL.md 扫描 =====================

export function scanWorkbuddySkills(): ScannedSkillMd[] {
  const skillsDir = AppPaths.skillsDir;
  const results: ScannedSkillMd[] = [];

  if (!fs.existsSync(skillsDir)) return results;

  /**
   * 解析单个 SKILL.md 候选文件并加入 results
   */
  const tryReadSkillMd = (mdPath: string, dirName: string, groupPrefix = '') => {
    try {
      const content = fs.readFileSync(mdPath, 'utf-8');
      const { frontmatter, body } = parseSkillMd(content);
      // dirName 在 group 下拼前缀，避免与根级同名技能冲突
      const finalDirName = groupPrefix ? `${groupPrefix}/${dirName}` : dirName;
      results.push({
        dirName: finalDirName,
        name: frontmatter.name || dirName,
        description: frontmatter.description || body.slice(0, 100).replace(/[#*\n]/g, ' ').trim(),
        body,
        hasSkillMd: true,
      });
    } catch {
      // 读取失败跳过
    }
  };

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // 跳过隐藏目录和 __MACOSX
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

      const dirPath = path.join(skillsDir, entry.name);
      // 优先查找 SKILL.md（大写），再查找 skill.md（小写）
      const skillMdPath = path.join(dirPath, 'SKILL.md');
      const skillMdLowerPath = path.join(dirPath, 'skill.md');

      if (fs.existsSync(skillMdPath)) {
        tryReadSkillMd(skillMdPath, entry.name);
      } else if (fs.existsSync(skillMdLowerPath)) {
        tryReadSkillMd(skillMdLowerPath, entry.name);
      } else {
        // 目录存在但无 SKILL.md：可能是 group 目录（如 _imported/openclaw/<name>）
        // 尝试向下递归一层
        const subEntries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          if (sub.name.startsWith('.') || sub.name === '__MACOSX') continue;
          const subDir = path.join(dirPath, sub.name);
          const subMd = path.join(subDir, 'SKILL.md');
          const subMdLower = path.join(subDir, 'skill.md');
          if (fs.existsSync(subMd)) {
            tryReadSkillMd(subMd, sub.name, entry.name);
          } else if (fs.existsSync(subMdLower)) {
            tryReadSkillMd(subMdLower, sub.name, entry.name);
          } else {
            // 子目录无 SKILL.md，跳过
          }
        }
      }
    }
  } catch {
    // 目录读取失败
  }

  return results;
}
