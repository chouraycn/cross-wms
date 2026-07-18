/**
 * 执行车道 — 并发限制管理
 *
 * 基于信号量的车道并发控制系统，为不同任务类型提供独立的并发配额。
 */

export interface LaneStatus {
  /** 车道总容量 */
  capacity: number;
  /** 已使用槽位 */
  used: number;
  /** 等待中请求数 */
  waiting: number;
}

/**
 * 执行车道并发管理器
 *
 * 为 cron、cron-nested、subagent、nested 等车道维护独立的信号量，
 * 通过 acquire / release 控制并发。
 */
export class ExecutionLanes {
  private capacities: Record<string, number>;
  private lanes: Map<
    string,
    {
      used: number;
      queue: Array<(releaseFn: () => void) => void>;
    }
  >;

  constructor(capacities?: Record<string, number>) {
    this.capacities = {
      cron: 5,
      'cron-nested': 1,
      subagent: 3,
      nested: 2,
      ...capacities,
    };
    this.lanes = new Map();
  }

  /**
   * 获取指定车道的容量配置
   * @param lane 车道名称
   * @returns 容量上限，默认为 1
   */
  private getCapacity(lane: string): number {
    return this.capacities[lane] ?? 1;
  }

  /**
   * 获取或初始化车道信号量
   * @param lane 车道名称
   */
  private getLane(lane: string) {
    let entry = this.lanes.get(lane);
    if (!entry) {
      entry = { used: 0, queue: [] };
      this.lanes.set(lane, entry);
    }
    return entry;
  }

  /**
   * 申请车道槽位
   *
   * 若车道未满，立即返回释放函数；否则进入等待队列，
   * 直到有槽位释放后 resolve。
   *
   * @param lane 车道名称
   * @returns Promise<释放函数>
   */
  async acquire(lane: string): Promise<() => void> {
    const capacity = this.getCapacity(lane);
    const sem = this.getLane(lane);

    if (sem.used < capacity) {
      sem.used++;
      return () => this.internalRelease(lane);
    }

    return new Promise<() => void>((resolve) => {
      sem.queue.push((releaseFn: () => void) => {
        resolve(releaseFn);
      });
    });
  }

  /**
   * 释放车道槽位
   *
   * 调用 token 函数完成释放，并唤醒等待队列中的下一个请求。
   *
   * @param lane 车道名称
   * @param token acquire 返回的释放函数
   */
  release(lane: string, token: () => void): void {
    token();
  }

  /**
   * 内部释放逻辑
   * @param lane 车道名称
   */
  private internalRelease(lane: string): void {
    const sem = this.lanes.get(lane);
    if (!sem || sem.used <= 0) return;

    sem.used--;

    if (sem.queue.length > 0) {
      const next = sem.queue.shift();
      if (next) {
        sem.used++;
        next(() => this.internalRelease(lane));
      }
    }
  }

  /**
   * 获取车道状态
   * @param lane 车道名称
   * @returns 车道状态快照
   */
  getLaneStatus(lane: string): LaneStatus {
    const capacity = this.getCapacity(lane);
    const sem = this.lanes.get(lane);
    if (!sem) {
      return { capacity, used: 0, waiting: 0 };
    }
    return {
      capacity,
      used: sem.used,
      waiting: sem.queue.length,
    };
  }

  /** 重置所有车道 */
  reset(): void {
    this.lanes.clear();
  }
}

/** 全局执行车道实例 */
export const executionLanes = new ExecutionLanes();
