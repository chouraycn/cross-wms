/**
 * Tool Policy Engine — 通用工具调用策略引擎
 *
 * 覆盖所有工具（内置工具、MCP 工具、插件工具）的统一策略管控层。
 *
 * 与 skillSecurityGuard 的关系与分工：
 * - skillSecurityGuard：专注于 Skill 维度的三层安全校验
 *   （权限分组 → 沙箱拦截 → 参数安全），仅作用于 Skill 调用链。
 * - toolPolicyEngine：专注于 Tool 维度的策略管控
 *   （风险分级 → 审批控制 → 速率限制 → 参数黑白名单 → 超时控制），
 *   作用于所有工具调用（内置/MCP/插件），是更底层的通用策略层。
 *
 * 集成方式：
 *   toolExecutor / mcpClientManager 在执行工具前，
 *   先调用 toolPolicyEngine.evaluateTool() 进行策略评估，
 *   根据结果决定是否执行、是否需要用户审批、是否触发限流等。
 *
 * 使用方式：
 *   import toolPolicyEngine from './toolPolicyEngine.js';
 *   const result = toolPolicyEngine.evaluateTool(toolName, args, ctx);
 *   if (!result.allowed) { ... }
 */

// ===================== 类型定义 =====================

/** 工具风险等级 */
export type ToolRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/** 速率限制配置 */
export interface ToolRateLimit {
  /** 时间窗口内最大调用次数 */
  maxCalls: number;
  /** 时间窗口（毫秒） */
  windowMs: number;
}

/** 工具策略规则 */
export interface ToolPolicyRule {
  /** 工具名匹配模式，支持通配符 `*`（如 `file_*`、`mcp:*`、`*`） */
  toolPattern: string;
  /** 风险等级 */
  riskLevel: ToolRiskLevel;
  /** 是否需要用户审批 */
  requireApproval: boolean;
  /** 速率限制（可选） */
  rateLimit?: ToolRateLimit;
  /** 允许的参数白名单（为空表示不限制） */
  allowedParams?: string[];
  /** 禁止的参数黑名单 */
  deniedParams?: string[];
  /** 超时时间（毫秒，可选） */
  timeoutMs?: number;
  /** 规则描述（用于日志/展示） */
  description?: string;
}

/** 工具策略评估结果 */
export interface ToolPolicyEvaluationResult {
  /** 是否允许执行 */
  allowed: boolean;
  /** 风险等级 */
  riskLevel: ToolRiskLevel;
  /** 是否需要用户审批 */
  requireApproval: boolean;
  /** 拒绝/限制原因 */
  reason?: string;
  /** 被拒绝的参数名列表 */
  deniedParams?: string[];
  /** 匹配的规则（用于调试/审计） */
  matchedRule?: ToolPolicyRule;
  /** 超时时间（毫秒，从规则继承） */
  timeoutMs?: number;
}

/** 评估上下文 */
export interface ToolPolicyEvaluationContext {
  /** 调用来源：builtin / mcp / plugin */
  source?: 'builtin' | 'mcp' | 'plugin';
  /** 调用者 ID（如 skill id、agent id） */
  callerId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
}

// ===================== 默认内置规则 =====================

/**
 * 默认内置策略规则
 *
 * 按优先级从高到低排列（先匹配到的规则生效）：
 * 1. Critical：命令执行、文件删除等高风险操作
 * 2. High：文件写入、网络请求、桌面自动化
 * 3. Medium：文件读取、数据库查询
 * 4. Low：文件列表、系统信息
 * 5. Safe：只读无副作用工具
 */
const DEFAULT_RULES: ToolPolicyRule[] = [
  // ===== Critical 级（必须审批） =====
  {
    toolPattern: 'shell_exec',
    riskLevel: 'critical',
    requireApproval: true,
    rateLimit: { maxCalls: 10, windowMs: 60_000 },
    timeoutMs: 30_000,
    description: '终端命令执行，最高风险',
  },
  {
    toolPattern: 'desktop_*',
    riskLevel: 'high',
    requireApproval: true,
    rateLimit: { maxCalls: 30, windowMs: 60_000 },
    timeoutMs: 15_000,
    description: '桌面自动化操作（点击/输入/截图等）',
  },
  {
    toolPattern: 'browser_*',
    riskLevel: 'high',
    requireApproval: true,
    rateLimit: { maxCalls: 20, windowMs: 60_000 },
    timeoutMs: 60_000,
    description: '浏览器自动化操作',
  },

  // ===== High 级（需要审批） =====
  {
    toolPattern: 'file_writeFile',
    riskLevel: 'high',
    requireApproval: true,
    rateLimit: { maxCalls: 50, windowMs: 60_000 },
    timeoutMs: 10_000,
    description: '文件写入操作',
  },
  {
    toolPattern: 'web_api_call',
    riskLevel: 'high',
    requireApproval: true,
    rateLimit: { maxCalls: 30, windowMs: 60_000 },
    timeoutMs: 30_000,
    description: '外部 API 调用',
  },

  // ===== Medium 级（可选审批，默认放行） =====
  {
    toolPattern: 'file_readFile',
    riskLevel: 'medium',
    requireApproval: false,
    rateLimit: { maxCalls: 100, windowMs: 60_000 },
    timeoutMs: 10_000,
    description: '文件读取操作',
  },
  {
    toolPattern: 'db_query',
    riskLevel: 'medium',
    requireApproval: false,
    rateLimit: { maxCalls: 100, windowMs: 60_000 },
    timeoutMs: 15_000,
    description: '数据库查询',
  },
  {
    toolPattern: 'web_fetch',
    riskLevel: 'medium',
    requireApproval: false,
    rateLimit: { maxCalls: 30, windowMs: 60_000 },
    timeoutMs: 30_000,
    description: '网页抓取',
  },
  {
    toolPattern: 'web_search',
    riskLevel: 'medium',
    requireApproval: false,
    rateLimit: { maxCalls: 20, windowMs: 60_000 },
    timeoutMs: 15_000,
    description: '互联网搜索',
  },
  {
    toolPattern: 'wms_*',
    riskLevel: 'medium',
    requireApproval: false,
    rateLimit: { maxCalls: 60, windowMs: 60_000 },
    timeoutMs: 10_000,
    description: 'WMS 业务操作',
  },
  {
    toolPattern: 'webhook_*',
    riskLevel: 'medium',
    requireApproval: true,
    rateLimit: { maxCalls: 20, windowMs: 60_000 },
    timeoutMs: 15_000,
    description: 'Webhook 触发',
  },

  // ===== Low 级（直接放行） =====
  {
    toolPattern: 'file_listDir',
    riskLevel: 'low',
    requireApproval: false,
    rateLimit: { maxCalls: 200, windowMs: 60_000 },
    timeoutMs: 5_000,
    description: '目录列表',
  },
  {
    toolPattern: 'app_setBotName',
    riskLevel: 'low',
    requireApproval: false,
    rateLimit: { maxCalls: 10, windowMs: 60_000 },
    timeoutMs: 5_000,
    description: '修改助手名称',
  },

  // ===== Safe 级（无限制） =====
  {
    toolPattern: 'system_info',
    riskLevel: 'safe',
    requireApproval: false,
    description: '系统信息查询',
  },
  {
    toolPattern: 'desktop_health',
    riskLevel: 'safe',
    requireApproval: false,
    description: '桌面工具健康检查',
  },

  // ===== MCP / Plugin 默认规则（需审批，Medium 风险） =====
  {
    toolPattern: 'mcp:*',
    riskLevel: 'medium',
    requireApproval: true,
    rateLimit: { maxCalls: 30, windowMs: 60_000 },
    timeoutMs: 30_000,
    description: 'MCP 外部工具（默认需审批）',
  },
  {
    toolPattern: 'plugin_*',
    riskLevel: 'medium',
    requireApproval: true,
    rateLimit: { maxCalls: 30, windowMs: 60_000 },
    timeoutMs: 30_000,
    description: '插件工具（默认需审批）',
  },

  // ===== 兜底规则（未知工具默认 Medium + 需审批） =====
  {
    toolPattern: '*',
    riskLevel: 'medium',
    requireApproval: true,
    rateLimit: { maxCalls: 20, windowMs: 60_000 },
    timeoutMs: 15_000,
    description: '未知工具默认策略',
  },
];

// ===================== 速率限制记录 =====================

interface RateLimitRecord {
  timestamps: number[];
}

// ===================== ToolPolicyEngine 类 =====================

/**
 * 工具策略引擎
 *
 * 功能：
 * - 基于通配符模式匹配工具规则
 * - 风险分级
 * - 审批控制
 * - 速率限制
 * - 参数黑白名单
 * - 超时控制
 *
 * 单例模式，通过 default export 获取全局实例。
 */
export class ToolPolicyEngine {
  private rules: ToolPolicyRule[];
  private rateLimitMap: Map<string, RateLimitRecord>;

  constructor() {
    this.rules = [...DEFAULT_RULES];
    this.rateLimitMap = new Map();
  }

  // ===================== 规则管理 =====================

  /**
   * 加载规则集（替换现有规则）
   *
   * @param rules - 策略规则列表，按优先级从高到低排列
   */
  loadRules(rules: ToolPolicyRule[]): void {
    this.rules = [...rules];
    this.rateLimitMap.clear();
  }

  /**
   * 添加规则（插入到指定位置，默认追加到末尾）
   *
   * @param rule - 要添加的规则
   * @param index - 插入位置（默认追加到末尾）
   */
  addRule(rule: ToolPolicyRule, index?: number): void {
    if (index !== undefined && index >= 0 && index < this.rules.length) {
      this.rules.splice(index, 0, rule);
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * 获取当前所有规则
   */
  getRules(): ToolPolicyRule[] {
    return [...this.rules];
  }

  /**
   * 重置为默认规则
   */
  resetToDefault(): void {
    this.rules = [...DEFAULT_RULES];
    this.rateLimitMap.clear();
  }

  // ===================== 核心评估 =====================

  /**
   * 评估工具调用
   *
   * 按顺序匹配规则，第一条匹配的规则生效。
   * 评估内容：
   * 1. 规则匹配 → 确定风险等级和审批要求
   * 2. 速率限制 → 检查是否超限
   * 3. 参数校验 → 黑白名单检查
   *
   * @param toolName - 工具名称
   * @param toolArgs - 工具参数
   * @param context - 评估上下文
   * @returns 评估结果
   */
  evaluateTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
    context: ToolPolicyEvaluationContext = {},
  ): ToolPolicyEvaluationResult {
    const matchedRule = this.findMatchingRule(toolName);

    if (!matchedRule) {
      return {
        allowed: true,
        riskLevel: 'medium',
        requireApproval: true,
        reason: `未找到匹配规则，使用保守策略`,
      };
    }

    const rateLimitCheck = this.checkRateLimit(toolName);
    if (!rateLimitCheck.allowed) {
      return {
        allowed: false,
        riskLevel: matchedRule.riskLevel,
        requireApproval: matchedRule.requireApproval,
        reason: rateLimitCheck.reason,
        matchedRule,
        timeoutMs: matchedRule.timeoutMs,
      };
    }

    const paramCheck = this.checkParams(toolArgs, matchedRule);
    if (!paramCheck.allowed) {
      return {
        allowed: false,
        riskLevel: matchedRule.riskLevel,
        requireApproval: matchedRule.requireApproval,
        reason: paramCheck.reason,
        deniedParams: paramCheck.deniedParams,
        matchedRule,
        timeoutMs: matchedRule.timeoutMs,
      };
    }

    return {
      allowed: true,
      riskLevel: matchedRule.riskLevel,
      requireApproval: matchedRule.requireApproval,
      matchedRule,
      timeoutMs: matchedRule.timeoutMs,
    };
  }

  // ===================== 速率限制 =====================

  /**
   * 检查工具速率限制
   *
   * @param toolName - 工具名称
   * @returns 检查结果
   */
  checkRateLimit(toolName: string): { allowed: boolean; reason?: string } {
    const rule = this.findMatchingRule(toolName);
    if (!rule || !rule.rateLimit) {
      return { allowed: true };
    }

    const { maxCalls, windowMs } = rule.rateLimit;
    const now = Date.now();
    const record = this.rateLimitMap.get(toolName) ?? { timestamps: [] };

    const windowStart = now - windowMs;
    const recentCalls = record.timestamps.filter((t) => t > windowStart);

    if (recentCalls.length >= maxCalls) {
      return {
        allowed: false,
        reason: `工具 '${toolName}' 触发速率限制：${windowMs / 1000}s 内最多 ${maxCalls} 次调用（当前 ${recentCalls.length} 次）`,
      };
    }

    return { allowed: true };
  }

  /**
   * 记录工具调用（用于速率限制统计）
   *
   * @param toolName - 工具名称
   */
  recordCall(toolName: string): void {
    const now = Date.now();
    const record = this.rateLimitMap.get(toolName) ?? { timestamps: [] };
    record.timestamps.push(now);

    const rule = this.findMatchingRule(toolName);
    if (rule?.rateLimit) {
      const windowStart = now - rule.rateLimit.windowMs;
      record.timestamps = record.timestamps.filter((t) => t > windowStart);
    }

    this.rateLimitMap.set(toolName, record);
  }

  /**
   * 清除工具的速率限制记录
   *
   * @param toolName - 工具名称（不传则清除所有）
   */
  clearRateLimit(toolName?: string): void {
    if (toolName) {
      this.rateLimitMap.delete(toolName);
    } else {
      this.rateLimitMap.clear();
    }
  }

  // ===================== 风险等级 =====================

  /**
   * 获取工具的风险等级
   *
   * @param toolName - 工具名称
   * @returns 风险等级，未匹配时返回 'medium'
   */
  getToolRiskLevel(toolName: string): ToolRiskLevel {
    const rule = this.findMatchingRule(toolName);
    return rule?.riskLevel ?? 'medium';
  }

  // ===================== 内部方法 =====================

  /**
   * 查找匹配的规则（按顺序，第一条匹配生效）
   */
  private findMatchingRule(toolName: string): ToolPolicyRule | undefined {
    for (const rule of this.rules) {
      if (this.matchToolPattern(rule.toolPattern, toolName)) {
        return rule;
      }
    }
    return undefined;
  }

  /**
   * 通配符模式匹配
   *
   * 支持 `*` 通配符，匹配任意字符（0 个或多个）。
   * 支持 `mcp:*`、`file_*`、`*` 等模式。
   *
   * @param pattern - 模式字符串
   * @param toolName - 工具名称
   * @returns 是否匹配
   */
  private matchToolPattern(pattern: string, toolName: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern === toolName) {
      return true;
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }

    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return toolName.endsWith(suffix);
    }

    return false;
  }

  /**
   * 参数黑白名单校验
   */
  private checkParams(
    toolArgs: Record<string, unknown>,
    rule: ToolPolicyRule,
  ): { allowed: boolean; reason?: string; deniedParams?: string[] } {
    const paramNames = Object.keys(toolArgs);

    if (paramNames.length === 0) {
      return { allowed: true };
    }

    const denied: string[] = [];

    if (rule.deniedParams && rule.deniedParams.length > 0) {
      for (const param of paramNames) {
        if (rule.deniedParams.includes(param)) {
          denied.push(param);
        }
      }
    }

    if (rule.allowedParams && rule.allowedParams.length > 0) {
      for (const param of paramNames) {
        if (!rule.allowedParams.includes(param) && !denied.includes(param)) {
          denied.push(param);
        }
      }
    }

    if (denied.length > 0) {
      return {
        allowed: false,
        reason: `工具参数被策略拒绝：${denied.join(', ')}`,
        deniedParams: denied,
      };
    }

    return { allowed: true };
  }
}

// ===================== 单例导出 =====================

const toolPolicyEngine = new ToolPolicyEngine();

export default toolPolicyEngine;
