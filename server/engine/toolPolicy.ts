/**
 * Tool Policy System
 * 工具策略系统 - 管理工具调用的权限、安全和策略
 */

export type ToolPolicyAction = "allow" | "deny" | "ask" | "sandbox";

export interface ToolPolicyRule {
  id: string;
  name: string;
  description?: string;
  toolName: string;
  action: ToolPolicyAction;
  priority: number;
  conditions?: {
    argumentPatterns?: Record<string, RegExp | string>;
    userRoles?: string[];
    sessionTags?: string[];
    timeWindows?: Array<{ start: string; end: string }>;
  };
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  sandboxConfig?: {
    allowedCommands?: string[];
    blockedCommands?: string[];
    filesystem?: "read_only" | "read_write" | "isolated";
    network?: "full" | "limited" | "none";
  };
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ToolPolicyContext {
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionKey?: string;
  userId?: string;
  userRoles?: string[];
  sessionTags?: string[];
  agent?: string;
}

export interface ToolPolicyResult {
  action: ToolPolicyAction;
  reason: string;
  matchedRule?: string;
  sandboxConfig?: ToolPolicyRule["sandboxConfig"];
  rateLimitRemaining?: number;
  denylisted?: boolean;
  allowlisted?: boolean;
}

interface RateLimitEntry {
  calls: number[];
}

class ToolPolicyManager {
  private readonly rules = new Map<string, ToolPolicyRule>();
  private readonly rateLimits = new Map<string, RateLimitEntry>();
  private defaultAction: ToolPolicyAction = "ask";

  constructor() {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    const now = Date.now();

    // 默认允许的安全工具
    const safeTools = [
      "memory_search",
      "web_search",
      "tool_search",
      "wms_inventory_query",
      "get_current_time",
      "calculator",
    ];

    for (const tool of safeTools) {
      this.addRule({
        id: `default_allow_${tool}`,
        name: `Allow ${tool}`,
        toolName: tool,
        action: "allow",
        priority: 100,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 默认需要沙箱的工具
    const sandboxTools = [
      "bash",
      "execute_command",
      "shell",
      "subprocess",
    ];

    for (const tool of sandboxTools) {
      this.addRule({
        id: `default_sandbox_${tool}`,
        name: `Sandbox ${tool}`,
        toolName: tool,
        action: "sandbox",
        priority: 50,
        enabled: true,
        sandboxConfig: {
          filesystem: "isolated",
          network: "limited",
        },
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  addRule(rule: Omit<ToolPolicyRule, "createdAt" | "updatedAt"> & { createdAt?: number; updatedAt?: number }): void {
    const now = Date.now();
    const fullRule: ToolPolicyRule = {
      ...rule,
      createdAt: rule.createdAt ?? now,
      updatedAt: rule.updatedAt ?? now,
    };
    this.rules.set(rule.id, fullRule);
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  getRule(ruleId: string): ToolPolicyRule | undefined {
    return this.rules.get(ruleId);
  }

  listRules(options?: { toolName?: string; enabled?: boolean }): ToolPolicyRule[] {
    let rules = Array.from(this.rules.values());

    if (options?.toolName) {
      rules = rules.filter((r) => this.matchesToolName(r.toolName, options.toolName!));
    }
    if (options?.enabled !== undefined) {
      rules = rules.filter((r) => r.enabled === options.enabled);
    }

    return rules.sort((a, b) => b.priority - a.priority);
  }

  setDefaultAction(action: ToolPolicyAction): void {
    this.defaultAction = action;
  }

  getDefaultAction(): ToolPolicyAction {
    return this.defaultAction;
  }

  evaluate(context: ToolPolicyContext): ToolPolicyResult {
    const applicableRules = this.listRules({ enabled: true })
      .filter((rule) => this.matchesToolName(rule.toolName, context.toolName))
      .filter((rule) => this.matchesConditions(rule, context));

    if (applicableRules.length === 0) {
      return {
        action: this.defaultAction,
        reason: `No matching rules, using default action: ${this.defaultAction}`,
      };
    }

    const highestPriority = applicableRules[0];

    // 检查速率限制
    if (highestPriority.rateLimit) {
      const remaining = this.checkRateLimit(
        highestPriority.id,
        highestPriority.rateLimit,
      );
      if (remaining <= 0) {
        return {
          action: "deny",
          reason: `Rate limit exceeded for tool: ${context.toolName}`,
          matchedRule: highestPriority.id,
          rateLimitRemaining: 0,
        };
      }
      return {
        action: highestPriority.action,
        reason: `Matched rule: ${highestPriority.name}`,
        matchedRule: highestPriority.id,
        sandboxConfig: highestPriority.sandboxConfig,
        rateLimitRemaining: remaining - 1,
      };
    }

    return {
      action: highestPriority.action,
      reason: `Matched rule: ${highestPriority.name}`,
      matchedRule: highestPriority.id,
      sandboxConfig: highestPriority.sandboxConfig,
    };
  }

  async evaluateAsync(context: ToolPolicyContext): Promise<ToolPolicyResult> {
    return this.evaluate(context);
  }

  isAllowed(context: ToolPolicyContext): boolean {
    const result = this.evaluate(context);
    return result.action === "allow" || result.action === "sandbox";
  }

  isDenylisted(context: ToolPolicyContext): boolean {
    const result = this.evaluate(context);
    return result.action === "deny";
  }

  isAllowlisted(context: ToolPolicyContext): boolean {
    const result = this.evaluate(context);
    return result.action === "allow";
  }

  private matchesToolName(pattern: string, toolName: string): boolean {
    if (pattern === toolName) {
      return true;
    }
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }
    if (pattern.startsWith("*")) {
      const suffix = pattern.slice(1);
      return toolName.endsWith(suffix);
    }
    return false;
  }

  private matchesConditions(rule: ToolPolicyRule, context: ToolPolicyContext): boolean {
    const conditions = rule.conditions;
    if (!conditions) return true;

    // 参数模式匹配
    if (conditions.argumentPatterns) {
      for (const [key, pattern] of Object.entries(conditions.argumentPatterns)) {
        const value = context.toolInput[key];
        if (value === undefined) return false;
        if (pattern instanceof RegExp) {
          if (!pattern.test(String(value))) return false;
        } else {
          if (String(value) !== pattern) return false;
        }
      }
    }

    // 用户角色匹配
    if (conditions.userRoles && context.userRoles) {
      const hasMatchingRole = conditions.userRoles.some((role) =>
        context.userRoles!.includes(role),
      );
      if (!hasMatchingRole) return false;
    }

    // 会话标签匹配
    if (conditions.sessionTags && context.sessionTags) {
      const hasMatchingTag = conditions.sessionTags.some((tag) =>
        context.sessionTags!.includes(tag),
      );
      if (!hasMatchingTag) return false;
    }

    return true;
  }

  private checkRateLimit(ruleId: string, rateLimit: { maxCalls: number; windowMs: number }): number {
    const now = Date.now();
    const entry = this.rateLimits.get(ruleId) ?? { calls: [] };

    // 清理过期的调用记录
    entry.calls = entry.calls.filter((t) => now - t < rateLimit.windowMs);

    const remaining = rateLimit.maxCalls - entry.calls.length;

    if (remaining > 0) {
      entry.calls.push(now);
      this.rateLimits.set(ruleId, entry);
    }

    return remaining;
  }

  resetRateLimits(): void {
    this.rateLimits.clear();
  }

  clear(): void {
    this.rules.clear();
    this.rateLimits.clear();
  }

  size(): number {
    return this.rules.size;
  }
}

const TOOL_POLICY_INSTANCE = new ToolPolicyManager();

export function getToolPolicy(): ToolPolicyManager {
  return TOOL_POLICY_INSTANCE;
}

export function evaluateToolPolicy(context: ToolPolicyContext): ToolPolicyResult {
  return TOOL_POLICY_INSTANCE.evaluate(context);
}

export function isToolAllowed(context: ToolPolicyContext): boolean {
  return TOOL_POLICY_INSTANCE.isAllowed(context);
}

export function resetToolPolicyForTests(): void {
  TOOL_POLICY_INSTANCE.clear();
}

export type { ToolPolicyManager };
