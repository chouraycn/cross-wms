import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionLanes } from '../executionLanes.js';

describe('ExecutionLanes', () => {
  let lanes: ExecutionLanes;

  beforeEach(() => {
    lanes = new ExecutionLanes();
  });

  describe('默认容量', () => {
    it('cron 容量应为 5', () => {
      const status = lanes.getLaneStatus('cron');
      expect(status.capacity).toBe(5);
    });

    it('cron-nested 容量应为 1', () => {
      const status = lanes.getLaneStatus('cron-nested');
      expect(status.capacity).toBe(1);
    });

    it('subagent 容量应为 3', () => {
      const status = lanes.getLaneStatus('subagent');
      expect(status.capacity).toBe(3);
    });

    it('nested 容量应为 2', () => {
      const status = lanes.getLaneStatus('nested');
      expect(status.capacity).toBe(2);
    });

    it('未知车道默认容量应为 1', () => {
      const status = lanes.getLaneStatus('unknown');
      expect(status.capacity).toBe(1);
    });
  });

  describe('getLaneStatus 车道类型覆盖测试', () => {
    it('未使用的 cron 车道状态应全为 0', () => {
      const status = lanes.getLaneStatus('cron');
      expect(status).toEqual({ capacity: 5, used: 0, waiting: 0 });
    });

    it('未使用的 subagent 车道状态应全为 0', () => {
      const status = lanes.getLaneStatus('subagent');
      expect(status).toEqual({ capacity: 3, used: 0, waiting: 0 });
    });

    it('未使用的 nested 车道状态应全为 0', () => {
      const status = lanes.getLaneStatus('nested');
      expect(status).toEqual({ capacity: 2, used: 0, waiting: 0 });
    });

    it('未使用的 cron-nested 车道状态应全为 0', () => {
      const status = lanes.getLaneStatus('cron-nested');
      expect(status).toEqual({ capacity: 1, used: 0, waiting: 0 });
    });

    it('部分占用的 subagent 车道状态应正确反映 used', async () => {
      const t1 = await lanes.acquire('subagent');
      const status = lanes.getLaneStatus('subagent');
      expect(status.capacity).toBe(3);
      expect(status.used).toBe(1);
      expect(status.waiting).toBe(0);
      lanes.release('subagent', t1);
    });

    it('部分占用的 custom 车道（容量 1）状态应正确', async () => {
      const customLanes = new ExecutionLanes({ 'custom-lane': 1 });
      const t1 = await customLanes.acquire('custom-lane');
      const status = customLanes.getLaneStatus('custom-lane');
      expect(status.capacity).toBe(1);
      expect(status.used).toBe(1);
      expect(status.waiting).toBe(0);
      customLanes.release('custom-lane', t1);
    });

    it('getLaneStatus 不应影响实际状态（纯读操作）', () => {
      const before = lanes.getLaneStatus('cron');
      lanes.getLaneStatus('cron');
      lanes.getLaneStatus('cron');
      const after = lanes.getLaneStatus('cron');
      expect(after).toEqual(before);
    });
  });

  describe('acquire / release', () => {
    it('acquire 应返回释放函数', async () => {
      const token = await lanes.acquire('nested');
      expect(typeof token).toBe('function');
      lanes.release('nested', token);
    });

    it('获取后状态应更新', async () => {
      const token = await lanes.acquire('cron');
      const status = lanes.getLaneStatus('cron');
      expect(status.used).toBe(1);
      expect(status.waiting).toBe(0);
      lanes.release('cron', token);
    });

    it('释放后 used 应减少', async () => {
      const token = await lanes.acquire('cron');
      lanes.release('cron', token);
      const status = lanes.getLaneStatus('cron');
      expect(status.used).toBe(0);
    });

    it('超过容量时应排队等待', async () => {
      // nested 容量为 2
      const t1 = await lanes.acquire('nested');
      const t2 = await lanes.acquire('nested');

      let resolved = false;
      const p = lanes.acquire('nested').then((token) => {
        resolved = true;
        return token;
      });

      // 此时应处于等待状态
      const status = lanes.getLaneStatus('nested');
      expect(status.used).toBe(2);
      expect(status.waiting).toBe(1);
      expect(resolved).toBe(false);

      // 释放一个槽位后，等待的请求应被满足
      lanes.release('nested', t1);
      const token3 = await p;
      expect(resolved).toBe(true);
      expect(typeof token3).toBe('function');

      lanes.release('nested', t2);
      lanes.release('nested', token3);
    });

    it('多个排队应按顺序唤醒', async () => {
      // cron-nested 容量为 1
      const t1 = await lanes.acquire('cron-nested');

      const order: number[] = [];
      const p2 = lanes.acquire('cron-nested').then((t) => {
        order.push(2);
        return t;
      });
      const p3 = lanes.acquire('cron-nested').then((t) => {
        order.push(3);
        return t;
      });

      lanes.release('cron-nested', t1);
      const t2 = await p2;
      expect(order).toEqual([2]);

      lanes.release('cron-nested', t2);
      const t3 = await p3;
      expect(order).toEqual([2, 3]);

      lanes.release('cron-nested', t3);
    });

    it('acquire 超过 capacity（多层排队）应严格按 FIFO 顺序释放', async () => {
      // cron-nested 容量为 1，请求 5 个槽位
      const t1 = await lanes.acquire('cron-nested');

      const releaseOrder: number[] = [];
      const promises: Array<Promise<() => void>> = [];
      for (let i = 2; i <= 5; i++) {
        const idx = i;
        promises.push(
          lanes.acquire('cron-nested').then((token) => {
            releaseOrder.push(idx);
            return token;
          }),
        );
      }

      // 状态：1 个使用，4 个等待
      const status = lanes.getLaneStatus('cron-nested');
      expect(status.used).toBe(1);
      expect(status.waiting).toBe(4);

      // 依次释放，确保 FIFO 顺序
      lanes.release('cron-nested', t1);
      const t2 = await promises[0];
      expect(releaseOrder).toEqual([2]);

      lanes.release('cron-nested', t2);
      const t3 = await promises[1];
      expect(releaseOrder).toEqual([2, 3]);

      lanes.release('cron-nested', t3);
      const t4 = await promises[2];
      expect(releaseOrder).toEqual([2, 3, 4]);

      lanes.release('cron-nested', t4);
      const t5 = await promises[3];
      expect(releaseOrder).toEqual([2, 3, 4, 5]);

      // 清理
      lanes.release('cron-nested', t5);
      const finalStatus = lanes.getLaneStatus('cron-nested');
      expect(finalStatus.used).toBe(0);
      expect(finalStatus.waiting).toBe(0);
    });

    it('acquire 大量请求（超过容量 10 倍）应全部能完成', async () => {
      // nested 容量为 2，提交 20 个并发请求
      const total = 20;
      const capacity = 2;

      const completed: number[] = [];
      const promises: Array<Promise<void>> = [];

      for (let i = 0; i < total; i++) {
        const idx = i;
        promises.push(
          (async () => {
            const token = await lanes.acquire('nested');
            completed.push(idx);
            // 立即释放，让其他任务可以继续
            lanes.release('nested', token);
          })(),
        );
      }

      await Promise.all(promises);

      // 所有请求都应已完成
      expect(completed.length).toBe(total);
      // 没有重复
      expect(new Set(completed).size).toBe(total);

      // 全部释放后状态应归零
      const status = lanes.getLaneStatus('nested');
      expect(status.used).toBe(0);
      expect(status.waiting).toBe(0);
    });

    it('release 未知 token（未 acquire 的函数）应静默处理', () => {
      // 创建一个伪造的释放函数（来自另一个 ExecutionLanes 实例）
      const otherLanes = new ExecutionLanes();
      // 同步获取一个 token 用于伪造（注意 acquire 是 async）
      const fakeToken = () => {
        // 实际从未被调用的占位函数
      };

      // release 任意函数不应抛错（内部 release 仅为 token() 调用）
      expect(() => lanes.release('cron', fakeToken as any)).not.toThrow();
      // 状态应保持不变
      expect(lanes.getLaneStatus('cron').used).toBe(0);
    });

    it('release 同一 token 多次调用不应产生负数或异常', async () => {
      const token = await lanes.acquire('cron');
      lanes.release('cron', token);
      // 二次 release：在 internalRelease 中 sem.used <= 0 时直接 return
      expect(() => lanes.release('cron', token)).not.toThrow();
      // 状态仍应为 0
      expect(lanes.getLaneStatus('cron').used).toBe(0);
    });

    it('release 不存在的车道应不抛错', () => {
      const fakeToken = () => {};
      expect(() => lanes.release('non-existent-lane', fakeToken as any)).not.toThrow();
    });
  });

  describe('reset', () => {
    it('reset 应清空所有车道状态', async () => {
      const token = await lanes.acquire('subagent');
      expect(lanes.getLaneStatus('subagent').used).toBe(1);
      lanes.reset();
      expect(lanes.getLaneStatus('subagent').used).toBe(0);
      // 释放旧 token 不应抛异常
      lanes.release('subagent', token);
    });
  });
});
