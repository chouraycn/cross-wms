/**
 * Skill Prompt Renderer — Skill Prompt 渲染器
 *
 * 负责将 Skill 列表渲染为 XML 格式的 Prompt 片段，支持三级降级：
 * 1. Level 1 (full): name + description + location + version
 * 2. Level 2 (compact): name + location + version（去掉 description）
 * 3. Level 3 (binary truncate): compact 仍超预算时，二分查找最大前缀
 *
 * 同时支持路径压缩（useCompactPaths）：
 * - ~/ 替换 os.homedir() 前缀
 * - $WORKSPACE/ 替换工作区路径前缀（可选）
 */

import os from 'os';
import path from 'path';
import type {
  SkillDefinition,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 渲染选项 */
export interface RenderOptions {
  /** 最大 Skill 数量（默认 150） */
  maxSkillsInPrompt?: number;
  /** 最大字符数（默认 18000） */
  maxChars?: number;
  /** 输出格式（默认 'auto'） */
  format?: 'full' | 'compact' | 'auto';
  /** 是否使用压缩路径（默认 true） */
  useCompactPaths?: boolean;
  /** 是否包含版本号（默认 true） */
  includeVersion?: boolean;
  /** 工作区根目录（可选，用于 $WORKSPACE/ 替换） */
  workspaceRoot?: string;
}

/** 内部渲染的 Skill 数据（统一格式） */
interface RenderableSkill {
  name: string;
  description: string;
  location: string;
  version?: string;
}

// ===================== 常量 =====================

const DEFAULT_MAX_SKILLS = 150;
const DEFAULT_MAX_CHARS = 18000;
const TRUNCATED_SUFFIX_TEMPLATE = (n: number) => `\n  <!-- ... (truncated, ${n} more) -->`;

// ===================== 公开 API =====================

/**
 * 渲染 Skill Prompt（XML 格式）
 *
 * @param skills - Skill 定义列表
 * @param options - 渲染选项
 * @returns XML 格式的 Prompt 片段
 */
export function renderSkillsPrompt(
  skills: SkillDefinition[],
  options: RenderOptions = {},
): string {
  const {
    maxSkillsInPrompt = DEFAULT_MAX_SKILLS,
    maxChars = DEFAULT_MAX_CHARS,
    format = 'auto',
    useCompactPaths = true,
    includeVersion = true,
    workspaceRoot,
  } = options;

  const limitedSkills = skills.slice(0, maxSkillsInPrompt);

  const renderables = limitedSkills.map((skill) => ({
    name: skill.name || skill.id,
    description: skill.description || '',
    location: useCompactPaths
      ? compactSkillPath(skill.sourcePath || '', workspaceRoot)
      : (skill.sourcePath || ''),
    version: includeVersion ? skill.version : undefined,
  }));

  if (format === 'full') {
    return renderFullFormat(renderables, maxChars);
  }

  if (format === 'compact') {
    return renderCompactFormat(renderables, maxChars);
  }

  return renderAutoFormat(renderables, maxChars);
}

/**
 * 压缩 Skill 路径
 *
 * - 用 ~/ 替换 os.homedir() 前缀
 * - 用 $WORKSPACE/ 替换工作区路径前缀（可选）
 *
 * @param fullPath - 完整路径
 * @param workspaceRoot - 工作区根目录（可选）
 * @returns 压缩后的路径
 */
export function compactSkillPath(fullPath: string, workspaceRoot?: string): string {
  if (!fullPath) return '';

  let result = fullPath;

  if (workspaceRoot) {
    const normalizedWorkspace = path.normalize(workspaceRoot);
    const normalizedPath = path.normalize(result);
    if (normalizedPath.startsWith(normalizedWorkspace + path.sep) ||
        normalizedPath === normalizedWorkspace) {
      const relative = path.relative(normalizedWorkspace, normalizedPath);
      result = relative ? `$WORKSPACE/${relative.split(path.sep).join('/')}` : '$WORKSPACE';
      return result;
    }
  }

  const homeDir = os.homedir();
  if (homeDir) {
    const normalizedHome = path.normalize(homeDir);
    const normalizedPath = path.normalize(result);
    if (normalizedPath.startsWith(normalizedHome + path.sep) ||
        normalizedPath === normalizedHome) {
      const relative = path.relative(normalizedHome, normalizedPath);
      result = relative ? `~/${relative.split(path.sep).join('/')}` : '~';
    }
  }

  return result;
}

// ===================== 格式渲染 =====================

/**
 * 自动格式：尝试 full → compact → binary truncate
 */
function renderAutoFormat(skills: RenderableSkill[], maxChars: number): string {
  const full = renderFullFormatRaw(skills);
  if (full.length <= maxChars) {
    return full;
  }

  const compact = renderCompactFormatRaw(skills);
  if (compact.length <= maxChars) {
    return compact;
  }

  return renderTruncatedCompact(skills, maxChars);
}

/**
 * 强制 full 格式（超预算时降级到 truncated）
 */
function renderFullFormat(skills: RenderableSkill[], maxChars: number): string {
  const full = renderFullFormatRaw(skills);
  if (full.length <= maxChars) {
    return full;
  }

  const compact = renderCompactFormatRaw(skills);
  if (compact.length <= maxChars) {
    return compact;
  }

  return renderTruncatedCompact(skills, maxChars);
}

/**
 * 强制 compact 格式（超预算时降级到 truncated）
 */
function renderCompactFormat(skills: RenderableSkill[], maxChars: number): string {
  const compact = renderCompactFormatRaw(skills);
  if (compact.length <= maxChars) {
    return compact;
  }

  return renderTruncatedCompact(skills, maxChars);
}

// ===================== 原始渲染（无截断） =====================

/**
 * 渲染完整格式原始 XML
 */
function renderFullFormatRaw(skills: RenderableSkill[]): string {
  const lines: string[] = ['<available_skills>'];

  for (const skill of skills) {
    lines.push(renderFullSkillLine(skill));
  }

  lines.push('</available_skills>');
  return lines.join('\n');
}

/**
 * 渲染紧凑格式原始 XML
 */
function renderCompactFormatRaw(skills: RenderableSkill[]): string {
  const lines: string[] = ['<available_skills>'];

  for (const skill of skills) {
    lines.push(renderCompactSkillLine(skill));
  }

  lines.push('</available_skills>');
  return lines.join('\n');
}

// ===================== 单条 Skill 渲染 =====================

/**
 * 渲染单条完整格式 Skill 行
 */
function renderFullSkillLine(skill: RenderableSkill): string {
  const attrs: string[] = [];
  attrs.push(`name="${escapeXmlAttr(skill.name)}"`);
  attrs.push(`description="${escapeXmlAttr(skill.description)}"`);
  attrs.push(`location="${escapeXmlAttr(skill.location)}"`);
  if (skill.version !== undefined) {
    attrs.push(`version="${escapeXmlAttr(skill.version)}"`);
  }
  return `  <skill ${attrs.join(' ')} />`;
}

/**
 * 渲染单条紧凑格式 Skill 行（无 description）
 */
function renderCompactSkillLine(skill: RenderableSkill): string {
  const attrs: string[] = [];
  attrs.push(`name="${escapeXmlAttr(skill.name)}"`);
  attrs.push(`location="${escapeXmlAttr(skill.location)}"`);
  if (skill.version !== undefined) {
    attrs.push(`version="${escapeXmlAttr(skill.version)}"`);
  }
  return `  <skill ${attrs.join(' ')} />`;
}

// ===================== 二进制截断 =====================

/**
 * 截断的紧凑格式：使用二分查找确定最大前缀数量
 */
function renderTruncatedCompact(skills: RenderableSkill[], maxChars: number): string {
  const openingTag = '<available_skills>\n';
  const closingTag = '\n</available_skills>';
  const fixedOverhead = openingTag.length + closingTag.length;

  if (maxChars <= fixedOverhead + 20) {
    return `${openingTag}  <!-- no skills (budget too small) -->${closingTag}`;
  }

  const budgetForItems = maxChars - fixedOverhead;

  let low = 0;
  let high = skills.length;
  let bestCount = 0;
  let bestSuffix = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const remaining = skills.length - mid;
    const suffix = remaining > 0 ? TRUNCATED_SUFFIX_TEMPLATE(remaining) : '';
    const suffixLen = suffix.length;

    const itemsBudget = budgetForItems - suffixLen;
    if (itemsBudget <= 0) {
      high = mid - 1;
      continue;
    }

    const itemsLength = measureCompactItemsLength(skills, mid);

    if (itemsLength <= itemsBudget) {
      bestCount = mid;
      bestSuffix = suffix;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lines: string[] = [];
  for (let i = 0; i < bestCount; i++) {
    lines.push(renderCompactSkillLine(skills[i]));
  }
  if (bestSuffix) {
    lines.push(bestSuffix.trimStart());
  }

  return `${openingTag}${lines.join('\n')}${closingTag}`;
}

/**
 * 计算前 N 个 compact 格式 Skill 行的总长度（含换行符）
 */
function measureCompactItemsLength(skills: RenderableSkill[], count: number): number {
  if (count === 0) return 0;

  let total = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) total += 1; // newline
    total += renderCompactSkillLine(skills[i]).length;
  }
  return total;
}

// ===================== 工具函数 =====================

/**
 * XML 属性值转义
 */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
