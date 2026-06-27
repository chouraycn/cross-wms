/**
 * AgentIdentity — 多 Agent 身份管理系统
 *
 * WMS 领域的多 Agent 身份系统核心模块：
 * - 管理 Agent 身份配置（ID、名称、角色、专业领域等）
 * - 管理 Agent 场景（预置场景与自定义场景的映射）
 * - 支持根据场景或用户意图智能匹配合适的 Agent
 * - 持久化支持（JSON 文件存储）
 *
 * @module engine/agentIdentity
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';

// ===================== 类型定义 =====================

/**
 * Agent 角色类型
 * - generalist: 通才型 Agent
 * - expert: 专家型 Agent
 * - assistant: 助手型 Agent
 */
export type AgentRoleType = 'generalist' | 'expert' | 'assistant';

/**
 * Agent 身份配置
 */
export interface AgentIdentityConfig {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 头像 emoji */
  emoji?: string;
  /** Agent 描述 */
  description?: string;
  /** 角色类型 */
  role: AgentRoleType;
  /** 专业领域（wms-inventory, wms-outbound, wms-report 等） */
  expertise?: string[];
  /** 自定义系统提示词 */
  systemPrompt?: string;
  /** 指定的模型 */
  modelId?: string;
  /** 允许使用的工具（空=全部） */
  tools?: string[];
  /** 最大并发任务数 */
  maxConcurrentTasks?: number;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * Agent 场景配置
 */
export interface AgentScenario {
  /** 场景 ID */
  id: string;
  /** 场景名称 */
  name: string;
  /** 场景描述 */
  description?: string;
  /** 图标 */
  icon?: string;
  /** 对应的 Agent ID */
  agentId: string;
  /** 标签 */
  tags?: string[];
  /** 优先级（数字越小越优先） */
  priority: number;
}

/**
 * 内置默认预置 Agent 配置
 */
interface BuiltinAgentEntry {
  agent: AgentIdentityConfig;
  scenarios: AgentScenario[];
}

// ===================== 常量 =====================

/** 身份数据存储根目录 */
const IDENTITY_DATA_ROOT = AppPaths.identityDir;

/** 身份配置文件名 */
const IDENTITY_FILE = 'agents.json';

/** 场景配置文件名 */
const SCENARIO_FILE = 'scenarios.json';

/** 内置默认预置 Agent（按优先级排序） */
const BUILTIN_AGENTS: BuiltinAgentEntry[] = [
  {
    agent: {
      id: 'wms-expert',
      name: 'WMS 专家',
      emoji: '📦',
      description: 'WMS 仓储管理系统专家，擅长库存管理、出入库操作、调拨业务',
      role: 'expert',
      expertise: ['wms-inventory', 'wms-inbound', 'wms-outbound', 'wms-transfer', 'wms-location'],
      systemPrompt: '你是一个专业的 WMS 仓储管理系统助手，专注于库存管理、出入库操作和调拨业务。请用专业的仓储管理知识帮助用户解决问题。',
      maxConcurrentTasks: 3,
      enabled: true,
    },
    scenarios: [
      {
        id: 'wms-expert-inventory',
        name: '库存查询',
        description: '查询库存数量、库位、批次等信息',
        icon: '🔍',
        agentId: 'wms-expert',
        tags: ['库存', '查询', '数量', '库位', '批次'],
        priority: 1,
      },
      {
        id: 'wms-expert-inbound',
        name: '入库操作',
        description: '处理采购入库、退货入库等业务',
        icon: '📥',
        agentId: 'wms-expert',
        tags: ['入库', '采购', '退货', '收货'],
        priority: 2,
      },
      {
        id: 'wms-expert-outbound',
        name: '出库操作',
        description: '处理销售出库、调拨出库等业务',
        icon: '📤',
        agentId: 'wms-expert',
        tags: ['出库', '销售', '调拨', '发货'],
        priority: 2,
      },
      {
        id: 'wms-expert-transfer',
        name: '库间调拨',
        description: '处理仓库间的库存调拨业务',
        icon: '🔄',
        agentId: 'wms-expert',
        tags: ['调拨', '转移', '跨仓'],
        priority: 3,
      },
    ],
  },
  {
    agent: {
      id: 'wms-analyst',
      name: '数据分析师',
      emoji: '📊',
      description: 'WMS 数据分析专家，擅长报表生成、趋势分析、库存预测',
      role: 'expert',
      expertise: ['wms-report', 'wms-analytics', 'wms-forecast'],
      systemPrompt: '你是一个专业的 WMS 数据分析师，专注于仓储数据的统计分析、报表生成和趋势预测。请用数据驱动的方式帮助用户做出决策。',
      maxConcurrentTasks: 2,
      enabled: true,
    },
    scenarios: [
      {
        id: 'wms-analyst-report',
        name: '报表分析',
        description: '生成库存报表、出入库统计等',
        icon: '📈',
        agentId: 'wms-analyst',
        tags: ['报表', '统计', '分析', '汇总'],
        priority: 1,
      },
      {
        id: 'wms-analyst-forecast',
        name: '库存预测',
        description: '基于历史数据预测库存趋势',
        icon: '🔮',
        agentId: 'wms-analyst',
        tags: ['预测', '趋势', 'forecast', '未来'],
        priority: 2,
      },
    ],
  },
  {
    agent: {
      id: 'wms-operator',
      name: '操作员',
      emoji: '🏷️',
      description: 'WMS 日常操作助手，擅长盘点、补货、库位整理',
      role: 'assistant',
      expertise: ['wms-stocktake', 'wms-replenishment', 'wms-location'],
      systemPrompt: '你是一个勤劳的 WMS 操作员助手，帮助处理盘点、补货、库位整理等日常仓储操作任务。',
      maxConcurrentTasks: 5,
      enabled: true,
    },
    scenarios: [
      {
        id: 'wms-operator-stocktake',
        name: '盘点任务',
        description: '协助进行库存盘点操作',
        icon: '📋',
        agentId: 'wms-operator',
        tags: ['盘点', '清点', '核查'],
        priority: 1,
      },
      {
        id: 'wms-operator-replenishment',
        name: '补货任务',
        description: '协助处理补货建议和补货操作',
        icon: '➕',
        agentId: 'wms-operator',
        tags: ['补货', ' replenishment', '补货建议'],
        priority: 2,
      },
    ],
  },
  {
    agent: {
      id: 'general',
      name: '通用助手',
      emoji: '🤖',
      description: '通用型助手，处理非专业领域的简单问题',
      role: 'generalist',
      systemPrompt: '你是一个友好的通用助手，可以回答各种简单问题。对于复杂的 WMS 专业问题，我会为你转接专业 Agent。',
      maxConcurrentTasks: 10,
      enabled: true,
    },
    scenarios: [
      {
        id: 'general-chat',
        name: '闲聊',
        description: '日常对话和简单问答',
        icon: '💬',
        agentId: 'general',
        tags: ['聊天', '问候', '帮助', '问题'],
        priority: 100,
      },
    ],
  },
  {
    agent: {
      id: 'debugger',
      name: '问题诊断',
      emoji: '🔧',
      description: 'WMS 问题诊断专家，擅长排查系统异常、数据问题',
      role: 'expert',
      expertise: ['wms-debug', 'wms-troubleshoot', 'wms-data-fix'],
      systemPrompt: '你是一个细心的 WMS 问题诊断专家，擅长发现和解决仓储管理系统中的异常情况、数据问题和操作错误。',
      maxConcurrentTasks: 2,
      enabled: true,
    },
    scenarios: [
      {
        id: 'debugger-issue',
        name: '问题诊断',
        description: '诊断和解决 WMS 系统问题',
        icon: '🔍',
        agentId: 'debugger',
        tags: ['问题', '错误', '异常', '诊断', '排查', '修复'],
        priority: 1,
      },
      {
        id: 'debugger-data',
        name: '数据修复',
        description: '修复数据不一致、库存差异等问题',
        icon: '🛠️',
        agentId: 'debugger',
        tags: ['数据', '修复', '差异', '对账'],
        priority: 2,
      },
    ],
  },
];

// ===================== AgentIdentityManager =====================

/**
 * Agent 身份管理器（单例模式）
 *
 * 管理 Agent 身份配置和场景的完整生命周期：
 * - 注册/注销 Agent 身份
 * - 管理 Agent 对应的场景
 * - 根据场景或用户意图匹配合适的 Agent
 * - 持久化存储（JSON 文件）
 */
class AgentIdentityManager {
  /** Agent ID -> AgentIdentityConfig */
  private agents: Map<string, AgentIdentityConfig> = new Map();

  /** 场景 ID -> AgentScenario */
  private scenarios: Map<string, AgentScenario> = new Map();

  /** Agent ID -> 所属场景列表 */
  private agentToScenarios: Map<string, string[]> = new Map();

  private initialized = false;

  constructor() {}

  // ===================== 初始化 =====================

  /**
   * 初始化身份管理器
   *
   * 加载流程：
   * 1. 注册内置预置 Agent 和场景
   * 2. 从磁盘加载自定义配置（覆盖同名内置项）
   */
  initialize(): void {
    if (this.initialized) return;

    // 1. 注册内置 Agent 和场景
    for (const entry of BUILTIN_AGENTS) {
      this.agents.set(entry.agent.id, entry.agent);
      const scenarioIds: string[] = [];
      for (const scenario of entry.scenarios) {
        this.scenarios.set(scenario.id, scenario);
        scenarioIds.push(scenario.id);
      }
      this.agentToScenarios.set(entry.agent.id, scenarioIds);
    }

    // 2. 从磁盘加载自定义配置
    this.loadFromDisk();

    this.initialized = true;
    logger.debug(`[AgentIdentity] 初始化完成，共 ${this.agents.size} 个 Agent，${this.scenarios.size} 个场景`);
  }

  // ===================== Agent 注册/注销 =====================

  /**
   * 注册新 Agent
   *
   * @param config Agent 身份配置
   * @returns 注册后的配置（包含默认值）
   * @throws 如果 Agent ID 已存在则抛出错误
   */
  registerAgent(config: AgentIdentityConfig): AgentIdentityConfig {
    if (this.agents.has(config.id)) {
      throw new Error(`Agent ${config.id} 已存在`);
    }

    const finalConfig: AgentIdentityConfig = {
      ...config,
      enabled: config.enabled ?? true,
      maxConcurrentTasks: config.maxConcurrentTasks ?? 3,
    };

    this.agents.set(config.id, finalConfig);
    this.agentToScenarios.set(config.id, []);
    this.persistToDisk();

    logger.debug(`[AgentIdentity] 注册 Agent: ${finalConfig.id} (${finalConfig.role})`);
    return finalConfig;
  }

  /**
   * 注销 Agent
   *
   * @param agentId Agent ID
   * @returns 是否注销成功
   */
  unregisterAgent(agentId: string): boolean {
    if (!this.agents.has(agentId)) {
      return false;
    }

    // 检查是否为内置 Agent（内置 Agent 不允许注销）
    const isBuiltin = BUILTIN_AGENTS.some(e => e.agent.id === agentId);
    if (isBuiltin) {
      logger.warn(`[AgentIdentity] 内置 Agent ${agentId} 不允许注销`);
      return false;
    }

    // 删除 Agent 及其关联的场景
    const scenarioIds = this.agentToScenarios.get(agentId) || [];
    for (const sid of scenarioIds) {
      this.scenarios.delete(sid);
    }
    this.agentToScenarios.delete(agentId);
    this.agents.delete(agentId);
    this.persistToDisk();

    logger.debug(`[AgentIdentity] 注销 Agent: ${agentId}`);
    return true;
  }

  // ===================== Agent 查询 =====================

  /**
   * 获取 Agent 配置
   *
   * @param agentId Agent ID
   * @returns Agent 配置，不存在则返回 undefined
   */
  getAgent(agentId: string): AgentIdentityConfig | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 列出所有 Agent
   *
   * @param includeDisabled 是否包含已禁用的 Agent，默认 false
   * @returns Agent 配置列表
   */
  listAgents(includeDisabled = false): AgentIdentityConfig[] {
    const all = Array.from(this.agents.values());
    return includeDisabled ? all : all.filter(a => a.enabled !== false);
  }

  /**
   * 更新 Agent 配置
   *
   * @param agentId Agent ID
   * @param config 更新的配置字段
   * @returns 更新后的配置，Agent 不存在则返回 undefined
   */
  updateAgent(agentId: string, config: Partial<AgentIdentityConfig>): AgentIdentityConfig | undefined {
    const existing = this.agents.get(agentId);
    if (!existing) return undefined;

    const updated: AgentIdentityConfig = {
      ...existing,
      ...config,
      id: agentId, // 禁止修改 ID
    };

    this.agents.set(agentId, updated);
    this.persistToDisk();

    logger.debug(`[AgentIdentity] 更新 Agent: ${agentId}`);
    return updated;
  }

  /**
   * 获取默认 Agent
   *
   * 返回优先级最高（priority 最小）且已启用的 Agent
   *
   * @returns 默认 Agent 配置
   */
  getDefaultAgent(): AgentIdentityConfig | undefined {
    // 遍历所有场景，找到优先级最高的
    let bestAgent: AgentIdentityConfig | undefined;
    let highestPriority = Infinity;

    for (const scenario of this.scenarios.values()) {
      if (scenario.priority < highestPriority) {
        const agent = this.agents.get(scenario.agentId);
        if (agent && agent.enabled !== false) {
          highestPriority = scenario.priority;
          bestAgent = agent;
        }
      }
    }

    return bestAgent;
  }

  // ===================== 场景管理 =====================

  /**
   * 获取场景配置
   *
   * @param scenarioId 场景 ID
   * @returns 场景配置
   */
  getScenario(scenarioId: string): AgentScenario | undefined {
    return this.scenarios.get(scenarioId);
  }

  /**
   * 列出所有场景
   *
   * @returns 场景配置列表
   */
  listScenarios(): AgentScenario[] {
    return Array.from(this.scenarios.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * 根据 Agent ID 获取其所有场景
   *
   * @param agentId Agent ID
   * @returns 场景列表
   */
  getScenariosForAgent(agentId: string): AgentScenario[] {
    const scenarioIds = this.agentToScenarios.get(agentId) || [];
    return scenarioIds
      .map(id => this.scenarios.get(id))
      .filter((s): s is AgentScenario => s !== undefined)
      .sort((a, b) => a.priority - b.priority);
  }

  // ===================== 智能匹配 =====================

  /**
   * 根据场景解析合适的 Agent
   *
   * @param scenarioId 场景 ID
   * @returns 匹配的 Agent 配置，未找到则返回 undefined
   */
  resolveAgentForScenario(scenarioId: string): AgentIdentityConfig | undefined {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) return undefined;

    const agent = this.agents.get(scenario.agentId);
    if (!agent || agent.enabled === false) return undefined;

    return agent;
  }

  /**
   * 根据用户意图智能匹配 Agent
   *
   * 匹配策略（满分 100）：
   * 1. 场景标签关键词匹配 (0-50): 用户消息命中场景 tags
   * 2. Agent 专业领域匹配 (0-30): 用户消息命中 agent expertise
   * 3. Agent 角色优先级 (0-20): expert > assistant > generalist
   *
   * @param userIntent 用户意图/消息
   * @returns 匹配的 Agent 配置
   */
  resolveAgentForIntent(userIntent: string): AgentIdentityConfig | undefined {
    const normalizedIntent = userIntent.toLowerCase().trim();
    let bestAgent: AgentIdentityConfig | undefined;
    let bestScore = -1;

    for (const agent of this.agents.values()) {
      if (agent.enabled === false) continue;

      let score = 0;

      // 1. 场景标签关键词匹配 (0-50)
      const agentScenarios = this.getScenariosForAgent(agent.id);
      for (const scenario of agentScenarios) {
        for (const tag of scenario.tags || []) {
          if (normalizedIntent.includes(tag.toLowerCase())) {
            score += 10;
          }
        }
      }

      // 2. Agent 专业领域匹配 (0-30)
      for (const expertise of agent.expertise || []) {
        if (normalizedIntent.includes(expertise.toLowerCase())) {
          score += 15;
        }
      }

      // 3. Agent 角色优先级 (0-20)
      const rolePriority: Record<AgentRoleType, number> = {
        expert: 20,
        assistant: 10,
        generalist: 5,
      };
      score += rolePriority[agent.role] || 0;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    // 如果没有匹配到任何 Agent，返回默认 Agent
    if (!bestAgent) {
      return this.getDefaultAgent();
    }

    return bestAgent;
  }

  // ===================== 持久化 =====================

  /**
   * 从磁盘加载自定义配置
   */
  private loadFromDisk(): void {
    try {
      // 加载自定义 Agent
      const agentsPath = path.join(IDENTITY_DATA_ROOT, IDENTITY_FILE);
      if (fs.existsSync(agentsPath)) {
        const raw = fs.readFileSync(agentsPath, 'utf-8');
        const customAgents: AgentIdentityConfig[] = JSON.parse(raw);
        for (const agent of customAgents) {
          if (this.agents.has(agent.id)) {
            // 合并配置：自定义配置覆盖内置配置
            const builtin = this.agents.get(agent.id)!;
            this.agents.set(agent.id, { ...builtin, ...agent });
          } else {
            this.agents.set(agent.id, agent);
          }
        }
      }

      // 加载自定义场景
      const scenariosPath = path.join(IDENTITY_DATA_ROOT, SCENARIO_FILE);
      if (fs.existsSync(scenariosPath)) {
        const raw = fs.readFileSync(scenariosPath, 'utf-8');
        const customScenarios: AgentScenario[] = JSON.parse(raw);
        for (const scenario of customScenarios) {
          if (this.scenarios.has(scenario.id)) {
            // 合并配置
            const builtin = this.scenarios.get(scenario.id)!;
            this.scenarios.set(scenario.id, { ...builtin, ...scenario });
          } else {
            this.scenarios.set(scenario.id, scenario);
          }
          // 更新 Agent -> 场景映射
          const existing = this.agentToScenarios.get(scenario.agentId) || [];
          if (!existing.includes(scenario.id)) {
            existing.push(scenario.id);
            this.agentToScenarios.set(scenario.agentId, existing);
          }
        }
      }
    } catch (err) {
      logger.error('[AgentIdentity] 从磁盘加载配置失败:', err);
    }
  }

  /**
   * 持久化配置到磁盘
   */
  private persistToDisk(): void {
    try {
      // 确保目录存在
      fs.mkdirSync(IDENTITY_DATA_ROOT, { recursive: true });

      // 分离内置和自定义配置
      const builtinIds = new Set(BUILTIN_AGENTS.map(e => e.agent.id));
      const customAgents = Array.from(this.agents.values()).filter(a => !builtinIds.has(a.id));
      const customScenarios = Array.from(this.scenarios.values()).filter(
        s => !BUILTIN_AGENTS.some(e => e.scenarios.some(bs => bs.id === s.id))
      );

      // 写入 Agent 配置
      if (customAgents.length > 0) {
        fs.writeFileSync(
          path.join(IDENTITY_DATA_ROOT, IDENTITY_FILE),
          JSON.stringify(customAgents, null, 2),
          'utf-8'
        );
      }

      // 写入场景配置
      if (customScenarios.length > 0) {
        fs.writeFileSync(
          path.join(IDENTITY_DATA_ROOT, SCENARIO_FILE),
          JSON.stringify(customScenarios, null, 2),
          'utf-8'
        );
      }
    } catch (err) {
      logger.error('[AgentIdentity] 持久化配置失败:', err);
    }
  }
}

// ===================== 单例导出 =====================

/** AgentIdentityManager 单例 */
export const agentIdentityManager = new AgentIdentityManager();
