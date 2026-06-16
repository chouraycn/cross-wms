/**
 * 三层技能注册表 (v1.5.79)
 *
 * 扫描三层目录并合并：
 *   用户级 > 项目级 > 内置
 * 同级目录中同名技能后者覆盖前者。
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseSkillMdContent } from './skillMdParser.js';

// ===================== 类型定义 =====================

/** 技能来源层级 */
export type SkillSource = 'user' | 'project' | 'builtin';

/** 单个技能入口 */
export interface SkillEntry {
  /** 技能名称（slug） */
  name: string;
  /** 展示名称 */
  displayName?: string;
  /** 技能描述 */
  description: string;
  /** 版本 */
  version?: string;
  /** 来源层级 */
  source: SkillSource;
  /** 技能目录绝对路径 */
  dirPath: string;
  /** SKILL.md 文件绝对路径 */
  filePath: string;
  /** 解析后的 frontmatter 完整数据 */
  frontmatter: Record<string, unknown>;
  /** Markdown body（不含 frontmatter） */
  body: string;
  /** prompt 模板 */
  promptTemplate: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 作用域 */
  scope?: 'project' | 'user';
  /** 运行时执行链 */
  chain?: string[];
  /** 指定模型 */
  model?: string;
  /** 标签 */
  tags?: string[];
  /** 触发器 */
  trigger?: string;
  /** 分类 */
  category?: string;
  /** 图标 */
  icon?: string;
  /** 是否被覆盖 */
  overridden?: boolean;
}

/** 覆盖信息 */
export interface OverrideInfo {
  name: string;
  overridden: SkillSource;
  overriddenBy: SkillSource;
  overriddenDir: string;
  overridingDir: string;
}

// ===================== 目录配置 =====================

const DIRS: Record<SkillSource, string> = {
  user: path.join(os.homedir(), 'Library', 'Application Support', 'CrossWMS', 'user-skills'),
  project: path.join(process.cwd(), 'skills'),
  builtin: path.join(__dirname, '..', '..', '..', 'Resources', 'builtin-skills'),
};

// ===================== 内部辅助 =====================

/** 扫描单个目录下的所有技能 */
function scanDir(dirPath: string, source: SkillSource): SkillEntry[] {
  const results: SkillEntry[] = [];

  if (!fs.existsSync(dirPath)) return results;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

      const subDir = path.join(dirPath, entry.name);
      const mdPath = path.join(subDir, 'SKILL.md');
      const mdLowerPath = path.join(subDir, 'skill.md');

      let actualMdPath: string | null = null;
      if (fs.existsSync(mdPath)) {
        actualMdPath = mdPath;
      } else if (fs.existsSync(mdLowerPath)) {
        actualMdPath = mdLowerPath;
      }

      if (!actualMdPath) continue;

      try {
        const content = fs.readFileSync(actualMdPath, 'utf-8');
        const parsed = parseSkillMdContent(content);
        const fm = parsed.frontmatter;

        // 规范化 trigger
        let trigger: string | undefined;
        if (typeof fm.trigger === 'string') {
          trigger = fm.trigger;
        } else if (Array.isArray(fm.trigger)) {
          trigger = fm.trigger.join(' / ');
        }

        results.push({
          name: fm.name || entry.name,
          displayName: fm.displayName,
          description: fm.description || parsed.body.slice(0, 100).replace(/[#*\n]/g, ' ').trim(),
          version: fm.version,
          source,
          dirPath: subDir,
          filePath: actualMdPath,
          frontmatter: fm as Record<string, unknown>,
          body: parsed.body,
          promptTemplate: parsed.promptTemplate,
          enabled: fm.enabled !== false,
          scope: (fm.scope as 'project' | 'user') || 'project',
          chain: Array.isArray(fm.chain) ? fm.chain.map(String) : undefined,
          model: fm.model || 'auto',
          tags: Array.isArray(fm.tags) ? fm.tags.map(String) : undefined,
          trigger,
          category: fm.category,
          icon: fm.icon,
        });
      } catch {
        // 读取/解析失败，跳过
      }
    }
  } catch {
    // 目录读取失败
  }

  return results;
}

// ===================== 核心公开 API =====================

/** 扫描三层目录并合并（用户 > 项目 > 内置） */
export function scanAll(): SkillEntry[] {
  const bySource: Record<SkillSource, SkillEntry[]> = {
    user: scanDir(DIRS.user, 'user'),
    project: scanDir(DIRS.project, 'project'),
    builtin: scanDir(DIRS.builtin, 'builtin'),
  };

  // 合并规则：优先级 用户 > 项目 > 内置
  const merged = new Map<string, SkillEntry>();
  const overrideMap = new Map<string, SkillSource>(); // name → 覆盖来源

  // 按优先级从低到高插入：内置 → 项目 → 用户
  const priorityOrder: SkillSource[] = ['builtin', 'project', 'user'];

  for (const source of priorityOrder) {
    for (const entry of bySource[source]) {
      const existing = merged.get(entry.name);
      if (existing) {
        // 标记旧条目被覆盖
        existing.overridden = true;
        overrideMap.set(entry.name, source);
      }
      merged.set(entry.name, { ...entry });
    }
  }

  // 结果排序：按名称字母序
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** 按名称查找技能（优先级：用户 > 项目 > 内置） */
export function findByName(name: string): SkillEntry | null {
  const all = scanAll();
  return all.find((s) => s.name === name && !s.overridden) || null;
}

/** 获取所有已注册技能 */
export function getAll(): SkillEntry[] {
  return scanAll().filter((s) => !s.overridden);
}

/** 获取被覆盖的技能信息 */
export function getOverridden(): OverrideInfo[] {
  const all = scanAll();
  const overridden = all.filter((s) => s.overridden);
  const active = all.filter((s) => !s.overridden);

  const result: OverrideInfo[] = [];
  for (const entry of overridden) {
    // 找到覆盖它的活跃条目
    const activeEntry = active.find((a) => a.name === entry.name);
    if (activeEntry) {
      result.push({
        name: entry.name,
        overridden: entry.source,
        overriddenBy: activeEntry.source,
        overriddenDir: entry.dirPath,
        overridingDir: activeEntry.dirPath,
      });
    }
  }
  return result;
}

/** 获取三层目录路径 */
export function getSkillDirs(): Record<SkillSource, string> {
  return { ...DIRS };
}
