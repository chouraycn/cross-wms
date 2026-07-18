/**
 * Approval Policy — 审批策略引擎
 *
 * 与 approvalManager 配合使用，提供配置化的审批规则。
 *
 * 功能：
 * - 添加/移除/查询策略规则
 * - 评估上下文，产出 allow/deny/require_approval 决策
 * - 支持多种条件操作符（toolName exact/prefix/regex、sessionId exact、
 *   requester in、timeRange、riskLevel >=）
 *
 * 使用方式：
 *   const policy = new ApprovalPolicy();
 *   policy.addRule({ id: 'r1', name: '禁止删除', conditions: [...], action: 'deny' });
 *   const decision = policy.evaluate({ toolName: 'rm', toolArgs: {}, sessionId: 's1', requester: 'u1' });
 *   if (decision.action === 'deny') { ... }
 */

import { ApprovalRiskLevel } from '../approvalManager.js';

// ===================== 类型定义 =====================

/** 策略动作 */
export type PolicyAction = 'allow' | 'deny' | 'require_approval';

/** 支持的条件字段 */
export type ConditionField = 'toolName' | 'sessionId' | 'requester' | 'timeRange' | 'riskLevel';

/** 条件操作符 */
export type ConditionOperator =
  | 'exact'        // 完全相等
  | 'prefix'       // 前缀匹配（用于 toolName）
  | 'regex'        // 正则匹配
  | 'in'           // 包含于数组
  | 'gte'          // 大于等于
  | 'timeRange';   // 时间范围（HH:MM-HH:MM）

/**
 * 单个条件
 */
export interface Condition {
  /** 字段名 */
  field: ConditionField;
  /** 操作符 */
  operator: ConditionOperator;
  /** 期望值 */
  value: string | string[] | number;
}

/**
 * 策略规则
 */
export interface PolicyRule {
  /** 规则唯一 ID */
  id: string;
  /** 规则名（人类可读） */
  name: string;
  /** 触发条件（所有条件都满足时规则命中） */
  conditions: Condition[];
  /** 规则动作 */
  action: PolicyAction;
  /** 需要的批准人（仅 require_approval 时使用） */
  approvers?: string[];
  /** 风险等级（仅 require_approval 时使用） */
  riskLevel?: ApprovalRiskLevel;
  /** 优先级（数字越小优先级越高，0 为最高） */
  priority?: number;
  /** 启用状态 */
  enabled?: boolean;
}

/** 评估上下文 */
export interface PolicyContext {
  /** 工具名 */
  toolName: string;
  /** 工具参数 */
  toolArgs?: Record<string, unknown>;
  /** 会话 ID */
  sessionId?: string;
  /** 请求者 */
  requester?: string;
  /** 风险等级（可选，未提供时按字段名匹配为字符串时使用） */
  riskLevel?: ApprovalRiskLevel;
  /** 评估时刻（毫秒，可选，默认 Date.now()） */
  now?: number;
}

/** 评估决策 */
export interface PolicyDecision {
  /** 决策动作 */
  action: PolicyAction;
  /** 命中的规则 ID（未命中时为 null） */
  ruleId: string | null;
  /** 命中的规则名 */
  ruleName: string | null;
  /** 需要的批准人 */
  approvers: string[];
  /** 风险等级 */
  riskLevel: ApprovalRiskLevel | null;
  /** 决策原因（人类可读） */
  reason: string;
}

// ===================== 风险等级排序 =====================

const RISK_ORDER: Record<ApprovalRiskLevel, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ===================== 条件评估 =====================

/**
 * 评估单个条件
 */
function evaluateCondition(condition: Condition, context: PolicyContext): boolean {
  const { field, operator, value } = condition;

  switch (field) {
    case 'toolName': {
      const actual = context.toolName;
      return matchString(operator, actual, value);
    }
    case 'sessionId': {
      const actual = context.sessionId ?? '';
      return matchString(operator, actual, value);
    }
    case 'requester': {
      const actual = context.requester ?? '';
      if (operator === 'in') {
        const list = Array.isArray(value) ? value : [String(value)];
        return list.includes(actual);
      }
      return matchString(operator, actual, value);
    }
    case 'riskLevel': {
      if (operator === 'gte') {
        const required = String(value) as ApprovalRiskLevel;
        if (!(required in RISK_ORDER)) return false;
        const actual = context.riskLevel ?? 'safe';
        return RISK_ORDER[actual] >= RISK_ORDER[required];
      }
      const actual = context.riskLevel ?? '';
      return matchString(operator, actual, value);
    }
    case 'timeRange': {
      if (operator !== 'timeRange') return false;
      return inTimeRange(context.now ?? Date.now(), String(value));
    }
    default:
      return false;
  }
}

/**
 * 通用字符串匹配
 */
function matchString(
  operator: ConditionOperator,
  actual: string,
  value: string | string[] | number,
): boolean {
  const v = String(value);
  switch (operator) {
    case 'exact':
      return actual === v;
    case 'prefix':
      return actual.startsWith(v);
    case 'regex':
      try {
        return new RegExp(v).test(actual);
      } catch {
        return false;
      }
    case 'in': {
      const list = Array.isArray(value) ? value : [String(value)];
      return list.includes(actual);
    }
    case 'gte': {
      // 字符串大小比较
      return actual >= v;
    }
    default:
      return false;
  }
}

/**
 * 判断时间戳是否在 HH:MM-HH:MM 范围内
 */
function inTimeRange(timestampMs: number, range: string): boolean {
  const [startStr, endStr] = range.split('-');
  if (!startStr || !endStr) return false;

  const start = parseTime(startStr);
  const end = parseTime(endStr);
  if (start === null || end === null) return false;

  const now = new Date(timestampMs);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;

  if (startMin <= endMin) {
    return minutes >= startMin && minutes <= endMin;
  }
  // 跨天
  return minutes >= startMin || minutes <= endMin;
}

function parseTime(s: string): { h: number; m: number } | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

// ===================== ApprovalPolicy 类 =====================

/**
 * 审批策略引擎
 *
 * 规则按优先级匹配，第一个命中规则即为最终决策。
 * 若无规则命中，返回默认 allow。
 */
export class ApprovalPolicy {
  private rules: Map<string, PolicyRule>;

  constructor() {
    this.rules = new Map();
  }

  // ===================== 规则管理 =====================

  /**
   * 添加规则
   */
  addRule(rule: PolicyRule): void {
    if (!rule.id) {
      throw new Error('规则必须包含 id');
    }
    if (!rule.conditions || rule.conditions.length === 0) {
      throw new Error(`规则 ${rule.id} 必须包含至少一个 condition`);
    }
    this.rules.set(rule.id, { ...rule, enabled: rule.enabled !== false });
  }

  /**
   * 移除规则
   *
   * @returns 是否成功移除
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * 获取规则
   */
  getRule(ruleId: string): PolicyRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * 启用/禁用规则
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    rule.enabled = enabled;
    return true;
  }

  /**
   * 获取所有规则
   */
  getAllRules(): PolicyRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 清空所有规则
   */
  clear(): void {
    this.rules.clear();
  }

  // ===================== 评估 =====================

  /**
   * 评估上下文并产出决策
   *
   * 规则按优先级升序排序，第一个命中且启用的规则即为最终决策。
   * 若无规则命中，默认 allow。
   */
  evaluate(context: PolicyContext): PolicyDecision {
    const sorted = this.getAllRules()
      .filter((r) => r.enabled !== false)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    for (const rule of sorted) {
      if (this.ruleMatches(rule, context)) {
        return {
          action: rule.action,
          ruleId: rule.id,
          ruleName: rule.name,
          approvers: rule.approvers ?? [],
          riskLevel: rule.riskLevel ?? null,
          reason: `命中规则 ${rule.name} (${rule.id})：动作 ${rule.action}`,
        };
      }
    }

    return {
      action: 'allow',
      ruleId: null,
      ruleName: null,
      approvers: [],
      riskLevel: null,
      reason: '无规则命中，默认允许',
    };
  }

  /**
   * 判断规则是否命中
   */
  private ruleMatches(rule: PolicyRule, context: PolicyContext): boolean {
    for (const cond of rule.conditions) {
      if (!evaluateCondition(cond, context)) {
        return false;
      }
    }
    return true;
  }
}

// ===================== 单例导出 =====================

const approvalPolicy = new ApprovalPolicy();

export default approvalPolicy;
