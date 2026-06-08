/**
 * 标准 SKILL.md 适配器
 *
 * 提供纯函数，将标准 SKILL.md 格式适配为 CDF Know Clow 内部 Skill 格式，
 * 包括依赖检查、类别映射、安装等功能。
 *
 * @module standardSkillAdapter
 */

import { ParsedSkillMd, parseSkillMd } from './skillMdParser';
import { Skill, SkillDependency, SkillPermission } from '../../types/skill';
import { CATEGORY_LABELS, getCategoryLabel } from '../../constants/skillCategories';

/**
 * 依赖检查结果
 */
export interface DependencyCheckResult {
  /** 是否所有必需依赖都已满足 */
  satisfied: boolean;
  /** 缺失的依赖列表 */
  missing: string[];
  /** 已安装的依赖列表 */
  installed: string[];
}

/**
 * 检查技能依赖是否满足
 *
 * @param dependencies - 依赖的技能名称列表
 * @param installedSkills - 已安装的技能名称列表
 * @returns 依赖检查结果
 */
export function checkDependencies(
  dependencies: string[],
  installedSkills: string[],
): DependencyCheckResult {
  if (!dependencies || dependencies.length === 0) {
    return {
      satisfied: true,
      missing: [],
      installed: [],
    };
  }

  const installedSet = new Set(installedSkills.map((s) => s.toLowerCase()));
  const missing: string[] = [];
  const installed: string[] = [];

  for (const dep of dependencies) {
    if (installedSet.has(dep.toLowerCase())) {
      installed.push(dep);
    } else {
      missing.push(dep);
    }
  }

  return {
    satisfied: missing.length === 0,
    missing,
    installed,
  };
}

/**
 * 将标准 SKILL.md 解析结果适配为 CDF Know Clow Skill 格式
 *
 * @param parsed - parseSkillMd() 的解析结果
 * @param filePath - 可选的文件路径，用于生成 ID
 * @returns 适配后的 Skill 对象（部分字段）
 */
export function adaptToSkill(
  parsed: ParsedSkillMd,
  filePath?: string,
): {
  name: string;
  description: string;
  trigger: string[];
  tags: string[];
  category: string;
  icon?: string;
  version?: string;
  author?: string;
  dependencies: string[];
  permissions: string[];
  standardFields: {
    version?: string;
    author?: string;
    dependencies?: string[];
    permissions?: string[];
    instructionBlocks?: string[];
  };
} {
  const effectiveName = parsed.name || extractNameFromPath(filePath || '');
  const effectiveDescription = parsed.description || parsed.inferredDescription || '';
  const effectiveTrigger = parsed.trigger || parsed.inferredTrigger || [];

  return {
    name: effectiveName,
    description: effectiveDescription,
    trigger: effectiveTrigger,
    tags: parsed.tags || [],
    category: mapCategory(parsed.category),
    icon: parsed.icon,
    version: parsed.version,
    author: parsed.author,
    dependencies: parsed.dependencies || [],
    permissions: parsed.permissions || [],
    standardFields: {
      version: parsed.version,
      author: parsed.author,
      dependencies: parsed.dependencies,
      permissions: parsed.permissions,
      instructionBlocks: parsed.instructionBlocks,
    },
  };
}

/**
 * 映射标准类别到 CDF Know Clow 类别标签
 *
 * 支持双向映射：
 * 1. 如果输入是标准英文键（如 'tool'），直接返回
 * 2. 如果输入是中文标签（如 '工具'），查找对应的英文键
 * 3. 如果输入不匹配任何已知类别，返回 'tool' 作为默认
 *
 * @param category - 标准类别字符串（英文或中文）
 * @returns CDF Know Clow 类别标签（如 'tool'、'audit'）
 */
export function mapCategory(category?: string): string {
  if (!category || category.trim() === '') {
    return 'tool';
  }

  const normalized = category.trim().toLowerCase();

  // 如果已经是有效的英文类别键，直接返回
  const validCategories = Object.keys(CATEGORY_LABELS);
  if (validCategories.includes(normalized)) {
    return normalized;
  }

  // 尝试通过中文标签查找英文键
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    if (label === category || key === normalized) {
      return key;
    }
  }

  // 常见的中文类别映射
  const chineseCategoryMap: Record<string, string> = {
    '核心功能': 'core',
    '数据管理': 'data',
    '自动化': 'auto',
    '工具': 'tool',
    '通讯协作': 'communication',
    '文档处理': 'document',
    '设计创作': 'design',
    '开发工具': 'development',
    '媒体处理': 'media',
    '财务分析': 'finance',
    '效率提升': 'productivity',
    'AI 智能体': 'ai-agent',
    '安全审计': 'audit',
    '审计': 'audit',
  };

  if (chineseCategoryMap[category]) {
    return chineseCategoryMap[category];
  }

  // 默认返回 'tool'
  return 'tool';
}

/**
 * 获取已安装的技能名称列表（异步）
 *
 * 调用 GET /api/skills 接口获取已安装的技能列表
 *
 * @returns 已安装技能的名称列表
 */
export async function getInstalledSkills(): Promise<string[]> {
  try {
    const response = await fetch('/api/skills', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch skills: ${response.status} ${response.statusText}`);
    }

    const skills: Skill[] = await response.json();

    // 提取技能名称列表
    return skills.map((skill) => skill.name);
  } catch (error) {
    console.error('Failed to get installed skills:', error);
    // 返回空数组，让调用者处理
    return [];
  }
}

/**
 * 安装标准技能
 *
 * 调用 POST /api/skills/import 接口安装技能
 *
 * @param content - SKILL.md 文件内容
 * @param filePath - 可选的文件路径
 * @returns 安装结果
 */
export async function installStandardSkill(
  content: string,
  filePath?: string,
): Promise<{ success: boolean; skillId?: string; error?: string }> {
  try {
    const response = await fetch('/api/skills/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        filePath,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `安装失败: ${response.status} ${response.statusText}`,
      };
    }

    return {
      success: true,
      skillId: result.skillId || result.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to install standard skill:', error);
    return {
      success: false,
      error: `安装失败: ${message}`,
    };
  }
}

/**
 * 从文件路径中提取技能名称
 *
 * @param filePath - 文件路径
 * @returns 提取的名称
 */
function extractNameFromPath(filePath: string): string {
  // 获取文件名（去掉扩展名）
  const fileName = filePath.replace(/^.*[/\\]/, '').replace(/\.[^.]*$/, '');

  // 如果是 SKILL.md，取目录名
  if (fileName.toLowerCase() === 'skill') {
    const parts = filePath.replace(/[/\\]$/, '').split(/[/\\]/);
    return parts[parts.length - 2] || fileName;
  }

  return fileName;
}
