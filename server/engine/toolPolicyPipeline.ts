/**
 * Tool Policy Pipeline — 工具调度策略管线
 *
 * 多层策略检查系统，决定工具是否可以被调用：
 * 1. profile — 全局配置策略
 * 2. provider — 模型提供商策略
 * 3. global — 全局工具策略
 * 4. agent — Agent 级别策略
 * 5. group — 分组策略
 * 6. sender — 发送者/用户级别策略
 * 7. sandbox — 沙箱策略
 * 8. subagent — 子 Agent 策略
 * 9. inherited — 继承的策略
 *
 * 每层策略返回：allow / deny / undefined（继续下一层）
 */

import { logger } from '../logger.js';
import type {
  SkillPermissionGroup,
  SkillPermissionConfig,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 策略决策 */
export type PolicyDecision = 'allow' | 'deny' | undefined;

/** 策略结果 */
export interface PolicyResult {
  /** 是否允许 */
  allowed: boolean;
  /** 最终决策层 */
  decidedBy: string;
  /** 决策原因 */
  reason?: string;
  /** 各层检查结果（用于调试） */
  checks: Record<string, { passed: boolean; detail: string }>;
}

/** 策略上下文 */
export interface PolicyContext {
  /** 工具名称 */
  toolName: string;
  /** 工具分组（Skill 的 group 字段） */
  toolGroup?: SkillPermissionGroup;
  /** 调用参数 */
  params?: Record<string, unknown>;
  /** Agent ID */
  agentId?: string;
  /** 用户 ID */
  userId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 是否为子 Agent 调用 */
  isSubagent?: boolean;
  /** 沙箱范围 */
  sandboxScope?: 'workspace' | 'user' | 'system' | 'none';
}

/** 策略层处理器 */
export type PolicyHandler = (
  context: PolicyContext,
) => PolicyDecision | Promise<PolicyDecision>;

/** 策略层定义 */
export interface PolicyLayer {
  /** 层名称 */
  name: string;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 策略处理器 */
  handler: PolicyHandler;
  /** 是否启用 */
  enabled?: boolean;
}

// ===================== 常量 =====================

/** 默认策略层顺序（优先级从高到低） */
const DEFAULT_POLICY_LAYERS: PolicyLayer[] = [
  { name: 'profile', priority: 10, handler: () => undefined, enabled: true },
  { name: 'provider', priority: 20, handler: () => undefined, enabled: true },
  { name: 'global', priority: 30, handler: () => undefined, enabled: true },
  { name: 'agent', priority: 40, handler: () => undefined, enabled: true },
  { name: 'group', priority: 50, handler: () => undefined, enabled: true },
  { name: 'sender', priority: 60, handler: () => undefined, enabled: true },
  { name: 'sandbox', priority: 70, handler: () => undefined, enabled: true },
  { name: 'subagent', priority: 80, handler: () => undefined, enabled: true },
  { name: 'inherited', priority: 90, handler: () => undefined, enabled: true },
];

// ===================== ToolPolicyPipeline 类 =====================

/**
 * 工具调度策略管线
 */
export class ToolPolicyPipeline {
  /** 策略层 */
  private layers: PolicyLayer[] = [];

  /** 全局权限配置 */
  private globalConfig: SkillPermissionConfig = {
    allow: [],
    deny: [],
    elevated: { enabled: 'ask' },
  };

  constructor() {
    // 初始化默认层（深拷贝，避免修改原始常量）
    this.layers = DEFAULT_POLICY_LAYERS.map((layer) => ({ ...layer }));
  }

  // ===================== 1. 策略层管理 =====================

  /**
   * 添加策略层
   *
   * @param layer - 策略层定义
   */
  addLayer(layer: PolicyLayer): void {
    this.layers.push(layer);
    this.sortLayers();
    logger.debug(`[ToolPolicyPipeline] Added policy layer: ${layer.name}`);
  }

  /**
   * 移除策略层
   *
   * @param name - 层名称
   */
  removeLayer(name: string): void {
    const index = this.layers.findIndex((l) => l.name === name);
    if (index !== -1) {
      this.layers.splice(index, 1);
      logger.debug(`[ToolPolicyPipeline] Removed policy layer: ${name}`);
    }
  }

  /**
   * 设置策略层处理器
   *
   * @param name - 层名称
   * @param handler - 策略处理器
   */
  setLayerHandler(name: string, handler: PolicyHandler): void {
    const layer = this.layers.find((l) => l.name === name);
    if (layer) {
      layer.handler = handler;
    } else {
      this.addLayer({ name, priority: 50, handler });
    }
  }

  /**
   * 启用/禁用策略层
   *
   * @param name - 层名称
   * @param enabled - 是否启用
   */
  setLayerEnabled(name: string, enabled: boolean): void {
    const layer = this.layers.find((l) => l.name === name);
    if (layer) {
      layer.enabled = enabled;
    }
  }

  /**
   * 按优先级排序层
   */
  private sortLayers(): void {
    this.layers.sort((a, b) => a.priority - b.priority);
  }

  // ===================== 2. 全局配置 =====================

  /**
   * 设置全局权限配置
   *
   * @param config - 权限配置
   */
  setGlobalConfig(config: SkillPermissionConfig): void {
    this.globalConfig = config;
    logger.debug('[ToolPolicyPipeline] Global config updated.');
  }

  /**
   * 获取全局权限配置
   */
  getGlobalConfig(): SkillPermissionConfig {
    return { ...this.globalConfig };
  }

  // ===================== 3. 策略执行 =====================

  /**
   * 执行策略管线检查
   *
   * 按优先级从高到低依次执行各层策略：
   * - 返回 'deny' → 立即拒绝
   * - 返回 'allow' → 立即允许
   * - 返回 undefined → 继续下一层
   *
   * 所有层都返回 undefined 时，默认拒绝（安全优先）。
   *
   * @param context - 策略上下文
   * @returns 策略结果
   */
  async check(context: PolicyContext): Promise<PolicyResult> {
    const checks: Record<string, { passed: boolean; detail: string }> = {};

    for (const layer of this.layers) {
      if (layer.enabled === false) continue;

      try {
        const decision = await layer.handler(context);

        if (decision === 'deny') {
          checks[layer.name] = { passed: false, detail: '策略拒绝' };
          return {
            allowed: false,
            decidedBy: layer.name,
            reason: `${layer.name} 策略拒绝`,
            checks,
          };
        }

        if (decision === 'allow') {
          checks[layer.name] = { passed: true, detail: '策略允许' };
          return {
            allowed: true,
            decidedBy: layer.name,
            reason: `${layer.name} 策略允许`,
            checks,
          };
        }

        checks[layer.name] = { passed: true, detail: '无决策，继续下一层' };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        checks[layer.name] = { passed: false, detail: `策略执行异常: ${errorMsg}` };
        logger.error(`[ToolPolicyPipeline] Policy layer '${layer.name}' error:`, e);
        // 策略异常时默认拒绝（安全优先）
        return {
          allowed: false,
          decidedBy: layer.name,
          reason: `${layer.name} 策略执行异常: ${errorMsg}`,
          checks,
        };
      }
    }

    // 所有层都无决策，使用全局配置
    const globalResult = this.checkGlobalConfig(context);
    checks['global-config'] = {
      passed: globalResult.allowed,
      detail: globalResult.allowed ? '全局配置允许' : '全局配置拒绝',
    };

    return {
      allowed: globalResult.allowed,
      decidedBy: 'global-config',
      reason: globalResult.allowed ? '全局配置允许' : '全局配置拒绝',
      checks,
    };
  }

  /**
   * 检查全局权限配置
   */
  private checkGlobalConfig(context: PolicyContext): { allowed: boolean } {
    const { toolName, toolGroup } = context;
    const config = this.globalConfig;

    // deny 优先
    for (const pattern of config.deny) {
      if (this.matchPattern(pattern, toolName, toolGroup)) {
        return { allowed: false };
      }
    }

    // allow 列表（空 allow = 全部允许）
    if (config.allow.length > 0) {
      const allowed = config.allow.some((pattern) =>
        this.matchPattern(pattern, toolName, toolGroup),
      );
      if (!allowed) {
        return { allowed: false };
      }
    }

    return { allowed: true };
  }

  /**
   * 匹配权限模式
   */
  private matchPattern(pattern: string, toolName: string, toolGroup?: string): boolean {
    if (pattern === '*') return true;
    if (pattern === toolName) return true;
    if (toolGroup && pattern === toolGroup) return true;
    if (toolGroup && pattern.endsWith(':*') && toolGroup === pattern.slice(0, -2)) {
      return true;
    }
    return false;
  }

  // ===================== 4. 便捷方法 =====================

  /**
   * 快速检查工具是否允许（简化版）
   *
   * @param toolName - 工具名称
   * @param toolGroup - 工具分组
   * @returns 是否允许
   */
  async isAllowed(toolName: string, toolGroup?: SkillPermissionGroup): Promise<boolean> {
    const result = await this.check({ toolName, toolGroup });
    return result.allowed;
  }

  /**
   * 获取管线统计信息
   */
  getStats(): {
    totalLayers: number;
    enabledLayers: number;
    layerNames: string[];
  } {
    const enabled = this.layers.filter((l) => l.enabled !== false);
    return {
      totalLayers: this.layers.length,
      enabledLayers: enabled.length,
      layerNames: enabled.map((l) => l.name),
    };
  }
}

// ===================== 预设策略 =====================

/**
 * 创建基于权限配置的策略处理器
 *
 * @param config - 权限配置
 * @returns 策略处理器
 */
export function createPermissionPolicyHandler(
  config: SkillPermissionConfig,
): PolicyHandler {
  return (context: PolicyContext): PolicyDecision => {
    const { toolName, toolGroup } = context;

    // deny 优先
    for (const pattern of config.deny) {
      if (matchToolPattern(pattern, toolName, toolGroup)) {
        return 'deny';
      }
    }

    // allow 列表
    if (config.allow.length > 0) {
      const allowed = config.allow.some((pattern) =>
        matchToolPattern(pattern, toolName, toolGroup),
      );
      if (!allowed) {
        return 'deny';
      }
    }

    return undefined;
  };
}

/**
 * 匹配工具模式
 */
function matchToolPattern(pattern: string, toolName: string, toolGroup?: string): boolean {
  if (pattern === '*') return true;
  if (pattern === toolName) return true;
  if (toolGroup && pattern === toolGroup) return true;
  if (toolGroup && pattern.endsWith(':*') && toolGroup === pattern.slice(0, -2)) {
    return true;
  }
  return false;
}

// ===================== Module-level Singleton =====================

/** 工具策略管线单例 */
export const toolPolicyPipeline = new ToolPolicyPipeline();
