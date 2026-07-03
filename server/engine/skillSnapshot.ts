/**
 * Skill 快照版本化与变更监听系统
 *
 * 参考 OpenClaw 的 skills/runtime/refresh-state.ts 实现。
 *
 * 职责：
 * 1. 维护全局版本号与工作区版本号，用于判断 Skills 快照是否需要刷新
 * 2. 在 Skills 发生变更时递增版本号并通知监听器
 * 3. 提供缓存失效判定（shouldRefreshSnapshot），让上层避免重复构建快照
 *
 * 与 skillVersionTracker.ts 的区别：
 * - skillVersionTracker 关注单个 Skill 内容哈希（细粒度）
 * - skillSnapshot 关注整体快照版本（粗粒度），驱动 Prompt 缓存失效
 */

import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 变更事件原因 */
export type SkillsChangeReason =
  | 'watch'
  | 'watch-targets'
  | 'manual'
  | 'remote-node'
  | 'config-change'
  | 'workshop';

/** 变更事件 */
export interface SkillsChangeEvent {
  reason: SkillsChangeReason;
  workspacePath?: string;
  previousVersion: number;
  currentVersion: number;
  timestamp: number;
}

/** 变更监听器 */
export type SkillsChangeListener = (event: SkillsChangeEvent) => void;

/** 错误处理器 */
export type SkillsChangeErrorHandler = (err: Error) => void;

/** 快照版本状态 */
export interface SkillsSnapshotState {
  globalVersion: number;
  workspaceVersions: Map<string, number>;
  lastChangeReason: SkillsChangeReason | null;
  lastChangeAt: number | null;
}

/** 统计信息 */
export interface SkillsSnapshotStats {
  globalVersion: number;
  workspaceCount: number;
  listenerCount: number;
  lastChangeReason: string | null;
  lastChangeAt: number | null;
}

// ===================== 常量 =====================

/** Skills prompt 格式版本（用于缓存失效） */
export const WORKSPACE_SKILLS_PROMPT_FORMAT_VERSION = 1;

// ===================== SkillSnapshotManager 类 =====================

/**
 * Skill 快照管理器
 *
 * 维护全局与工作区级别的版本号，并在变更时通知监听器。
 * 通过版本号比对来判定是否需要重新构建 Skills 快照。
 */
export class SkillSnapshotManager {
  private state: SkillsSnapshotState = {
    globalVersion: 0,
    workspaceVersions: new Map(),
    lastChangeReason: null,
    lastChangeAt: null,
  };

  private listeners: Set<SkillsChangeListener> = new Set();
  private errorHandlers: Set<SkillsChangeErrorHandler> = new Set();

  // ===================== 1. 版本查询 =====================

  /**
   * 获取当前全局版本号
   */
  getGlobalVersion(): number {
    return this.state.globalVersion;
  }

  /**
   * 获取工作区版本号
   *
   * 未记录的工作区返回 0。
   *
   * @param workspacePath - 工作区路径
   */
  getWorkspaceVersion(workspacePath: string): number {
    return this.state.workspaceVersions.get(workspacePath) ?? 0;
  }

  // ===================== 2. 版本变更 =====================

  /**
   * 触发版本变更
   *
   * - 递增全局版本号
   * - 如果提供了 workspacePath，递增该工作区的版本号
   * - 记录变更原因和时间
   * - 创建 SkillsChangeEvent 并通知所有监听器
   * - 监听器抛出的异常会路由到错误处理器，不会中断其他监听器
   *
   * @param reason - 变更原因
   * @param workspacePath - 工作区路径（可选）
   * @returns 变更事件
   */
  bumpVersion(reason: SkillsChangeReason, workspacePath?: string): SkillsChangeEvent {
    const previousVersion = this.state.globalVersion;
    const currentVersion = previousVersion + 1;

    this.state.globalVersion = currentVersion;

    if (workspacePath) {
      const prevWsVersion = this.state.workspaceVersions.get(workspacePath) ?? 0;
      this.state.workspaceVersions.set(workspacePath, prevWsVersion + 1);
    }

    this.state.lastChangeReason = reason;
    this.state.lastChangeAt = Date.now();

    const event: SkillsChangeEvent = {
      reason,
      workspacePath,
      previousVersion,
      currentVersion,
      timestamp: this.state.lastChangeAt,
    };

    this.notifyListeners(event);

    logger.debug(
      `[SkillSnapshot] version bumped: ${previousVersion} -> ${currentVersion} (reason=${reason}, workspace=${
        workspacePath ?? '-'
      })`,
    );

    return event;
  }

  // ===================== 3. 刷新判定 =====================

  /**
   * 检查是否需要刷新快照
   *
   * - 如果 workspacePath 为空，比较 cachedVersion 与 globalVersion
   * - 如果提供了 workspacePath，比较 cachedVersion 与该工作区的版本号
   * - 版本号不匹配则返回 true（需要刷新）
   *
   * @param cachedVersion - 调用方缓存的版本号
   * @param workspacePath - 工作区路径（可选）
   */
  shouldRefreshSnapshot(cachedVersion: number, workspacePath?: string): boolean {
    const currentVersion = workspacePath
      ? this.getWorkspaceVersion(workspacePath)
      : this.state.globalVersion;

    return cachedVersion !== currentVersion;
  }

  /**
   * 清除工作区版本号（保留待处理失效）
   *
   * 删除工作区版本号但保留全局版本号。
   * 这样后续的 shouldRefreshSnapshot 会返回 true（因为工作区版本号被清除为 0，
   * 与之前缓存的工作区版本号不匹配，缓存失效）。
   *
   * @param workspacePath - 工作区路径
   */
  clearWorkspaceVersion(workspacePath: string): void {
    if (this.state.workspaceVersions.has(workspacePath)) {
      this.state.workspaceVersions.delete(workspacePath);
      logger.debug(`[SkillSnapshot] workspace version cleared: ${workspacePath}`);
    }
  }

  // ===================== 4. 监听器与错误处理器 =====================

  /**
   * 注册变更监听器
   *
   * @returns 取消注册函数
   */
  registerListener(listener: SkillsChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 注册错误处理器
   *
   * 当变更监听器抛出异常时，错误会被路由到错误处理器，而不是中断通知流程。
   *
   * @returns 取消注册函数
   */
  registerErrorHandler(handler: SkillsChangeErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  /**
   * 通知所有监听器
   *
   * 单个监听器抛出的异常不会中断其他监听器，而是路由到错误处理器。
   * 如果没有错误处理器，则记录到日志。
   */
  private notifyListeners(event: SkillsChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (this.errorHandlers.size > 0) {
          for (const handler of this.errorHandlers) {
            try {
              handler(error);
            } catch (handlerErr) {
              logger.error('[SkillSnapshot] error handler threw:', handlerErr);
            }
          }
        } else {
          logger.error('[SkillSnapshot] listener threw:', error);
        }
      }
    }
  }

  // ===================== 5. 状态查询 =====================

  /**
   * 获取状态快照（不可变副本）
   *
   * 返回状态对象的深拷贝，调用方修改不会影响内部状态。
   */
  getState(): SkillsSnapshotState {
    return {
      globalVersion: this.state.globalVersion,
      workspaceVersions: new Map(this.state.workspaceVersions),
      lastChangeReason: this.state.lastChangeReason,
      lastChangeAt: this.state.lastChangeAt,
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): SkillsSnapshotStats {
    return {
      globalVersion: this.state.globalVersion,
      workspaceCount: this.state.workspaceVersions.size,
      listenerCount: this.listeners.size,
      lastChangeReason: this.state.lastChangeReason,
      lastChangeAt: this.state.lastChangeAt,
    };
  }

  // ===================== 6. 重置 =====================

  /**
   * 重置状态
   *
   * 清空所有版本号、监听器与错误处理器。主要用于测试场景。
   */
  reset(): void {
    this.state = {
      globalVersion: 0,
      workspaceVersions: new Map(),
      lastChangeReason: null,
      lastChangeAt: null,
    };
    this.listeners.clear();
    this.errorHandlers.clear();
    logger.debug('[SkillSnapshot] state reset');
  }
}

// ===================== Module-level Singleton =====================

/** Skill 快照管理器单例 */
export const skillSnapshotManager = new SkillSnapshotManager();
