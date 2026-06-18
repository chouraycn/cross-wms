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
  BUILTIN_AGENT_TEMPLATES,
} from '../../shared/types/agent.js';

// ===================== 常量 =====================

/** Agent 数据存储根目录 */
const AGENT_DATA_ROOT = path.join(process.env.HOME || '~', '.cdf-know-clow', 'agents');

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
    console.log(`[AgentRegistry] 初始化完成，共 ${this.agents.size} 个 Agent`);
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
    };

    // 持久化 SOUL/MEMORY
    this.saveAgentFile(agent.id, SOUL_FILE, agent.soul);
    this.saveAgentFile(agent.id, MEMORY_FILE, agent.memory);

    this.agents.set(agent.id, agent);
    console.log(`[AgentRegistry] 注册 Agent: ${agent.id} (${agent.role})`);
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
      console.warn(`[AgentRegistry] 内置 Agent ${agentId} 不允许注销`);
      return false;
    }

    // Agent 正忙时不允许注销
    if (agent.status === 'busy') {
      console.warn(`[AgentRegistry] Agent ${agentId} 正忙，不允许注销`);
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

    console.log(`[AgentRegistry] 注销 Agent: ${agentId}`);
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
   * 匹配策略：
   * 1. 遍历所有非 orchestrator Agent 的 capabilities
   * 2. 检查 taskKeywords 是否匹配任务描述
   * 3. 检查 allowedTools / deniedTools 是否覆盖所需工具
   * 4. 优先返回空闲 Agent
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

      // 关键词匹配
      for (const cap of agent.capabilities) {
        for (const kw of cap.taskKeywords) {
          if (taskDescription.includes(kw)) {
            score += 10;
          }
        }
      }

      // 工具覆盖度
      if (requiredTools.length > 0) {
        const coveredCount = requiredTools.filter(t => {
          if (agent.deniedTools.some(d => this.matchToolPattern(t, d))) return false;
          if (agent.allowedTools.length === 0) return true; // 空=全部允许
          return agent.allowedTools.some(a => this.matchToolPattern(t, a));
        }).length;
        score += (coveredCount / requiredTools.length) * 20;
      }

      // 空闲加分
      if (agent.status === 'idle') score += 5;

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

  // ===================== 私有方法 =====================

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
      console.error(`[AgentRegistry] 保存 ${agentId}/${fileName} 失败:`, err);
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
          };

          // 加载 SOUL/MEMORY
          const soul = this.loadAgentFile(dir.name, SOUL_FILE);
          const memory = this.loadAgentFile(dir.name, MEMORY_FILE);
          if (soul) profile.soul = soul;
          if (memory) profile.memory = memory;

          this.agents.set(profile.id, profile);
          console.log(`[AgentRegistry] 加载自定义 Agent: ${profile.id} (${profile.role})`);
        } catch (err) {
          console.error(`[AgentRegistry] 加载自定义 Agent ${dir.name} 失败:`, err);
        }
      }
    } catch (err) {
      console.error('[AgentRegistry] 扫描自定义 Agent 失败:', err);
    }
  }
}

// ===================== 单例导出 =====================

export const agentRegistry = new AgentRegistry();
export type { AgentProfile, AgentRole, AgentCapability };
