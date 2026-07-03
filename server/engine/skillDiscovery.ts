/**
 * Skill Discovery — Skill 发现与索引系统
 *
 * 负责 Skill 的发现、索引、可见性控制和 Agent 级别过滤。
 *
 * 核心功能：
 * 1. buildSkillIndex(skills) — 构建标准化索引
 * 2. getVisibleSkills(options) — 获取指定可见性的 Skill
 * 3. getSkillsForPrompt(agentId, visibility) — 获取注入到 Prompt 的 Skill
 * 4. normalizeSkillIndexName(name) — 标准化名称匹配
 * 5. agentSkillFilter(agentId, skill) — Agent 级别过滤
 *
 * 可见性层级：
 * - runtimeVisible: 运行时可见（可被工具调度系统发现）
 * - promptVisible: Prompt 可见（会被注入到系统提示中）
 * - userInvocable: 用户可调用（用户可直接触发）
 */

import { logger } from '../logger.js';
import type {
  RegisteredSkill,
  SkillDefinition,
  SkillPermissionGroup,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** Skill 可见性级别 */
export type SkillVisibility = 'runtimeVisible' | 'promptVisible' | 'userInvocable';

/** Skill 索引条目 */
export interface SkillIndexEntry {
  skillId: string;
  normalizedName: string;
  displayName: string;
  description: string;
  group: SkillPermissionGroup;
  tags: string[];
  visibility: {
    runtimeVisible: boolean;
    promptVisible: boolean;
    userInvocable: boolean;
  };
  /** 禁止模型自动调用（仅允许用户调用） */
  disableModelInvocation?: boolean;
  source: 'builtin' | 'workspace' | 'user';
  version?: string;
  registeredAt: number;
  /** 使用频率 */
  useFrequency?: number;
  /** 最近一次使用时间戳 */
  lastUsed?: number;
  /** 成功率（0-1） */
  successRate?: number;
  /** 平均执行耗时（毫秒） */
  avgDurationMs?: number;
}

/** 构建索引的选项 */
export interface BuildIndexOptions {
  /** 默认 runtimeVisible 的 group 列表 */
  defaultRuntimeGroups?: SkillPermissionGroup[];
  /** 默认 promptVisible 的 group 列表 */
  defaultPromptGroups?: SkillPermissionGroup[];
  /** Agent 级别过滤规则 */
  agentFilters?: Record<string, AgentSkillFilter>;
}

/** Agent 级别 Skill 过滤规则 */
export interface AgentSkillFilter {
  /** 允许的 group 或 skill id（空 = 全部允许） */
  allow?: string[];
  /** 拒绝的 group 或 skill id */
  deny?: string[];
  /** 该 Agent 可见的标签 */
  tags?: string[];
}

/** 获取可见 Skill 的选项 */
export interface GetVisibleOptions {
  /** 可见性级别 */
  visibility?: SkillVisibility;
  /** Agent ID（用于 Agent 级别过滤） */
  agentId?: string;
  /** 权限分组过滤 */
  groups?: SkillPermissionGroup[];
  /** 标签过滤 */
  tags?: string[];
  /** 来源过滤 */
  sources?: ('builtin' | 'workspace' | 'user')[];
  /** 搜索关键词 */
  search?: string;
}

// ===================== 常量 =====================

/** 默认 runtimeVisible 的 group */
const DEFAULT_RUNTIME_GROUPS: SkillPermissionGroup[] = [
  'fs_read',
  'fs_write',
  'runtime_exec',
  'browser',
  'network',
  'memory',
  'wms',
  'util',
  'custom',
];

/** 默认 promptVisible 的 group */
const DEFAULT_PROMPT_GROUPS: SkillPermissionGroup[] = [
  'wms',
  'util',
  'custom',
];

// ===================== SkillDiscovery 类 =====================

/**
 * Skill 发现与索引管理器
 */
export class SkillDiscovery {
  /** Skill 索引：skillId → SkillIndexEntry */
  private index = new Map<string, SkillIndexEntry>();

  /** 名称索引：normalizedName → skillId[]（支持模糊匹配） */
  private nameIndex = new Map<string, string[]>();

  /** 标签索引：tag → skillId[] */
  private tagIndex = new Map<string, string[]>();

  /** Group 索引：group → skillId[] */
  private groupIndex = new Map<SkillPermissionGroup, string[]>();

  /** Agent 过滤规则 */
  private agentFilters: Record<string, AgentSkillFilter> = {};

  /** 默认 runtime groups */
  private defaultRuntimeGroups: SkillPermissionGroup[];

  /** 默认 prompt groups */
  private defaultPromptGroups: SkillPermissionGroup[];

  constructor(options: BuildIndexOptions = {}) {
    this.defaultRuntimeGroups = options.defaultRuntimeGroups ?? DEFAULT_RUNTIME_GROUPS;
    this.defaultPromptGroups = options.defaultPromptGroups ?? DEFAULT_PROMPT_GROUPS;
    this.agentFilters = options.agentFilters ?? {};
  }

  // ===================== 1. 索引构建 =====================

  /**
   * 构建/重建 Skill 索引
   *
   * @param skills - 注册的 Skill 列表
   */
  buildIndex(skills: RegisteredSkill[]): void {
    this.index.clear();
    this.nameIndex.clear();
    this.tagIndex.clear();
    this.groupIndex.clear();

    for (const skill of skills) {
      const entry = this.createIndexEntry(skill);
      this.index.set(entry.skillId, entry);

      // 名称索引
      const names = [
        entry.normalizedName,
        ...entry.tags.map((t) => t.toLowerCase()),
      ];
      for (const name of names) {
        if (!this.nameIndex.has(name)) {
          this.nameIndex.set(name, []);
        }
        this.nameIndex.get(name)!.push(entry.skillId);
      }

      // 标签索引
      for (const tag of entry.tags) {
        const tagLower = tag.toLowerCase();
        if (!this.tagIndex.has(tagLower)) {
          this.tagIndex.set(tagLower, []);
        }
        this.tagIndex.get(tagLower)!.push(entry.skillId);
      }

      // Group 索引
      const group = entry.group;
      if (!this.groupIndex.has(group)) {
        this.groupIndex.set(group, []);
      }
      this.groupIndex.get(group)!.push(entry.skillId);
    }

    logger.info(`[SkillDiscovery] Index built. Total: ${this.index.size}`);
  }

  /**
   * 创建索引条目
   */
  private createIndexEntry(skill: RegisteredSkill): SkillIndexEntry {
    const { definition } = skill;
    const group = definition.group;

    // 计算可见性
    const runtimeVisible = this.defaultRuntimeGroups.includes(group)
      && definition.userInvocable !== false;

    const promptVisible = this.defaultPromptGroups.includes(group)
      && definition.userInvocable !== false;

    const userInvocable = definition.userInvocable !== false;

    return {
      skillId: definition.id,
      normalizedName: normalizeSkillIndexName(definition.name || definition.id),
      displayName: definition.name || definition.id,
      description: definition.description || '',
      group,
      tags: definition.tags ?? [],
      visibility: {
        runtimeVisible,
        promptVisible,
        userInvocable,
      },
      disableModelInvocation: (definition as any).disableModelInvocation ?? false,
      source: definition.source,
      version: definition.version,
      registeredAt: skill.registeredAt,
    };
  }

  // ===================== 2. 查询接口 =====================

  /**
   * 获取指定可见性的 Skill 列表
   *
   * @param options - 查询选项
   * @returns 匹配的 Skill 索引条目列表
   */
  getVisibleSkills(options: GetVisibleOptions = {}): SkillIndexEntry[] {
    const {
      visibility = 'runtimeVisible',
      agentId,
      groups,
      tags,
      sources,
      search,
    } = options;

    let results = Array.from(this.index.values());

    // 可见性过滤
    results = results.filter((entry) => entry.visibility[visibility]);

    // Agent 级别过滤
    if (agentId) {
      results = results.filter((entry) => this.passesAgentFilter(entry.skillId, agentId, entry));
    }

    // Group 过滤
    if (groups && groups.length > 0) {
      results = results.filter((entry) => groups.includes(entry.group));
    }

    // 标签过滤
    if (tags && tags.length > 0) {
      const tagSet = new Set(tags.map((t) => t.toLowerCase()));
      results = results.filter((entry) =>
        entry.tags.some((t) => tagSet.has(t.toLowerCase())),
      );
    }

    // 来源过滤
    if (sources && sources.length > 0) {
      results = results.filter((entry) => sources.includes(entry.source));
    }

    // 搜索过滤
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      results = results.filter((entry) =>
        entry.normalizedName.includes(searchLower) ||
        entry.displayName.toLowerCase().includes(searchLower) ||
        entry.description.toLowerCase().includes(searchLower) ||
        entry.tags.some((t) => t.toLowerCase().includes(searchLower)),
      );
    }

    return results;
  }

  /**
   * 获取用于注入 Prompt 的 Skill 列表
   *
   * @param agentId - Agent ID（可选，用于 Agent 级别过滤）
   * @returns Skill 索引条目列表（promptVisible）
   */
  getSkillsForPrompt(agentId?: string): SkillIndexEntry[] {
    return this.getVisibleSkills({
      visibility: 'promptVisible',
      agentId,
    });
  }

  /**
   * 根据名称查找 Skill（支持模糊匹配）
   *
   * @param name - Skill 名称（支持部分匹配）
   * @param options - 查询选项
   * @returns 匹配的 Skill 索引条目列表
   */
  findByName(name: string, options: GetVisibleOptions = {}): SkillIndexEntry[] {
    const normalized = normalizeSkillIndexName(name);

    // 精确匹配
    const exactMatch = this.nameIndex.get(normalized);
    if (exactMatch) {
      const results = exactMatch
        .map((id) => this.index.get(id))
        .filter((e): e is SkillIndexEntry => !!e);
      return this.filterByOptions(results, options);
    }

    // 模糊匹配（包含关系）
    const partialMatches: SkillIndexEntry[] = [];
    for (const entry of this.index.values()) {
      if (entry.normalizedName.includes(normalized) ||
          entry.displayName.toLowerCase().includes(name.toLowerCase())) {
        partialMatches.push(entry);
      }
    }

    return this.filterByOptions(partialMatches, options);
  }

  /**
   * 根据标签查找 Skill
   *
   * @param tag - 标签
   * @param options - 查询选项
   * @returns 匹配的 Skill 索引条目列表
   */
  findByTag(tag: string, options: GetVisibleOptions = {}): SkillIndexEntry[] {
    const tagLower = tag.toLowerCase();
    const skillIds = this.tagIndex.get(tagLower) ?? [];
    const entries = skillIds
      .map((id) => this.index.get(id))
      .filter((e): e is SkillIndexEntry => !!e);
    return this.filterByOptions(entries, options);
  }

  /**
   * 获取单个 Skill 索引条目
   *
   * @param skillId - Skill ID
   * @returns Skill 索引条目或 undefined
   */
  getSkillEntry(skillId: string): SkillIndexEntry | undefined {
    return this.index.get(skillId);
  }

  // ===================== 3. 使用统计与推荐 =====================

  /**
   * 记录 Skill 使用情况
   *
   * 更新使用频率、最近使用时间、平均耗时与成功率。
   * 采用滑动平均算法，避免存储完整历史记录。
   *
   * @param skillId - Skill ID
   * @param success - 是否执行成功
   * @param durationMs - 执行耗时（毫秒）
   */
  recordUsage(skillId: string, success: boolean, durationMs: number): void {
    const entry = this.index.get(skillId);
    if (!entry) return;
    entry.useFrequency = (entry.useFrequency ?? 0) + 1;
    entry.lastUsed = Date.now();
    // 滑动平均
    const prevAvg = entry.avgDurationMs ?? 0;
    const prevCount = entry.useFrequency - 1;
    entry.avgDurationMs = prevCount === 0 ? durationMs : (prevAvg * prevCount + durationMs) / entry.useFrequency;
    // 成功率
    const prevRate = entry.successRate ?? 1;
    entry.successRate = (prevRate * prevCount + (success ? 1 : 0)) / entry.useFrequency;
  }

  /**
   * 基于相关性评分推荐 Skill
   *
   * 综合考虑关键词匹配、使用频率、成功率与最近使用时间，
   * 返回按相关性排序的 Skill 列表。
   *
   * @param query - 查询文本
   * @param options - 推荐选项（agentId、limit）
   * @returns 带相关性评分的 Skill 索引条目列表
   */
  recommend(query: string, options?: { agentId?: string; limit?: number }): Array<SkillIndexEntry & { relevance: number }> {
    const limit = options?.limit ?? 10;
    const queryLower = query.toLowerCase().trim();
    const tokens = queryLower.split(/\s+/).filter(t => t.length >= 2);

    let candidates = Array.from(this.index.values());
    if (options?.agentId) {
      candidates = candidates.filter(e => this.passesAgentFilter(e.skillId, options.agentId!, e));
    }

    const scored = candidates.map(entry => {
      let relevance = 0;

      // 关键词匹配（权重 0.5）
      for (const token of tokens) {
        if (token.length >= 4) {
          if (entry.normalizedName.includes(token)) relevance += 0.25;
          if (entry.description.toLowerCase().includes(token)) relevance += 0.15;
          if (entry.tags.some(t => t.toLowerCase().includes(token))) relevance += 0.10;
        }
      }

      // 名称直接命中（权重 0.1）
      if (entry.normalizedName === queryLower.replace(/[\s\-_]+/g, '')) {
        relevance += 0.1;
      }

      // 使用频率归一化（权重 0.2）
      const maxFreq = Math.max(1, ...candidates.map(c => c.useFrequency ?? 0));
      relevance += (entry.useFrequency ?? 0) / maxFreq * 0.2;

      // 成功率（权重 0.15）
      relevance += (entry.successRate ?? 1) * 0.15;

      // 最近使用加成（权重 0.05）
      if (entry.lastUsed) {
        const ageDays = (Date.now() - entry.lastUsed) / (1000 * 60 * 60 * 24);
        relevance += Math.max(0, 1 - ageDays / 30) * 0.05;
      }

      return { ...entry, relevance };
    });

    return scored
      .filter(s => s.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  // ===================== 4. Agent 过滤 =====================

  /**
   * 设置 Agent 级别过滤规则
   *
   * @param agentId - Agent ID
   * @param filter - 过滤规则
   */
  setAgentFilter(agentId: string, filter: AgentSkillFilter): void {
    this.agentFilters[agentId] = filter;
    logger.debug(`[SkillDiscovery] Agent filter set for '${agentId}'`);
  }

  /**
   * 移除 Agent 过滤规则
   *
   * @param agentId - Agent ID
   */
  removeAgentFilter(agentId: string): void {
    delete this.agentFilters[agentId];
  }

  /**
   * 检查 Skill 是否通过 Agent 过滤
   */
  private passesAgentFilter(
    skillId: string,
    agentId: string,
    entry: SkillIndexEntry,
  ): boolean {
    const filter = this.agentFilters[agentId];
    if (!filter) return true;

    // deny 优先
    if (filter.deny && filter.deny.length > 0) {
      if (this.matchFilterPattern(filter.deny, skillId, entry.group)) {
        return false;
      }
    }

    // allow 列表
    if (filter.allow && filter.allow.length > 0) {
      if (!this.matchFilterPattern(filter.allow, skillId, entry.group)) {
        return false;
      }
    }

    // 标签过滤
    if (filter.tags && filter.tags.length > 0) {
      const tagSet = new Set(filter.tags.map((t) => t.toLowerCase()));
      if (!entry.tags.some((t) => tagSet.has(t.toLowerCase()))) {
        return false;
      }
    }

    return true;
  }

  /**
   * 匹配过滤模式（支持通配符）
   */
  private matchFilterPattern(patterns: string[], skillId: string, group: SkillPermissionGroup): boolean {
    for (const pattern of patterns) {
      if (pattern === '*') return true;
      if (pattern === skillId) return true;
      if (pattern === group) return true;
      if (pattern.endsWith(':*') && group === pattern.slice(0, -2)) {
        return true;
      }
    }
    return false;
  }

  // ===================== 5. 辅助方法 =====================

  /**
   * 根据选项过滤结果
   */
  private filterByOptions(
    entries: SkillIndexEntry[],
    options: GetVisibleOptions,
  ): SkillIndexEntry[] {
    const { visibility = 'runtimeVisible', agentId } = options;
    return entries.filter((entry) => {
      if (!entry.visibility[visibility]) return false;
      if (agentId && !this.passesAgentFilter(entry.skillId, agentId, entry)) return false;
      return true;
    });
  }

  /**
   * 获取索引统计信息
   */
  getStats(): {
    total: number;
    runtimeVisible: number;
    promptVisible: number;
    userInvocable: number;
    byGroup: Record<string, number>;
    bySource: Record<string, number>;
  } {
    const entries = Array.from(this.index.values());
    const byGroup: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const entry of entries) {
      byGroup[entry.group] = (byGroup[entry.group] || 0) + 1;
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;
    }

    return {
      total: entries.length,
      runtimeVisible: entries.filter((e) => e.visibility.runtimeVisible).length,
      promptVisible: entries.filter((e) => e.visibility.promptVisible).length,
      userInvocable: entries.filter((e) => e.visibility.userInvocable).length,
      byGroup,
      bySource,
    };
  }
}

// ===================== 工具函数 =====================

/**
 * 标准化 Skill 索引名称
 *
 * 规则：
 * - 转换为小写
 * - 移除空格、连字符、下划线
 * - 移除特殊字符
 *
 * @param name - 原始名称
 * @returns 标准化后的名称
 */
export function normalizeSkillIndexName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}
