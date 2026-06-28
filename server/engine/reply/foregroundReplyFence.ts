/**
 * Foreground Reply Fence
 * 前台回复栅栏 - 防止多条消息同时触发时旧回复覆盖新回复的竞态条件
 */

interface FenceState {
  generation: number;
  visibleDeliveryGeneration: number;
  activeGenerations: Map<number, number>;
  waiters: Set<() => void>;
}

const fencesByKey = new Map<string, FenceState>();

function notifyWaiters(state: FenceState): void {
  const waiters = [...state.waiters];
  state.waiters.clear();
  for (const resolve of waiters) {
    resolve();
  }
}

function hasNewerActiveGeneration(state: FenceState, generation: number): boolean {
  for (const [activeGeneration, count] of state.activeGenerations) {
    if (activeGeneration > generation && count > 0) {
      return true;
    }
  }
  return false;
}

function getOrCreateState(key: string): FenceState {
  let state = fencesByKey.get(key);
  if (!state) {
    state = {
      generation: 0,
      visibleDeliveryGeneration: 0,
      activeGenerations: new Map(),
      waiters: new Set(),
    };
    fencesByKey.set(key, state);
  }
  return state;
}

/**
 * 前台回复栅栏类
 * 用于管理回复世代，防止旧回复覆盖新回复的竞态条件
 */
export class ForegroundReplyFence {
  private readonly key: string;
  private currentGeneration: number = 0;

  constructor(key: string) {
    this.key = key;
  }

  /**
   * 开始新的回复世代
   * @returns 新的世代号
   */
  startGeneration(): number {
    const state = getOrCreateState(this.key);
    state.generation += 1;
    this.currentGeneration = state.generation;
    state.activeGenerations.set(
      state.generation,
      (state.activeGenerations.get(state.generation) ?? 0) + 1,
    );
    return state.generation;
  }

  /**
   * 检查世代是否仍然是当前世代
   * @param generation 世代号
   * @returns 是否为当前世代
   */
  isGenerationCurrent(generation: number): boolean {
    const state = fencesByKey.get(this.key);
    if (!state) {
      return false;
    }
    return !hasNewerActiveGeneration(state, generation);
  }

  /**
   * 抑制旧世代的可见投递
   * @param generation 当前世代号
   */
  suppressOlderGenerations(generation: number): void {
    const state = fencesByKey.get(this.key);
    if (!state) {
      return;
    }
    state.visibleDeliveryGeneration = Math.max(state.visibleDeliveryGeneration, generation);
    notifyWaiters(state);
  }

  /**
   * 等待世代被取代
   * @param generation 世代号
   * @returns Promise，在世代被取代时 resolve
   */
  async waitForSuperseded(generation: number): Promise<void> {
    while (true) {
      const state = fencesByKey.get(this.key);
      if (!state) {
        return;
      }
      if (state.visibleDeliveryGeneration > generation) {
        return;
      }
      if (!hasNewerActiveGeneration(state, generation)) {
        return;
      }
      await new Promise<void>((resolve) => {
        state.waiters.add(resolve);
      });
    }
  }

  /**
   * 检查是否应该取消该世代的投递
   * @param generation 世代号
   * @returns 是否应该取消
   */
  async shouldCancelDelivery(generation: number): Promise<boolean> {
    while (true) {
      const state = fencesByKey.get(this.key);
      if (!state) {
        return false;
      }
      if (state.visibleDeliveryGeneration > generation) {
        return true;
      }
      if (!hasNewerActiveGeneration(state, generation)) {
        return false;
      }
      await new Promise<void>((resolve) => {
        state.waiters.add(resolve);
      });
    }
  }

  /**
   * 标记世代已发送可见回复
   * @param generation 世代号
   */
  markVisibleSent(generation: number): void {
    const state = fencesByKey.get(this.key);
    if (!state) {
      return;
    }
    state.visibleDeliveryGeneration = Math.max(state.visibleDeliveryGeneration, generation);
    notifyWaiters(state);
  }

  /**
   * 检查是否有可见回复
   * @returns 是否有可见回复
   */
  hasVisibleReply(): boolean {
    const state = fencesByKey.get(this.key);
    if (!state) {
      return false;
    }
    return state.visibleDeliveryGeneration > 0;
  }

  /**
   * 结束世代
   * @param generation 世代号
   */
  endGeneration(generation: number): void {
    const state = fencesByKey.get(this.key);
    if (!state) {
      return;
    }
    const activeGenerationCount = state.activeGenerations.get(generation) ?? 0;
    if (activeGenerationCount <= 1) {
      state.activeGenerations.delete(generation);
    } else {
      state.activeGenerations.set(generation, activeGenerationCount - 1);
    }
    notifyWaiters(state);
    if (state.activeGenerations.size === 0) {
      fencesByKey.delete(this.key);
    }
  }

  /**
   * 获取当前最新世代号
   * @returns 当前最新世代号
   */
  getCurrentGeneration(): number {
    const state = fencesByKey.get(this.key);
    return state?.generation ?? 0;
  }

  /**
   * 获取可见投递的世代号
   * @returns 可见投递的世代号
   */
  getVisibleDeliveryGeneration(): number {
    const state = fencesByKey.get(this.key);
    return state?.visibleDeliveryGeneration ?? 0;
  }
}

/**
 * 全局前台回复栅栏管理器
 * 用于获取或创建指定 key 的栅栏实例
 */
class ForegroundReplyFenceManager {
  private readonly instances = new Map<string, ForegroundReplyFence>();

  /**
   * 获取或创建指定 key 的栅栏实例
   * @param key 栅栏键
   * @returns 栅栏实例
   */
  getFence(key: string): ForegroundReplyFence {
    let fence = this.instances.get(key);
    if (!fence) {
      fence = new ForegroundReplyFence(key);
      this.instances.set(key, fence);
    }
    return fence;
  }

  /**
   * 检查是否存在指定 key 的栅栏
   * @param key 栅栏键
   * @returns 是否存在
   */
  hasFence(key: string): boolean {
    return this.instances.has(key);
  }

  /**
   * 移除指定 key 的栅栏
   * @param key 栅栏键
   */
  removeFence(key: string): void {
    this.instances.delete(key);
  }

  /**
   * 清空所有栅栏
   */
  clear(): void {
    this.instances.clear();
    fencesByKey.clear();
  }
}

const FENCE_MANAGER_INSTANCE = new ForegroundReplyFenceManager();

export function getForegroundReplyFence(key: string): ForegroundReplyFence {
  return FENCE_MANAGER_INSTANCE.getFence(key);
}

export function resetForegroundReplyFenceForTests(): void {
  FENCE_MANAGER_INSTANCE.clear();
}

export type { ForegroundReplyFenceManager };
