/**
 * Agent 身份运行时定义
 *
 * 包含身份标识、前缀标记、确认反应、模拟人类延迟等运行时属性。
 * 支持从文本中解析身份标记，以及 5 个预定义 WMS Agent。
 */

export interface AgentIdentityConfig {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 角色类型 */
  role: string;
  /** 前缀标记，如 wms-expert */
  prefix: string;
  /** 是否发送确认反应 */
  ackReaction: boolean;
  /** 模拟人类延迟（毫秒） */
  humanDelayMs: number;
  /** 适用场景列表 */
  scenarios: string[];
}

/**
 * Agent 身份运行时类
 */
export class AgentIdentity implements AgentIdentityConfig {
  id: string;
  name: string;
  role: string;
  prefix: string;
  ackReaction: boolean;
  humanDelayMs: number;
  scenarios: string[];

  constructor(config: Partial<AgentIdentityConfig> & { id: string; name: string; role: string }) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.prefix = config.prefix ?? config.id;
    this.ackReaction = config.ackReaction ?? true;
    this.humanDelayMs = config.humanDelayMs ?? 0;
    this.scenarios = config.scenarios ?? [];
  }

  /**
   * 从文本中解析身份标记
   * @param input 输入文本，如 "[wms-expert] 请帮我查询库存"
   * @returns 解析出的 AgentIdentity，若未匹配则返回 general
   */
  static parseIdentity(input: string): AgentIdentity {
    const trimmed = input.trim();
    // 匹配 [prefix] 格式
    const bracketMatch = trimmed.match(/^\[([a-z0-9-]+)\]/i);
    if (bracketMatch) {
      const prefix = bracketMatch[1].toLowerCase();
      const predefined = PREDEFINED_AGENTS.find((a) => a.prefix === prefix || a.id === prefix);
      if (predefined) {
        return new AgentIdentity(predefined);
      }
    }
    // 匹配 prefix: 格式
    const colonMatch = trimmed.match(/^([a-z0-9-]+):\s*/i);
    if (colonMatch) {
      const prefix = colonMatch[1].toLowerCase();
      const predefined = PREDEFINED_AGENTS.find((a) => a.prefix === prefix || a.id === prefix);
      if (predefined) {
        return new AgentIdentity(predefined);
      }
    }
    // 默认返回 general
    const general = PREDEFINED_AGENTS.find((a) => a.id === 'general');
    return new AgentIdentity(general!);
  }

  /**
   * 输出身份字符串
   * @returns 如 "[wms-expert] WMS 专家 (expert)"
   */
  toString(): string {
    return `[${this.prefix}] ${this.name} (${this.role})`;
  }
}

// ============================================================================
// 预定义 Agent 配置
// ============================================================================

const PREDEFINED_AGENTS: AgentIdentityConfig[] = [
  {
    id: 'wms-expert',
    name: 'WMS 专家',
    role: 'expert',
    prefix: 'wms-expert',
    ackReaction: true,
    humanDelayMs: 200,
    scenarios: ['库存查询', '入库操作', '出库操作', '库间调拨'],
  },
  {
    id: 'wms-analyst',
    name: 'WMS 分析师',
    role: 'analyst',
    prefix: 'wms-analyst',
    ackReaction: true,
    humanDelayMs: 300,
    scenarios: ['报表生成', '趋势分析', '库存预测', '数据洞察'],
  },
  {
    id: 'wms-operator',
    name: 'WMS 操作员',
    role: 'operator',
    prefix: 'wms-operator',
    ackReaction: false,
    humanDelayMs: 100,
    scenarios: ['日常盘点', '补货作业', '库位整理', '订单拣选'],
  },
  {
    id: 'general',
    name: '通用助手',
    role: 'general',
    prefix: 'general',
    ackReaction: true,
    humanDelayMs: 150,
    scenarios: ['通用问答', '任务分发', '简单查询'],
  },
  {
    id: 'debugger',
    name: '调试专家',
    role: 'debugger',
    prefix: 'debugger',
    ackReaction: true,
    humanDelayMs: 250,
    scenarios: ['错误排查', '日志分析', '系统诊断', '修复验证'],
  },
];

// ============================================================================
// 运行时存储与辅助函数
// ============================================================================

const identityStore = new Map<string, AgentIdentity>();

/** 获取预定义 Agent */
export function getPredefinedAgent(id: string): AgentIdentity | undefined {
  const config = PREDEFINED_AGENTS.find((a) => a.id === id);
  return config ? new AgentIdentity(config) : undefined;
}

/** 列出所有预定义 Agent */
export function listPredefinedAgents(): AgentIdentity[] {
  return PREDEFINED_AGENTS.map((c) => new AgentIdentity(c));
}

/** 注册 Agent 身份到运行时 */
export function registerAgentIdentity(identity: AgentIdentity): void {
  identityStore.set(identity.id, identity);
}

/** 获取 Agent 身份（优先运行时存储，回退预定义） */
export function getAgentIdentity(id: string): AgentIdentity | undefined {
  return identityStore.get(id) ?? getPredefinedAgent(id);
}

/** 列出所有已注册的 Agent 身份 */
export function listAgentIdentities(): AgentIdentity[] {
  return Array.from(identityStore.values());
}

/** 清空运行时存储 */
export function clearAgentIdentities(): void {
  identityStore.clear();
}
