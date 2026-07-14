/**
 * AgentRegistry — Agent 注册中心
 *
 * v8.0: 多 Agent 架构核心组件
 * - 管理 Agent 的注册、查找、生命周期
 * - 加载每个 Agent 的 SOUL.md / MEMORY.md
 * - 内置 Orchestrator + Researcher + Coder + Analyst 模板
 * - 支持运行时动态注册自定义 Agent
 */

import path from 'path';
import fs from 'fs';
import {
  type AgentProfile,
  type AgentRole,
  type AgentCapability,
  type AgentExecutionRecord,
  BUILTIN_AGENT_TEMPLATES,
} from '../../shared/types/agent.js';
import { logger } from '../logger.js';
import { v4 as uuidv4 } from 'uuid';
import { AppPaths } from '../config/appPaths.js';

// ===================== 类型 =====================

/**
 * v9.1: 运行时子代理实例（由 AgentOrchestrator.spawnSubAgent 创建）
 * 与 AgentProfile（静态定义）分离，用于父代理追踪子代理的生命周期。
 */
export interface RuntimeInstance {
  instanceId: string;
  agentId: string;
  agentRole: string;
  parentInstanceId?: string;
  taskDescription: string;
  status: 'spawning' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  startedAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
  /** 累计 token 消耗（由执行器回填） */
  tokensUsed?: number;
}

// ===================== 常量 =====================

/** Agent 数据存储根目录 */
const AGENT_DATA_ROOT = path.join(AppPaths.rootDir, 'agents');

/** SOUL.md 文件名 */
const SOUL_FILE = 'SOUL.md';

/** MEMORY.md 文件名 */
const MEMORY_FILE = 'MEMORY.md';

// ===================== AgentRegistry =====================

/**
 * Agent 注册中心（单例模式）
 *
 * 管理 Agent 实例的完整生命周期：
 * - 注册 / 注销 Agent
 * - 按 ID / 角色 / 能力查找
 * - SOUL.md / MEMORY.md 持久化读写
 * - 运行时状态追踪
 */
class AgentRegistry {
  private agents: Map<string, AgentProfile> = new Map();
  /** v9.1: 运行时子代理实例表（父子关系、状态、token 累计） */
  private instances: Map<string, RuntimeInstance> = new Map();
  private initialized = false;

  constructor() {}

  // ===================== 初始化 =====================

  /**
   * 初始化注册中心：加载内置模板 + 持久化数据
   */
  initialize(): void {
    if (this.initialized) return;

    // 1. 注册内置 Agent 模板
    for (const template of BUILTIN_AGENT_TEMPLATES) {
      const now = new Date().toISOString();
      const profile: AgentProfile = {
        ...template,
        status: 'idle',
        createdAt: now,
        lastActiveAt: now,
        recentExecutions: [],
        successCount: 0,
        failureCount: 0,
      };

      // 尝试从磁盘加载自定义 SOUL/MEMORY
      const savedSoul = this.loadAgentFile(template.id, SOUL_FILE);
      const savedMemory = this.loadAgentFile(template.id, MEMORY_FILE);
      if (savedSoul) profile.soul = savedSoul;
      if (savedMemory) profile.memory = savedMemory;

      this.agents.set(template.id, profile);
    }

    // 2. 加载自定义 Agent（从磁盘）
    this.loadCustomAgents();

    this.initialized = true;
    logger.debug(`[AgentRegistry] 初始化完成，共 ${this.agents.size} 个 Agent`);
  }

  // ===================== 注册 / 注销 =====================

  /**
   * 注册新 Agent
   */
  register(profile: Omit<AgentProfile, 'status' | 'createdAt' | 'lastActiveAt'>): AgentProfile {
    if (this.agents.has(profile.id)) {
      throw new Error(`Agent ${profile.id} 已存在`);
    }

    const now = new Date().toISOString();
    const agent: AgentProfile = {
      ...profile,
      status: 'idle',
      createdAt: now,
      lastActiveAt: now,
      recentExecutions: [],
      successCount: 0,
      failureCount: 0,
    };

    // 持久化 SOUL/MEMORY
    this.saveAgentFile(agent.id, SOUL_FILE, agent.soul);
    this.saveAgentFile(agent.id, MEMORY_FILE, agent.memory);

    this.agents.set(agent.id, agent);
    logger.debug(`[AgentRegistry] 注册 Agent: ${agent.id} (${agent.role})`);
    return agent;
  }

  /**
   * 注销 Agent（内置 Agent 不允许注销）
   */
  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // 内置 Agent 不允许注销
    if (BUILTIN_AGENT_TEMPLATES.some(t => t.id === agentId)) {
      logger.warn(`[AgentRegistry] 内置 Agent ${agentId} 不允许注销`);
      return false;
    }

    // Agent 正忙时不允许注销
    if (agent.status === 'busy') {
      logger.warn(`[AgentRegistry] Agent ${agentId} 正忙，不允许注销`);
      return false;
    }

    this.agents.delete(agentId);

    // 清理持久化文件
    const agentDir = path.join(AGENT_DATA_ROOT, agentId);
    try {
      fs.rmSync(agentDir, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }

    logger.debug(`[AgentRegistry] 注销 Agent: ${agentId}`);
    return true;
  }

  // ===================== 查找 =====================

  /**
   * 按 ID 获取 Agent
   */
  get(agentId: string): AgentProfile | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有 Agent
   */
  getAll(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  /**
   * 按角色查找 Agent
   */
  getByRole(role: AgentRole): AgentProfile[] {
    return this.getAll().filter(a => a.role === role);
  }

  /**
   * 按能力查找 Agent
   */
  getByCapability(capabilityName: string): AgentProfile[] {
    return this.getAll().filter(a =>
      a.capabilities.some(c => c.name === capabilityName || c.taskKeywords.some(kw => capabilityName.includes(kw))),
    );
  }

  /**
   * 为任务匹配合适的 Agent
   *
   * 增强评分策略（满分 100）：
   * 1. 关键词匹配 (0-30): 任务描述命中 Agent capability 中的 taskKeywords
   * 2. 工具覆盖度 (0-20): Agent 可用工具覆盖任务所需工具的比例
   * 3. 历史成功率 (0-25): Agent 历史执行成功次数 / 总执行次数
   * 4. 空闲加分 (0-5): 空闲状态的 Agent 额外加分
   * 5. 角色匹配加分 (0-20): Agent 角色与任务类型的语义亲和度
   */
  findBestAgent(taskDescription: string, requiredTools: string[] = []): AgentProfile | null {
    let bestMatch: AgentProfile | null = null;
    let bestScore = -1;

    for (const agent of this.agents.values()) {
      // 跳过 orchestrator（它不执行子任务）
      if (agent.role === 'orchestrator') continue;
      // 跳过不可用 Agent
      if (agent.status === 'error' || agent.status === 'terminated') continue;

      let score = 0;

      // 1. 关键词匹配 (0-30)
      for (const cap of agent.capabilities) {
        for (const kw of cap.taskKeywords) {
          if (taskDescription.includes(kw)) {
            score += 10;
          }
        }
      }

      // 2. 工具覆盖度 (0-20)
      if (requiredTools.length > 0) {
        const coveredCount = requiredTools.filter(t => {
          if (agent.deniedTools.some(d => this.matchToolPattern(t, d))) return false;
          if (agent.allowedTools.length === 0) return true; // 空=全部允许
          return agent.allowedTools.some(a => this.matchToolPattern(t, a));
        }).length;
        score += (coveredCount / requiredTools.length) * 20;
      }

      // 3. 历史成功率 (0-25)
      const total = agent.successCount + agent.failureCount;
      if (total > 0) {
        score += (agent.successCount / total) * 25;
      }

      // 4. 空闲加分 (0-5)
      if (agent.status === 'idle') score += 5;

      // 5. 角色匹配加分 (0-20)
      const roleTaskAffinity = this.getRoleTaskAffinity(agent.role, taskDescription);
      score += roleTaskAffinity * 20;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    return bestMatch;
  }

  // ===================== 状态管理 =====================

  /**
   * 更新 Agent 状态
   */
  updateStatus(agentId: string, status: AgentProfile['status']): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = status;
    agent.lastActiveAt = new Date().toISOString();
    return true;
  }

  /**
   * 更新 Agent 的 MEMORY.md
   */
  updateMemory(agentId: string, memory: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.memory = memory;
    agent.lastActiveAt = new Date().toISOString();
    this.saveAgentFile(agentId, MEMORY_FILE, memory);
    return true;
  }

  /**
   * 追加 Agent 记忆（不覆盖，追加到末尾）
   */
  appendMemory(agentId: string, content: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    const separator = agent.memory ? '\n\n' : '';
    agent.memory = agent.memory + separator + content;
    agent.lastActiveAt = new Date().toISOString();
    this.saveAgentFile(agentId, MEMORY_FILE, agent.memory);
    return true;
  }

  // ===================== 工具过滤 =====================

  /**
   * 获取 Agent 可用的工具定义
   * 根据 allowedTools / deniedTools 过滤
   */
  filterToolsForAgent(
    agentId: string,
    allTools: Array<{ function: { name: string } }>,
  ): Array<{ function: { name: string } }> {
    const agent = this.agents.get(agentId);
    if (!agent) return allTools;

    return allTools.filter(tool => {
      const name = tool.function.name;
      // 黑名单优先
      if (agent.deniedTools.some(d => this.matchToolPattern(name, d))) return false;
      // 白名单为空=全部允许
      if (agent.allowedTools.length === 0) return true;
      return agent.allowedTools.some(a => this.matchToolPattern(name, a));
    });
  }

  // ===================== 执行记录 =====================

  /**
   * 记录 Agent 执行结果
   *
   * 更新 Agent 的成功/失败计数，并将执行记录追加到 recentExecutions（最多保留 50 条）。
   */
  recordExecution(agentId: string, record: Omit<AgentExecutionRecord, 'id' | 'timestamp'>): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const executionRecord: AgentExecutionRecord = {
      ...record,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    // 更新计数
    if (record.status === 'success') agent.successCount++;
    else agent.failureCount++;

    // 保留最近 50 条
    agent.recentExecutions.push(executionRecord);
    if (agent.recentExecutions.length > 50) {
      agent.recentExecutions = agent.recentExecutions.slice(-50);
    }

    agent.lastActiveAt = new Date().toISOString();
  }

  // ===================== 运行时实例管理（v9.1） =====================

  /**
   * v9.1: 注册一个运行时子代理实例（由 spawnSubAgent 调用）
   */
  registerInstance(instance: RuntimeInstance): void {
    this.instances.set(instance.instanceId, instance);
    logger.debug(`[AgentRegistry] 注册子代理实例 ${instance.instanceId} (agent=${instance.agentId})`);
  }

  /**
   * v9.1: 更新运行时实例状态/结果
   */
  updateInstance(instanceId: string, patch: Partial<RuntimeInstance>): void {
    const inst = this.instances.get(instanceId);
    if (!inst) return;
    Object.assign(inst, patch);
    this.instances.set(instanceId, inst);
  }

  /**
   * v9.1: 查询单个运行时实例
   */
  getInstance(instanceId: string): RuntimeInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * v9.1: 列出运行时实例（可按父实例 / 状态过滤）
   */
  listInstances(options?: { parentInstanceId?: string; status?: RuntimeInstance['status'] }): RuntimeInstance[] {
    let list = Array.from(this.instances.values());
    if (options?.parentInstanceId) {
      list = list.filter(i => i.parentInstanceId === options.parentInstanceId);
    }
    if (options?.status) {
      list = list.filter(i => i.status === options.status);
    }
    return list.sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * v9.1: 取消运行时实例（标记 cancelled，实际中断由调用方 AbortSignal 负责）
   */
  cancelInstance(instanceId: string): boolean {
    const inst = this.instances.get(instanceId);
    if (!inst) return false;
    if (inst.status === 'completed' || inst.status === 'failed' || inst.status === 'cancelled') {
      return false;
    }
    inst.status = 'cancelled';
    inst.completedAt = Date.now();
    this.instances.set(instanceId, inst);
    return true;
  }

  // ===================== 私有方法 =====================

  /**
   * 角色与任务类型的亲和度（0-1）
   *
   * 根据角色定义的任务关键词，计算任务描述与角色的语义匹配度。
   * 匹配 3 个关键词即满分。
   */
  private getRoleTaskAffinity(role: AgentRole, taskDescription: string): number {
    const affinities: Record<AgentRole, string[]> = {
      researcher: ['搜索', '查询', '分析', '研究', '调研', '查找', '对比', '了解', '调查'],
      coder: ['编写', '修改', '创建', '实现', '开发', '代码', '脚本', '配置', '部署'],
      analyst: ['统计', '报表', '汇总', '趋势', '数据', '计算', '图表', '指标'],
      planner: ['计划', '规划', '安排', '制定', '方案', '策略'],
      reviewer: ['检查', '审查', '审计', '验证', '测试'],
      orchestrator: [],
      custom: [],
    };

    const keywords = affinities[role] || [];
    if (keywords.length === 0) return 0;

    const matchCount = keywords.filter(kw => taskDescription.includes(kw)).length;
    return Math.min(matchCount / 3, 1); // 匹配 3 个关键词即满分
  }

  /**
   * 工具名模式匹配（支持 * 通配符）
   */
  private matchToolPattern(toolName: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === toolName) return true;

    // 将 glob * 转为正则
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      return new RegExp(`^${regexStr}$`).test(toolName);
    } catch {
      return false;
    }
  }

  /**
   * 加载 Agent 文件（SOUL.md / MEMORY.md）
   */
  private loadAgentFile(agentId: string, fileName: string): string | null {
    const filePath = path.join(AGENT_DATA_ROOT, agentId, fileName);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch {
      // 读取失败，返回 null
    }
    return null;
  }

  /**
   * 保存 Agent 文件
   */
  private saveAgentFile(agentId: string, fileName: string, content: string): void {
    const dir = path.join(AGENT_DATA_ROOT, agentId);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileName), content, 'utf-8');
    } catch (err) {
      logger.error(`[AgentRegistry] 保存 ${agentId}/${fileName} 失败:`, err);
    }
  }

  /**
   * 加载自定义 Agent（从 AGENT_DATA_ROOT 目录扫描）
   */
  private loadCustomAgents(): void {
    try {
      if (!fs.existsSync(AGENT_DATA_ROOT)) return;

      const dirs = fs.readdirSync(AGENT_DATA_ROOT, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        // 跳过内置 Agent
        if (BUILTIN_AGENT_TEMPLATES.some(t => t.id === dir.name)) continue;

        const configPath = path.join(AGENT_DATA_ROOT, dir.name, 'agent.json');
        if (!fs.existsSync(configPath)) continue;

        try {
          const configRaw = fs.readFileSync(configPath, 'utf-8');
          const config = JSON.parse(configRaw) as Omit<AgentProfile, 'status' | 'createdAt' | 'lastActiveAt'>;

          const now = new Date().toISOString();
          const profile: AgentProfile = {
            ...config,
            status: 'idle',
            createdAt: now,
            lastActiveAt: now,
            recentExecutions: [],
            successCount: 0,
            failureCount: 0,
          };

          // 加载 SOUL/MEMORY
          const soul = this.loadAgentFile(dir.name, SOUL_FILE);
          const memory = this.loadAgentFile(dir.name, MEMORY_FILE);
          if (soul) profile.soul = soul;
          if (memory) profile.memory = memory;

          this.agents.set(profile.id, profile);
          logger.debug(`[AgentRegistry] 加载自定义 Agent: ${profile.id} (${profile.role})`);
        } catch (err) {
          logger.error(`[AgentRegistry] 加载自定义 Agent ${dir.name} 失败:`, err);
        }
      }
    } catch (err) {
      logger.error('[AgentRegistry] 扫描自定义 Agent 失败:', err);
    }
  }
}

// ===================== 单例导出 =====================

export const agentRegistry = new AgentRegistry();
export type { AgentProfile, AgentRole, AgentCapability };
