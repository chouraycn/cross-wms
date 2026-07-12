/**
 * Tool Fallback Strategy — 工具降级策略
 *
 * 当主要工具失败时自动切换到备用工具：
 * 1. 工具替换映射（主要工具 → 备用工具）
 * 2. 降级条件（连续失败次数、错误类型）
 * 3. 自动降级通知
 * 4. 降级恢复（主要工具恢复后切回）
 *
 * v11.1: 新增工具降级策略
 */

import { logger } from '../logger.js';
import { toolExecutionStats } from './toolExecutionStats.js';
import type { ToolHealthStatus } from './toolExecutionStats.js';

// ===================== 类型定义 =====================

export interface FallbackMapping {
  primaryTool: string;
  fallbackTools: string[];
  conditions: {
    minConsecutiveFailures: number;
    errorTypes?: string[];
    minHealthScore?: number;
  };
  /** P1-1: 降级后多久尝试探测主工具是否恢复（毫秒，默认 5 分钟） */
  probeIntervalMs?: number;
  onFallback?: (from: string, to: string) => void;
  onRecover?: (from: string, to: string) => void;
}

export interface FallbackState {
  primaryTool: string;
  currentTool: string;
  isDegraded: boolean;
  degradedAt?: number;
  recoveredAt?: number;
  fallbackCount: number;
  recoverCount: number;
}

/** P1-1: 默认探测间隔（5 分钟）— 降级后定期尝试主工具是否恢复 */
const DEFAULT_PROBE_INTERVAL_MS = 5 * 60 * 1000;

// ===================== 默认降级映射 =====================

const DEFAULT_FALLBACK_MAPPINGS: FallbackMapping[] = [
  {
    primaryTool: 'search_web',
    fallbackTools: ['search_local'],
    conditions: {
      minConsecutiveFailures: 3,
      minHealthScore: 40,
    },
  },
  {
    primaryTool: 'file_readFile',
    fallbackTools: ['execute_bash'],
    conditions: {
      minConsecutiveFailures: 5,
      errorTypes: ['timeout', 'transient'],
    },
  },
  {
    primaryTool: 'mcp__filesystem__read_file',
    fallbackTools: ['file_readFile'],
    conditions: {
      minConsecutiveFailures: 3,
    },
  },
];

// ===================== 状态 =====================

class ToolFallbackManager {
  private mappings: Map<string, FallbackMapping> = new Map();
  private states: Map<string, FallbackState> = new Map();

  constructor() {
    // 注册默认映射
    for (const mapping of DEFAULT_FALLBACK_MAPPINGS) {
      this.register(mapping);
    }
  }

  /**
   * 注册降级映射
   */
  register(mapping: FallbackMapping): void {
    this.mappings.set(mapping.primaryTool, mapping);
    // 初始化状态
    this.states.set(mapping.primaryTool, {
      primaryTool: mapping.primaryTool,
      currentTool: mapping.primaryTool,
      isDegraded: false,
      fallbackCount: 0,
      recoverCount: 0,
    });
    logger.debug(`[ToolFallback] Registered: ${mapping.primaryTool} → [${mapping.fallbackTools.join(', ')}]`);
  }

  /**
   * 检查是否需要降级
   *
   * P1-1 修复：增加时间探测机制 — 降级后每 probeIntervalMs 尝试一次主工具
   * P2-1 修复：降级态下每次调用都重新选择 fallback（如果当前 fallback 也不健康则切到下一个）
   */
  checkAndFallback(toolName: string): string {
    const mapping = this.mappings.get(toolName);
    if (!mapping) {
      return toolName;
    }

    const state = this.states.get(toolName);
    if (!state) {
      return toolName;
    }

    const health = toolExecutionStats.getHealthStatus(toolName);
    const shouldFallback = this.shouldFallback(toolName, mapping, health);

    if (shouldFallback && !state.isDegraded) {
      // 触发降级
      const fallbackTool = this.selectFallbackTool(mapping);
      if (fallbackTool) {
        state.isDegraded = true;
        state.currentTool = fallbackTool;
        state.degradedAt = Date.now();
        state.fallbackCount++;

        logger.warn(
          `[ToolFallback] Degrading: ${toolName} → ${fallbackTool} ` +
          `(health=${health?.healthScore}, failures=${health?.consecutiveFailures})`
        );

        mapping.onFallback?.(toolName, fallbackTool);
        return fallbackTool;
      }
    } else if (!shouldFallback && state.isDegraded) {
      // 恢复到主要工具
      state.isDegraded = false;
      state.currentTool = toolName;
      state.recoveredAt = Date.now();
      state.recoverCount++;

      logger.info(`[ToolFallback] Recovered: ${state.currentTool} → ${toolName}`);
      mapping.onRecover?.(state.currentTool, toolName);
      return toolName;
    }

    // P1-1 修复：降级态下的探测机制
    if (state.isDegraded && state.degradedAt) {
      const probeInterval = mapping.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
      const sinceDegraded = Date.now() - state.degradedAt;

      if (sinceDegraded >= probeInterval) {
        // 探测：返回主工具名，让执行路径用主工具执行一次
        // 若成功 → stats 记录在主工具名下 → 下次 checkAndFallback 会看到改善的 health → 恢复
        // 若失败 → stats 记录失败 → 下次 checkAndFallback 会继续降级
        logger.info(`[ToolFallback] Probing primary tool: ${toolName} (degraded ${(sinceDegraded / 1000).toFixed(0)}s ago)`);
        return toolName;
      }

      // P2-1 修复：降级态下重新检查当前 fallback 是否健康
      // 如果当前 fallback 也不健康了，尝试切换到下一个
      const currentFallbackHealth = toolExecutionStats.getHealthStatus(state.currentTool);
      if (currentFallbackHealth && currentFallbackHealth.status === 'unhealthy') {
        const nextFallback = this.selectFallbackTool(mapping);
        if (nextFallback && nextFallback !== state.currentTool) {
          logger.warn(`[ToolFallback] Switching fallback: ${state.currentTool} → ${nextFallback} (previous unhealthy)`);
          state.currentTool = nextFallback;
          return nextFallback;
        }
      }
    }

    return state.currentTool;
  }

  /**
   * 检查是否满足降级条件
   */
  private shouldFallback(
    toolName: string,
    mapping: FallbackMapping,
    health?: ToolHealthStatus,
  ): boolean {
    if (!health) {
      return false;
    }

    const { conditions } = mapping;

    // 检查连续失败次数
    if (conditions.minConsecutiveFailures > 0) {
      if (health.consecutiveFailures < conditions.minConsecutiveFailures) {
        return false;
      }
    }

    // 检查健康分数
    if (conditions.minHealthScore !== undefined) {
      if (health.healthScore > conditions.minHealthScore) {
        return false;
      }
    }

    // 检查错误类型
    if (conditions.errorTypes && conditions.errorTypes.length > 0) {
      const stats = toolExecutionStats.getStats(toolName);
      if (stats) {
        const hasMatchedError = conditions.errorTypes.some(type => 
          stats.errorTypes[type] > 0
        );
        if (!hasMatchedError) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 选择备用工具
   */
  private selectFallbackTool(mapping: FallbackMapping): string | null {
    for (const fallback of mapping.fallbackTools) {
      // 检查备用工具是否可用
      const health = toolExecutionStats.getHealthStatus(fallback);
      if (!health || health.status !== 'unhealthy') {
        return fallback;
      }
    }
    return null;
  }

  /**
   * 获取当前应该使用的工具
   */
  getCurrentTool(toolName: string): string {
    const state = this.states.get(toolName);
    return state?.currentTool || toolName;
  }

  /**
   * 获取降级状态
   */
  getState(toolName: string): FallbackState | undefined {
    return this.states.get(toolName);
  }

  /**
   * 获取所有降级状态
   */
  getAllStates(): FallbackState[] {
    return Array.from(this.states.values());
  }

  /**
   * 强制降级
   */
  forceFallback(toolName: string): string | null {
    const mapping = this.mappings.get(toolName);
    if (!mapping) {
      return null;
    }

    const state = this.states.get(toolName);
    if (!state) {
      return null;
    }

    const fallbackTool = this.selectFallbackTool(mapping);
    if (!fallbackTool) {
      return null;
    }

    state.isDegraded = true;
    state.currentTool = fallbackTool;
    state.degradedAt = Date.now();
    state.fallbackCount++;

    logger.warn(`[ToolFallback] Forced degradation: ${toolName} → ${fallbackTool}`);
    mapping.onFallback?.(toolName, fallbackTool);

    return fallbackTool;
  }

  /**
   * 强制恢复
   */
  forceRecover(toolName: string): boolean {
    const state = this.states.get(toolName);
    if (!state || !state.isDegraded) {
      return false;
    }

    state.isDegraded = false;
    state.currentTool = toolName;
    state.recoveredAt = Date.now();
    state.recoverCount++;

    logger.info(`[ToolFallback] Forced recovery: → ${toolName}`);

    const mapping = this.mappings.get(toolName);
    mapping?.onRecover?.(state.currentTool, toolName);

    return true;
  }

  /**
   * 清除所有降级状态
   */
  reset(): void {
    for (const state of this.states.values()) {
      state.isDegraded = false;
      state.currentTool = state.primaryTool;
    }
    logger.debug('[ToolFallback] All fallback states reset');
  }

  /**
   * 生成降级报告
   */
  generateReport(): string {
    const states = this.getAllStates();
    if (states.length === 0) {
      return 'No fallback mappings configured.';
    }

    const lines: string[] = [
      '# Tool Fallback Strategy Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      `Total mappings: ${states.length}`,
      '',
    ];

    for (const state of states) {
      lines.push(`## ${state.primaryTool}`);
      lines.push(`- Current Tool: ${state.currentTool}`);
      lines.push(`- Status: ${state.isDegraded ? 'DEGRADED' : 'NORMAL'}`);
      lines.push(`- Fallback Count: ${state.fallbackCount}`);
      lines.push(`- Recover Count: ${state.recoverCount}`);
      
      if (state.degradedAt) {
        lines.push(`- Last Degraded: ${new Date(state.degradedAt).toISOString()}`);
      }
      if (state.recoveredAt) {
        lines.push(`- Last Recovered: ${new Date(state.recoveredAt).toISOString()}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ===================== 导出 =====================

export const toolFallbackManager = new ToolFallbackManager();