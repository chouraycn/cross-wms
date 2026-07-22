/**
 * Agent 级技能白名单系统
 *
 * 参考 OpenClaw 的 agents.list[].skills 配置：
 * - agents.defaults.skills 作为默认基线
 * - agents.list[].skills 覆盖默认（不合并）
 * - skills: [] 表示无技能
 * - 省略 skills 则继承 defaults
 */

import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger("agent-allowlist");

// ============================================================================
// 类型定义
// ============================================================================

/** Agent 配置 */
export interface AgentConfig {
  /** Agent 唯一标识 */
  id: string;
  /** Agent 名称 */
  name?: string;
  /** 该 Agent 可见的技能白名单（覆盖默认） */
  skills?: string[];
  /** Agent 描述 */
  description?: string;
  /** 是否为默认 Agent */
  isDefault?: boolean;
}

/** Agents 配置根 */
export interface AgentsConfig {
  /** 默认技能基线 */
  defaults?: {
    skills?: string[];
  };
  /** Agent 列表 */
  list?: AgentConfig[];
}

/** 白名单过滤结果 */
export interface AllowlistFilterResult {
  /** 过滤后的技能名称列表 */
  allowed: string[];
  /** 被拒绝的技能名称及原因 */
  rejected: Array<{ skill: string; reason: string }>;
  /** 使用的白名单来源 */
  source: "explicit" | "inherited" | "unrestricted";
  /** Agent ID */
  agentId: string;
}

// ============================================================================
// Agent 白名单管理器
// ============================================================================

/** Agent 白名单管理器 */
export class AgentAllowlistManager {
  private config: AgentsConfig;
  private agentSkillCache: Map<string, Set<string>> = new Map();

  constructor(config?: AgentsConfig) {
    this.config = config || { defaults: {}, list: [] };
  }

  /** 更新配置 */
  updateConfig(config: AgentsConfig): void {
    this.config = config;
    this.agentSkillCache.clear();
    logger.debug("[AgentAllowlist] Config updated, cache cleared");
  }

  /** 获取默认技能白名单 */
  getDefaultSkills(): string[] {
    return this.config.defaults?.skills || [];
  }

  /** 获取所有 Agent 配置 */
  getAgents(): AgentConfig[] {
    return this.config.list || [];
  }

  /** 获取指定 Agent 的配置 */
  getAgentConfig(agentId: string): AgentConfig | undefined {
    return this.config.list?.find((a) => a.id === agentId);
  }

  /** 获取 Agent 的有效技能白名单 */
  getEffectiveAllowlist(agentId: string): {
    skills: string[];
    source: "explicit" | "inherited" | "unrestricted";
  } {
    const agent = this.getAgentConfig(agentId);

    // 检查缓存
    const cacheKey = `${agentId}:${JSON.stringify(agent?.skills)}:${JSON.stringify(this.config.defaults?.skills)}`;
    if (this.agentSkillCache.has(cacheKey)) {
      const cached = this.agentSkillCache.get(cacheKey)!;
      return {
        skills: Array.from(cached),
        source: agent?.skills !== undefined ? "explicit" : this.config.defaults?.skills ? "inherited" : "unrestricted",
      };
    }

    // 计算有效白名单
    let effectiveSkills: string[];
    let source: "explicit" | "inherited" | "unrestricted";

    if (agent?.skills !== undefined) {
      // Agent 明确指定了技能列表（覆盖默认）
      effectiveSkills = agent.skills;
      source = "explicit";
    } else if (this.config.defaults?.skills) {
      // 继承默认技能列表
      effectiveSkills = this.config.defaults.skills;
      source = "inherited";
    } else {
      // 无限制
      effectiveSkills = [];
      source = "unrestricted";
    }

    // 缓存结果
    this.agentSkillCache.set(cacheKey, new Set(effectiveSkills));

    return { skills: effectiveSkills, source };
  }

  /** 检查技能是否对 Agent 可见 */
  isSkillVisible(skillName: string, agentId: string): boolean {
    const { skills, source } = this.getEffectiveAllowlist(agentId);

    // 无限制时所有技能可见
    if (source === "unrestricted") {
      return true;
    }

    return skills.includes(skillName);
  }

  /** 过滤技能列表 */
  filterSkills(skillNames: string[], agentId: string): AllowlistFilterResult {
    const { skills, source } = this.getEffectiveAllowlist(agentId);
    const allowed: string[] = [];
    const rejected: Array<{ skill: string; reason: string }> = [];

    for (const skill of skillNames) {
      if (source === "unrestricted" || skills.includes(skill)) {
        allowed.push(skill);
      } else {
        rejected.push({
          skill,
          reason: `Skill "${skill}" is not in agent "${agentId}" allowlist`,
        });
      }
    }

    return {
      allowed,
      rejected,
      source,
      agentId,
    };
  }

  /** 检查 Agent 是否有任何技能限制 */
  isRestricted(agentId: string): boolean {
    const { source } = this.getEffectiveAllowlist(agentId);
    return source !== "unrestricted";
  }

  /** 添加技能到 Agent 白名单 */
  addSkillToAgent(agentId: string, skillName: string): boolean {
    const agent = this.getAgentConfig(agentId);
    if (!agent) {
      logger.warn(`[AgentAllowlist] Agent "${agentId}" not found`);
      return false;
    }

    if (!agent.skills) {
      agent.skills = this.config.defaults?.skills ? [...this.config.defaults.skills] : [];
    }

    if (!agent.skills.includes(skillName)) {
      agent.skills.push(skillName);
      this.agentSkillCache.clear();
      logger.info(`[AgentAllowlist] Added skill "${skillName}" to agent "${agentId}"`);
    }

    return true;
  }

  /** 从 Agent 白名单移除技能 */
  removeSkillFromAgent(agentId: string, skillName: string): boolean {
    const agent = this.getAgentConfig(agentId);
    if (!agent || !agent.skills) {
      return false;
    }

    const index = agent.skills.indexOf(skillName);
    if (index >= 0) {
      agent.skills.splice(index, 1);
      this.agentSkillCache.clear();
      logger.info(`[AgentAllowlist] Removed skill "${skillName}" from agent "${agentId}"`);
      return true;
    }

    return false;
  }

  /** 清空 Agent 的技能白名单（使其无技能） */
  clearAgentSkills(agentId: string): boolean {
    const agent = this.getAgentConfig(agentId);
    if (!agent) {
      return false;
    }

    agent.skills = [];
    this.agentSkillCache.clear();
    logger.info(`[AgentAllowlist] Cleared all skills from agent "${agentId}"`);
    return true;
  }

  /** 使 Agent 继承默认技能（移除显式配置） */
  resetAgentSkills(agentId: string): boolean {
    const agent = this.getAgentConfig(agentId);
    if (!agent) {
      return false;
    }

    delete agent.skills;
    this.agentSkillCache.clear();
    logger.info(`[AgentAllowlist] Reset skills for agent "${agentId}" to inherit defaults`);
    return true;
  }

  /** 导出配置 */
  exportConfig(): AgentsConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /** 从 JSON 文件加载配置 */
  static fromJSON(json: unknown): AgentAllowlistManager {
    const config = json as AgentsConfig;
    return new AgentAllowlistManager(config);
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalManager: AgentAllowlistManager | null = null;

/** 获取全局 Agent 白名单管理器 */
export function getAgentAllowlistManager(): AgentAllowlistManager {
  if (!globalManager) {
    globalManager = new AgentAllowlistManager();
  }
  return globalManager;
}

/** 初始化全局 Agent 白名单管理器 */
export function initAgentAllowlistManager(config: AgentsConfig): AgentAllowlistManager {
  globalManager = new AgentAllowlistManager(config);
  return globalManager;
}

/** 重置全局管理器 */
export function resetAgentAllowlistManager(): void {
  globalManager = null;
}