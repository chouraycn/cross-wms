/**
 * ACP Policy Engine
 * 策略引擎 - 定义策略规则、评估逻辑、权限检查
 *
 * 参考 openclaw/src/acp/policy.ts 设计
 *
 * v2.0: 新增配置级策略检查（ACP enabled/dispatch/agent whitelist）
 */

import type { AcpTurnRequest } from "./acpTypes.js";

export type PermissionLevel = "allow" | "deny" | "prompt";
export type PolicyScope = "global" | "session" | "turn";
export type PolicyCategory = "tool" | "network" | "file" | "system" | "model" | "custom";

// ===================== 配置级策略类型 =====================

/** ACP 配置级策略 */
export interface AcpConfigPolicy {
  /** ACP 是否全局启用 */
  enabled?: boolean;
  /** ACP dispatch 是否启用 */
  dispatch?: {
    enabled?: boolean;
  };
  /** 允许的 agent ID 白名单（空数组表示全部允许） */
  allowedAgents?: string[];
}

/** ACP dispatch 策略状态 */
export type AcpDispatchPolicyState = "enabled" | "acp_disabled" | "dispatch_disabled";

const ACP_DISABLED_MESSAGE = "ACP is disabled by policy (`acp.enabled=false`).";
const ACP_DISPATCH_DISABLED_MESSAGE = "ACP dispatch is disabled by policy (`acp.dispatch.enabled=false`).";

/** 返回 ACP 是否全局启用 */
export function isAcpEnabledByPolicy(cfg: AcpConfigPolicy): boolean {
  return cfg.enabled !== false;
}

/** 解析 ACP dispatch 策略状态 */
function resolveAcpDispatchPolicyState(cfg: AcpConfigPolicy): AcpDispatchPolicyState {
  if (!isAcpEnabledByPolicy(cfg)) {
    return "acp_disabled";
  }
  if (cfg.dispatch?.enabled === false) {
    return "dispatch_disabled";
  }
  return "enabled";
}

/** 返回 dispatch 阻止消息（如果有） */
export function resolveAcpDispatchPolicyMessage(cfg: AcpConfigPolicy): string | null {
  const state = resolveAcpDispatchPolicyState(cfg);
  if (state === "acp_disabled") {
    return ACP_DISABLED_MESSAGE;
  }
  if (state === "dispatch_disabled") {
    return ACP_DISPATCH_DISABLED_MESSAGE;
  }
  return null;
}

/** 返回 agent ID 是否通过白名单策略检查 */
function isAcpAgentAllowedByPolicy(cfg: AcpConfigPolicy, agentId: string): boolean {
  const allowed = (cfg.allowedAgents ?? []).filter(Boolean);
  if (allowed.length === 0) {
    return true;
  }
  const normalized = agentId.toLowerCase().trim();
  return allowed.some(a => a.toLowerCase().trim() === normalized);
}

/** 返回 agent 策略拒绝错误（如果有） */
export function resolveAcpAgentPolicyError(cfg: AcpConfigPolicy, agentId: string): string | null {
  if (isAcpAgentAllowedByPolicy(cfg, agentId)) {
    return null;
  }
  return `ACP agent "${agentId}" is not allowed by policy.`;
}

// ===================== 规则级策略类型 =====================

export interface PolicyRule {
  id: string;
  name: string;
  category: PolicyCategory;
  scope: PolicyScope;
  level: PermissionLevel;
  conditions: PolicyCondition[];
  /** 条件匹配模式：any = 任一条件满足即匹配（OR），all = 所有条件必须满足（AND）。默认 any */
  conditionMatchMode?: "any" | "all";
  description?: string;
  priority: number;
}

export interface PolicyCondition {
  field: string;
  operator: "equals" | "notEquals" | "contains" | "startsWith" | "endsWith" | "regex" | "greaterThan" | "lessThan" | "exists";
  value: string | number | boolean;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  level: PermissionLevel;
  matchedRules: PolicyRule[];
  blockedBy?: PolicyRule;
  requiresApproval?: boolean;
  approvalReason?: string;
}

export interface ToolPermission {
  toolName: string;
  level: PermissionLevel;
  allowedArgs?: string[];
  blockedArgs?: string[];
}

export interface PermissionProfile {
  id: string;
  name: string;
  description?: string;
  rules: PolicyRule[];
  toolPermissions: ToolPermission[];
  defaultLevel: PermissionLevel;
}

export const DEFAULT_PERMISSION_PROFILE: PermissionProfile = {
  id: "default",
  name: "Default",
  description: "默认权限配置",
  rules: [
    {
      id: "allow-read-only-tools",
      name: "允许只读工具",
      category: "tool",
      scope: "global",
      level: "allow",
      conditions: [
        { field: "toolName", operator: "startsWith", value: "list" },
        { field: "toolName", operator: "startsWith", value: "get" },
        { field: "toolName", operator: "startsWith", value: "read" },
        { field: "toolName", operator: "equals", value: "search" },
      ],
      priority: 100,
    },
    {
      id: "deny-dangerous-tools",
      name: "拒绝危险工具",
      category: "tool",
      scope: "global",
      level: "deny",
      conditions: [
        { field: "toolName", operator: "equals", value: "exec" },
        { field: "toolName", operator: "equals", value: "rm" },
        { field: "toolName", operator: "equals", value: "delete" },
        { field: "toolName", operator: "equals", value: "shutdown" },
        { field: "toolName", operator: "equals", value: "format" },
      ],
      priority: 200,
    },
    {
      id: "prompt-write-tools",
      name: "写入工具需确认",
      category: "tool",
      scope: "global",
      level: "prompt",
      conditions: [
        { field: "toolName", operator: "startsWith", value: "write" },
        { field: "toolName", operator: "startsWith", value: "create" },
        { field: "toolName", operator: "startsWith", value: "update" },
        { field: "toolName", operator: "startsWith", value: "modify" },
        { field: "toolName", operator: "equals", value: "mkdir" },
      ],
      priority: 150,
    },
  ],
  toolPermissions: [],
  defaultLevel: "prompt",
};

export const RESTRICTED_PERMISSION_PROFILE: PermissionProfile = {
  id: "restricted",
  name: "Restricted",
  description: "受限权限配置",
  rules: [],
  toolPermissions: [],
  defaultLevel: "deny",
};

export const FULL_PERMISSION_PROFILE: PermissionProfile = {
  id: "full",
  name: "Full Access",
  description: "完全权限配置",
  rules: [],
  toolPermissions: [],
  defaultLevel: "allow",
};

export class PolicyEngine {
  private profiles: Map<string, PermissionProfile> = new Map();
  private activeProfile: PermissionProfile = DEFAULT_PERMISSION_PROFILE;

  constructor() {
    this.registerProfile(DEFAULT_PERMISSION_PROFILE);
    this.registerProfile(RESTRICTED_PERMISSION_PROFILE);
    this.registerProfile(FULL_PERMISSION_PROFILE);
  }

  registerProfile(profile: PermissionProfile): void {
    this.profiles.set(profile.id, profile);
  }

  setActiveProfile(profileId: string): boolean {
    const profile = this.profiles.get(profileId);
    if (profile) {
      this.activeProfile = profile;
      return true;
    }
    return false;
  }

  getActiveProfile(): PermissionProfile {
    return this.activeProfile;
  }

  evaluateToolCall(toolName: string, input?: unknown): PolicyEvaluationResult {
    const results: PolicyEvaluationResult[] = [];
    const matchedRules: PolicyRule[] = [];

    for (const rule of this.activeProfile.rules) {
      if (this.matchesRule(rule, { toolName, input })) {
        matchedRules.push(rule);
        results.push({
          allowed: rule.level === "allow",
          level: rule.level,
          matchedRules: [rule],
          requiresApproval: rule.level === "prompt",
          approvalReason: rule.description || rule.name,
        });
      }
    }

    const toolPerm = this.activeProfile.toolPermissions.find(p => p.toolName === toolName);
    if (toolPerm) {
      results.push({
        allowed: toolPerm.level === "allow",
        level: toolPerm.level,
        matchedRules: [],
        requiresApproval: toolPerm.level === "prompt",
        approvalReason: `Tool permission: ${toolPerm.level}`,
      });
    }

    if (results.length === 0) {
      return {
        allowed: this.activeProfile.defaultLevel === "allow",
        level: this.activeProfile.defaultLevel,
        matchedRules: [],
        requiresApproval: this.activeProfile.defaultLevel === "prompt",
        approvalReason: "No specific rule matched, using default policy",
      };
    }

    // 优先级：deny > prompt > allow（deny 总是胜出）
    const levelPriority: Record<PermissionLevel, number> = { deny: 3, prompt: 2, allow: 1 };
    const sorted = results.sort((a, b) => levelPriority[b.level] - levelPriority[a.level]);
    const final = sorted[0];

    if (final.level === "deny") {
      return {
        ...final,
        allowed: false,
        blockedBy: matchedRules.find(r => r.level === "deny"),
      };
    }

    return final;
  }

  evaluateTurn(request: AcpTurnRequest): PolicyEvaluationResult {
    const toolCalls = request.tools || [];
    const results: PolicyEvaluationResult[] = [];

    for (const tool of toolCalls) {
      const result = this.evaluateToolCall(tool.name);
      results.push(result);
    }

    if (results.length === 0) {
      return {
        allowed: true,
        level: "allow",
        matchedRules: [],
        requiresApproval: false,
      };
    }

    const hasDeny = results.some(r => r.level === "deny");
    const hasPrompt = results.some(r => r.level === "prompt");

    if (hasDeny) {
      const blocked = results.find(r => r.level === "deny");
      return {
        allowed: false,
        level: "deny",
        matchedRules: results.flatMap(r => r.matchedRules),
        blockedBy: blocked?.blockedBy,
        approvalReason: "One or more tools are blocked",
      };
    }

    if (hasPrompt) {
      return {
        allowed: false,
        level: "prompt",
        matchedRules: results.flatMap(r => r.matchedRules),
        requiresApproval: true,
        approvalReason: "One or more tools require approval",
      };
    }

    return {
      allowed: true,
      level: "allow",
      matchedRules: results.flatMap(r => r.matchedRules),
      requiresApproval: false,
    };
  }

  private matchesRule(rule: PolicyRule, context: Record<string, unknown>): boolean {
    const checkCondition = (condition: PolicyCondition): boolean => {
      const value = context[condition.field];
      if (value === undefined && condition.operator !== "exists") {
        return false;
      }

      const targetValue = String(value ?? "");
      const conditionValue = String(condition.value);

      switch (condition.operator) {
        case "equals":
          return targetValue === conditionValue;
        case "notEquals":
          return targetValue !== conditionValue;
        case "contains":
          return targetValue.includes(conditionValue);
        case "startsWith":
          return targetValue.startsWith(conditionValue);
        case "endsWith":
          return targetValue.endsWith(conditionValue);
        case "regex":
          return new RegExp(conditionValue).test(targetValue);
        case "greaterThan":
          return Number(targetValue) > Number(conditionValue);
        case "lessThan":
          return Number(targetValue) < Number(conditionValue);
        case "exists":
          return value !== undefined;
        default:
          return false;
      }
    };

    const mode = rule.conditionMatchMode ?? "any";
    return mode === "any"
      ? rule.conditions.some(checkCondition)
      : rule.conditions.every(checkCondition);
  }

  canExecuteTool(toolName: string, input?: unknown): boolean {
    const result = this.evaluateToolCall(toolName, input);
    return result.allowed && !result.requiresApproval;
  }

  requiresApproval(toolName: string, input?: unknown): boolean {
    const result = this.evaluateToolCall(toolName, input);
    return result.requiresApproval ?? false;
  }
}

export const policyEngine = new PolicyEngine();
