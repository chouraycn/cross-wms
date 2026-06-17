/**
 * ToolPermissionSandbox — 工具权限沙箱
 *
 * 替代硬编码 riskLevel，支持配置化的工具权限管理。
 * 权限级别：allow（自动执行）/ confirm（需确认）/ deny（禁止）/ high-risk（高风险确认）
 * 支持动态规则（基于上下文条件调整权限）。
 *
 * v6.0: P2-1 工具权限沙箱
 */

// ===================== 类型定义 =====================

/** 工具权限级别 */
export type ToolPermission = 'allow' | 'confirm' | 'deny' | 'high-risk';

/** 权限规则（静态） */
export interface PermissionRule {
  /** 工具名 */
  toolName: string;
  /** 权限级别 */
  permission: ToolPermission;
  /** 规则描述（可选） */
  description?: string;
}

/** 动态权限条件 */
export interface DynamicPermissionCondition {
  /** 条件名 */
  name: string;
  /** 工具名 */
  toolName: string;
  /** 条件判断函数 */
  condition: (context: PermissionContext) => boolean;
  /** 条件满足时的权限级别 */
  permissionIfTrue: ToolPermission;
  /** 条件不满足时的权限级别（默认为静态规则值） */
  permissionIfFalse?: ToolPermission;
}

/** 权限上下文（用于动态规则判断） */
export interface PermissionContext {
  /** 当前复杂度等级 */
  complexityLevel: 'simple' | 'moderate' | 'complex';
  /** 当前轮次 */
  currentTurn: number;
  /** 已执行的工具列表 */
  executedTools: string[];
  /** 用户消息 */
  userMessage: string;
}

/** 权限决策结果 */
export interface PermissionDecision {
  /** 最终权限级别 */
  permission: ToolPermission;
  /** 决策来源：static/dynamic/default */
  source: 'static' | 'dynamic' | 'default';
  /** 需要用户确认 */
  needsConfirmation: boolean;
  /** 原因说明 */
  reason: string;
}

// ===================== 常量 =====================

/** 默认静态权限规则（从 reactExecutor.ts 迁移） */
const DEFAULT_PERMISSION_RULES: PermissionRule[] = [
  // allow: 只读、无副作用
  { toolName: 'system_info', permission: 'allow' },
  { toolName: 'file_listDir', permission: 'allow' },
  { toolName: 'file_readFile', permission: 'allow' },
  { toolName: 'db_query', permission: 'allow' },
  { toolName: 'desktop_health', permission: 'allow' },
  { toolName: 'desktop_screenshot', permission: 'allow' },
  { toolName: 'app_setBotName', permission: 'allow' },
  { toolName: 'wms_inventory', permission: 'allow' },
  { toolName: 'web_search', permission: 'allow' },
  { toolName: 'web_fetch', permission: 'allow' },
  { toolName: 'desktop_app_launch', permission: 'allow' },
  { toolName: 'browser_snapshot', permission: 'allow' },
  { toolName: 'browser_screenshot', permission: 'allow' },
  { toolName: 'web_hook_poll', permission: 'allow' },
  { toolName: 'web_hook_stop', permission: 'allow' },
  // confirm: 写入、有副作用
  { toolName: 'file_writeFile', permission: 'confirm' },
  { toolName: 'shell_exec', permission: 'confirm' },
  { toolName: 'web_api_call', permission: 'confirm' },
  { toolName: 'browser_navigate', permission: 'confirm' },
  { toolName: 'browser_click', permission: 'confirm' },
  { toolName: 'browser_type', permission: 'confirm' },
  { toolName: 'web_hook_listen', permission: 'confirm' },
  // high-risk: 不可逆、系统级
  { toolName: 'desktop_click', permission: 'high-risk' },
  { toolName: 'desktop_type', permission: 'high-risk' },
  { toolName: 'desktop_key_press', permission: 'high-risk' },
  { toolName: 'desktop_app_quit', permission: 'high-risk' },
  { toolName: 'desktop_window_focus', permission: 'high-risk' },
  { toolName: 'desktop_clipboard', permission: 'high-risk' },
  { toolName: 'desktop_scroll', permission: 'high-risk' },
  { toolName: 'desktop_see', permission: 'high-risk' },
  // MCP 工具默认权限：以 mcp__ 开头的工具默认 confirm 级别
  { toolName: 'mcp__*', permission: 'confirm' },
];

// ===================== ToolPermissionSandbox 类 =====================

export class ToolPermissionSandbox {
  private rules: Map<string, ToolPermission>;
  private dynamicConditions: DynamicPermissionCondition[];
  private deniedTools: Set<string>;

  constructor(customRules?: PermissionRule[]) {
    this.rules = new Map();
    this.dynamicConditions = [];
    this.deniedTools = new Set();

    // 加载默认规则
    for (const rule of DEFAULT_PERMISSION_RULES) {
      this.rules.set(rule.toolName, rule.permission);
    }

    // 覆盖/追加自定义规则
    if (customRules) {
      for (const rule of customRules) {
        this.rules.set(rule.toolName, rule.permission);
      }
    }
  }

  /**
   * 获取工具权限决策。
   * 优先级：deny 列表 > 动态规则 > 静态规则 > 默认 confirm
   */
  getPermission(toolName: string, context?: PermissionContext): PermissionDecision {
    // 1. 检查 deny 列表
    if (this.deniedTools.has(toolName)) {
      return {
        permission: 'deny',
        source: 'dynamic',
        needsConfirmation: false,
        reason: `工具 '${toolName}' 已被禁止执行`,
      };
    }

    // 2. 检查动态条件
    if (context) {
      for (const cond of this.dynamicConditions) {
        if (cond.toolName === toolName) {
          const matched = cond.condition(context);
          if (matched) {
            return {
              permission: cond.permissionIfTrue,
              source: 'dynamic',
              needsConfirmation: cond.permissionIfTrue === 'confirm' || cond.permissionIfTrue === 'high-risk',
              reason: `动态规则 '${cond.name}' 匹配`,
            };
          } else if (cond.permissionIfFalse !== undefined) {
            return {
              permission: cond.permissionIfFalse,
              source: 'dynamic',
              needsConfirmation: cond.permissionIfFalse === 'confirm' || cond.permissionIfFalse === 'high-risk',
              reason: `动态规则 '${cond.name}' 未匹配，使用 fallback`,
            };
          }
        }
      }
    }

    // 3. 静态规则（精确匹配 + 通配符匹配）
    // 3a. 精确匹配
    const staticPermission = this.rules.get(toolName);
    if (staticPermission) {
      return {
        permission: staticPermission,
        source: 'static',
        needsConfirmation: staticPermission === 'confirm' || staticPermission === 'high-risk',
        reason: `静态规则: ${staticPermission}`,
      };
    }
    // 3b. 通配符匹配（如 'mcp__*' 匹配所有 mcp__ 开头的工具名）
    for (const [pattern, permission] of this.rules) {
      if (pattern.includes('*') && this.matchWildcard(toolName, pattern)) {
        return {
          permission,
          source: 'static',
          needsConfirmation: permission === 'confirm' || permission === 'high-risk',
          reason: `静态规则(通配符): ${pattern} → ${permission}`,
        };
      }
    }

    // 4. 默认：未知工具需要确认
    return {
      permission: 'confirm',
      source: 'default',
      needsConfirmation: true,
      reason: '未知工具，默认需要确认',
    };
  }

  /** 添加动态权限条件 */
  addDynamicCondition(condition: DynamicPermissionCondition): void {
    this.dynamicConditions.push(condition);
  }

  /** 禁止工具执行 */
  denyTool(toolName: string): void {
    this.deniedTools.add(toolName);
  }

  /** 允许之前禁止的工具 */
  allowTool(toolName: string): void {
    this.deniedTools.delete(toolName);
  }

  /** 更新静态规则 */
  updateRule(rule: PermissionRule): void {
    this.rules.set(rule.toolName, rule.permission);
  }

  /** 重置所有状态（deny 列表 + 动态条件） */
  reset(): void {
    this.deniedTools.clear();
    this.dynamicConditions = [];
  }

  /**
   * 通配符匹配。
   * 支持规则：
   * - 'mcp__*' 匹配所有以 'mcp__' 开头的工具名
   * - 'mcp__filesystem__*' 匹配特定 server 的所有工具
   * - '*' 匹配所有工具名
   *
   * @param toolName - 工具名
   * @param pattern - 含通配符的规则
   * @returns 是否匹配
   */
  private matchWildcard(toolName: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return toolName.endsWith(suffix);
    }
    // 包含中间 * 的情况（不常用，简单实现）
    const regexStr = pattern.replace(/\*/g, '.*');
    try {
      return new RegExp(`^${regexStr}$`).test(toolName);
    } catch {
      return false;
    }
  }
}
