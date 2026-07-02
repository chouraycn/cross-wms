/**
 * Skill Content Reader — Skill 内容读取工具
 *
 * 提供 LLM 可调用的 Skill 内容读取功能，使 Agent 能够：
 * 1. 查看可用 Skill 列表
 * 2. 读取单个 Skill 的详细内容（SKILL.md）
 * 3. 搜索相关 Skill
 *
 * 集成方式：
 * - 注册为内置工具（skill_list, skill_read, skill_search）
 * - 供 LLM 在对话中自动调用以发现和使用 Skill
 */

import { skillRegistry } from './skillRegistry.js';
import { skillDiscovery } from './skillDiscoverySingleton.js';
import { logger } from '../logger.js';
import type {
  SkillPermissionConfig,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** Skill 列表参数 */
export interface SkillListParams {
  /** 分组过滤 */
  group?: string;
  /** 标签过滤 */
  tag?: string;
  /** 最大返回数量 */
  limit?: number;
}

/** Skill 读取参数 */
export interface SkillReadParams {
  /** Skill ID */
  skillId: string;
  /** 是否包含完整的 SKILL.md 内容 */
  includeContent?: boolean;
}

/** Skill 搜索参数 */
export interface SkillSearchParams {
  /** 搜索关键词 */
  query: string;
  /** 最大返回数量 */
  limit?: number;
}

/** Skill 列表结果 */
export interface SkillListResult {
  total: number;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    group: string;
    tags: string[];
    version?: string;
    source: string;
  }>;
}

/** Skill 读取结果 */
export interface SkillReadResult {
  skill: {
    id: string;
    name: string;
    description: string;
    group: string;
    parameters?: Record<string, unknown>;
    version?: string;
    author?: string;
    tags: string[];
    source: string;
    sourcePath?: string;
    skillMdContent?: string;
    instructionBlocks?: string[];
  };
}

/** Skill 搜索结果 */
export interface SkillSearchResult {
  query: string;
  total: number;
  results: Array<{
    id: string;
    name: string;
    description: string;
    group: string;
    tags: string[];
    relevance: number;
  }>;
}

// ===================== SkillContentReader 类 =====================

/**
 * Skill 内容读取器
 *
 * 提供 LLM 可调用的 Skill 发现和内容读取功能。
 */
export class SkillContentReader {
  constructor() {}

  // ===================== 1. Skill 列表 =====================

  /**
   * 获取可用 Skill 列表
   *
   * @param params - 查询参数
   * @param permissionConfig - 权限配置
   * @param agentId - Agent ID（可选）
   * @returns Skill 列表
   */
  listSkills(
    params: SkillListParams = {},
    permissionConfig?: SkillPermissionConfig,
    agentId?: string,
  ): SkillListResult {
    const { group, tag, limit = 50 } = params;

    // 获取可见的 Skill
    let skills = skillDiscovery.getVisibleSkills({
      visibility: 'promptVisible',
      agentId,
    });

    // Group 过滤
    if (group) {
      skills = skills.filter((s) => s.group === group);
    }

    // 标签过滤
    if (tag) {
      const tagLower = tag.toLowerCase();
      skills = skills.filter((s) =>
        s.tags.some((t) => t.toLowerCase() === tagLower),
      );
    }

    // 权限过滤（如果提供了权限配置）
    if (permissionConfig) {
      skills = skills.filter((s) =>
        this.passesPermission(s.skillId, s.group, permissionConfig),
      );
    }

    const total = skills.length;
    const resultSkills = skills.slice(0, limit).map((s) => ({
      id: s.skillId,
      name: s.displayName,
      description: s.description,
      group: s.group,
      tags: s.tags,
      version: s.version,
      source: s.source,
    }));

    return {
      total,
      skills: resultSkills,
    };
  }

  // ===================== 2. Skill 详情 =====================

  /**
   * 读取单个 Skill 的详细内容
   *
   * @param params - 读取参数
   * @param permissionConfig - 权限配置
   * @returns Skill 详情
   */
  readSkill(
    params: SkillReadParams,
    permissionConfig?: SkillPermissionConfig,
  ): SkillReadResult | { error: string } {
    const { skillId, includeContent = true } = params;

    // 从注册表获取 Skill
    const registered = skillRegistry.getSkill(skillId);
    if (!registered) {
      return { error: `Skill '${skillId}' 未找到或不存在` };
    }

    const { definition } = registered;

    // 权限检查
    if (permissionConfig) {
      if (!this.passesPermission(skillId, definition.group, permissionConfig)) {
        return { error: `无权限访问 Skill '${skillId}'` };
      }
    }

    // 构建返回结果
    const result: SkillReadResult = {
      skill: {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        group: definition.group,
        parameters: definition.parameters,
        version: definition.version,
        author: definition.author,
        tags: definition.tags ?? [],
        source: definition.source,
        sourcePath: definition.sourcePath,
      },
    };

    // 包含完整内容
    if (includeContent) {
      result.skill.skillMdContent = definition.skillMdContent;
      result.skill.instructionBlocks = definition.instructionBlocks;
    }

    return result;
  }

  // ===================== 3. Skill 搜索 =====================

  /**
   * 搜索相关 Skill
   *
   * @param params - 搜索参数
   * @param permissionConfig - 权限配置
   * @param agentId - Agent ID（可选）
   * @returns 搜索结果
   */
  searchSkills(
    params: SkillSearchParams,
    permissionConfig?: SkillPermissionConfig,
    agentId?: string,
  ): SkillSearchResult {
    const { query, limit = 10 } = params;

    // 搜索 Skill
    let skills = skillDiscovery.getVisibleSkills({
      visibility: 'promptVisible',
      agentId,
      search: query,
    });

    // 权限过滤
    if (permissionConfig) {
      skills = skills.filter((s) =>
        this.passesPermission(s.skillId, s.group, permissionConfig),
      );
    }

    // 计算相关性分数（简单实现：名称匹配 > 描述匹配 > 标签匹配）
    const queryLower = query.toLowerCase();
    const scored = skills.map((s) => {
      let relevance = 0;

      if (s.displayName.toLowerCase().includes(queryLower)) {
        relevance += 50;
      }
      if (s.skillId.toLowerCase().includes(queryLower)) {
        relevance += 40;
      }
      if (s.description.toLowerCase().includes(queryLower)) {
        relevance += 30;
      }
      if (s.tags.some((t) => t.toLowerCase().includes(queryLower))) {
        relevance += 20;
      }

      return { ...s, relevance };
    });

    // 按相关性排序
    scored.sort((a, b) => b.relevance - a.relevance);

    const total = scored.length;
    const results = scored.slice(0, limit).map((s) => ({
      id: s.skillId,
      name: s.displayName,
      description: s.description,
      group: s.group,
      tags: s.tags,
      relevance: s.relevance,
    }));

    return {
      query,
      total,
      results,
    };
  }

  // ===================== 4. 权限检查 =====================

  /**
   * 检查 Skill 是否通过权限配置
   */
  private passesPermission(
    skillId: string,
    group: string,
    config: SkillPermissionConfig,
  ): boolean {
    // deny 优先
    for (const pattern of config.deny) {
      if (this.matchPattern(pattern, skillId, group)) {
        return false;
      }
    }

    // allow 列表
    if (config.allow.length > 0) {
      return config.allow.some((pattern) =>
        this.matchPattern(pattern, skillId, group),
      );
    }

    return true;
  }

  /**
   * 匹配权限模式
   */
  private matchPattern(pattern: string, skillId: string, group: string): boolean {
    if (pattern === '*') return true;
    if (pattern === skillId) return true;
    if (pattern === group) return true;
    if (pattern.endsWith(':*') && group === pattern.slice(0, -2)) {
      return true;
    }
    return false;
  }

  // ===================== 5. Tool Definition 转换 =====================

  /**
   * 获取工具定义（用于注册到 LLM Tool Calling）
   */
  getToolDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return [
      {
        type: 'function',
        function: {
          name: 'skill_list',
          description: '获取可用的技能(Skill)列表，支持按分组、标签过滤。当你不确定有哪些技能可用时使用此工具。',
          parameters: {
            type: 'object',
            properties: {
              group: {
                type: 'string',
                description: '按权限分组过滤，如 wms, util, network 等',
              },
              tag: {
                type: 'string',
                description: '按标签过滤',
              },
              limit: {
                type: 'number',
                description: '最大返回数量，默认 50',
              },
            },
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'skill_read',
          description: '读取指定技能(Skill)的详细内容，包括 SKILL.md 完整内容和使用说明。在调用某个技能之前，先使用此工具了解技能的具体用法。',
          parameters: {
            type: 'object',
            properties: {
              skillId: {
                type: 'string',
                description: '技能 ID，如 calc, wms_query 等',
              },
              includeContent: {
                type: 'boolean',
                description: '是否包含完整的 SKILL.md 内容，默认 true',
              },
            },
            required: ['skillId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'skill_search',
          description: '搜索相关的技能(Skill)，根据关键词查找最匹配的技能。当用户需求不明确时使用此工具搜索合适的技能。',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词，如"库存"、"计算"、"文件"等',
              },
              limit: {
                type: 'number',
                description: '最大返回数量，默认 10',
              },
            },
            required: ['query'],
          },
        },
      },
    ];
  }
}

// ===================== Module-level Singleton =====================

/** Skill 内容读取器单例 */
export const skillContentReader = new SkillContentReader();
