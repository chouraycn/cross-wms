/**
 * Compaction Hooks - 压缩钩子系统
 *
 * 提供压缩前后的生命周期钩子机制
 */
import { logger } from '../logger.js';

/** 压缩钩子阶段 */
export type CompactionHookPhase = 'before' | 'after';

/** 压缩指标 */
export interface CompactionMetrics {
  messageCount: number;
  tokenCount?: number;
  compactedCount: number;
  sessionId?: string;
  sessionKey?: string;
  sessionFile?: string;
  reason?: string;
}

/** 压缩上下文 */
export interface CompactionContext {
  sessionId?: string;
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
  messageProvider?: string;
}

/** 压缩钩子处理器 */
export type CompactionHookHandler = (
  metrics: CompactionMetrics,
  context: CompactionContext,
) => void | Promise<void>;

/** 压缩钩子 */
export interface CompactionHook {
  id: string;
  phase: CompactionHookPhase;
  handler: CompactionHookHandler;
  priority: number;
}

/** 压缩钩子管理器 */
export class CompactionHookManager {
  private hooks: Map<CompactionHookPhase, CompactionHook[]> = new Map();
  private hookIdCounter = 0;

  constructor() {
    this.hooks.set('before', []);
    this.hooks.set('after', []);
  }

  /**
   * 添加压缩钩子
   */
  addHook(
    phase: CompactionHookPhase,
    handler: CompactionHookHandler,
    priority: number = 0,
  ): string {
    const id = `hook_${++this.hookIdCounter}`;
    const hook: CompactionHook = { id, phase, handler, priority };

    const phaseHooks = this.hooks.get(phase)!;
    phaseHooks.push(hook);

    // 按优先级排序（高优先级在前）
    phaseHooks.sort((a, b) => b.priority - a.priority);

    logger.debug(`[CompactionHooks] Added ${phase} hook: ${id}, priority=${priority}`);

    return id;
  }

  /**
   * 移除压缩钩子
   */
  removeHook(hookId: string): boolean {
    for (const [_phase, hooks] of this.hooks) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
        logger.debug(`[CompactionHooks] Removed hook: ${hookId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * 获取钩子数量
   */
  getHookCount(phase?: CompactionHookPhase): number {
    if (phase) {
      return this.hooks.get(phase)?.length ?? 0;
    }
    return Array.from(this.hooks.values()).reduce((sum, h) => sum + h.length, 0);
  }

  /**
   * 运行 before 钩子
   */
  async runBeforeHooks(
    metrics: CompactionMetrics,
    context: CompactionContext,
  ): Promise<void> {
    const hooks = this.hooks.get('before') ?? [];
    logger.debug(`[CompactionHooks] Running ${hooks.length} before hooks`);

    for (const hook of hooks) {
      try {
        await hook.handler(metrics, context);
      } catch (err) {
        logger.error(
          `[CompactionHooks] Before hook ${hook.id} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  /**
   * 运行 after 钩子
   */
  async runAfterHooks(
    metrics: CompactionMetrics,
    context: CompactionContext,
  ): Promise<void> {
    const hooks = this.hooks.get('after') ?? [];
    logger.debug(`[CompactionHooks] Running ${hooks.length} after hooks`);

    for (const hook of hooks) {
      try {
        await hook.handler(metrics, context);
      } catch (err) {
        logger.error(
          `[CompactionHooks] After hook ${hook.id} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  /**
   * 清空所有钩子
   */
  clear(): void {
    this.hooks.get('before')?.splice(0);
    this.hooks.get('after')?.splice(0);
    logger.debug('[CompactionHooks] Cleared all hooks');
  }

  /**
   * 创建默认钩子管理器实例
   */
  static createDefault(): CompactionHookManager {
    return new CompactionHookManager();
  }
}

/** 全局钩子管理器实例 */
let globalHookManager: CompactionHookManager | null = null;

/**
 * 获取全局钩子管理器
 */
export function getGlobalCompactionHookManager(): CompactionHookManager {
  if (!globalHookManager) {
    globalHookManager = CompactionHookManager.createDefault();
  }
  return globalHookManager;
}

/**
 * 设置全局钩子管理器
 */
export function setGlobalCompactionHookManager(manager: CompactionHookManager): void {
  globalHookManager = manager;
}

/**
 * 创建压缩钩子构建器
 */
export function createCompactionHooks(): CompactionHookManager {
  return CompactionHookManager.createDefault();
}

/**
 * 创建日志钩子（用于调试）
 */
export function createLoggingHook(
  phase: CompactionHookPhase,
  loggerFn: (metrics: CompactionMetrics, context: CompactionContext) => void = defaultLogger,
): CompactionHookHandler {
  return async (metrics, context) => {
    loggerFn(metrics, context);
  };
}

function defaultLogger(metrics: CompactionMetrics, context: CompactionContext): void {
  const phase = metrics.compactedCount > 0 ? 'compacted' : 'skipped';
  logger.debug(
    `[CompactionHooks] ${phase}: messages=${metrics.messageCount}, ` +
    `compacted=${metrics.compactedCount}, session=${context.sessionId}`,
  );
}

/**
 * 创建记忆同步钩子
 */
export function createMemorySyncHook(
  syncFn: (sessionFile: string, reason: string) => Promise<void>,
): CompactionHookHandler {
  return async (metrics, context) => {
    if (metrics.sessionFile && metrics.compactedCount > 0) {
      try {
        await syncFn(metrics.sessionFile, 'post-compaction');
        logger.debug(`[CompactionHooks] Memory sync completed for ${context.sessionId}`);
      } catch (err) {
        logger.warn(
          `[CompactionHooks] Memory sync failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  };
}

/**
 * 创建转录本更新钩子
 */
export function createTranscriptUpdateHook(
  updateFn: (sessionFile: string) => Promise<void>,
): CompactionHookHandler {
  return async (metrics, context) => {
    if (metrics.sessionFile) {
      try {
        await updateFn(metrics.sessionFile);
        logger.debug(`[CompactionHooks] Transcript updated for ${context.sessionId}`);
      } catch (err) {
        logger.warn(
          `[CompactionHooks] Transcript update failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  };
}
