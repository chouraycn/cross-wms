/**
 * Skill Execution Lanes 单元测试
 *
 * 测试 Skill 并发控制与执行通道系统。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillExecutionLanes } from '../engine/skillExecutionLanes.js';
import type { SkillResult, SkillContext } from '../types/skill-runtime.js';

function createMockContext(skillId: string): SkillContext {
  return {
    skillId,
    sessionId: 'test-session',
    workspace: '/tmp',
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    sandbox: {
      checkPath: () => ({ allowed: true }),
      checkNetwork: () => ({ allowed: true }),
      checkCommand: () => ({ allowed: true }),
    },
    cache: {
      get: () => undefined,
      set: () => {},
      del: () => {},
    },
    lock: {
      acquire: async () => true,
      release: async () => {},
    },
    creds: {
      load: async () => ({}),
    },
  };
}

describe('SkillExecutionLanes', () => {
  let lanes: SkillExecutionLanes;

  beforeEach(() => {
    lanes = new SkillExecutionLanes();
  });

  describe('初始化', () => {
    it('应正确初始化所有通道', () => {
      const statuses = lanes.getAllStatuses();
      expect(Object.keys(statuses)).toContain('cron');
      expect(Object.keys(statuses)).toContain('subagent');
      expect(Object.keys(statuses)).toContain('nested');
      expect(Object.keys(statuses)).toContain('default');
    });

    it('默认通道应无并发限制', () => {
      const status = lanes.getLaneStatus('default');
      expect(status.maxConcurrency).toBe(0);
    });
  });

  describe('任务提交', () => {
    it('default 通道应立即执行任务', async () => {
      const result = await lanes.submit(
        'default',
        'test_skill',
        async () => ({ success: true, data: 'hello' }),
        createMockContext('test_skill'),
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('应正确处理执行失败', async () => {
      const result = await lanes.submit(
        'default',
        'fail_skill',
        async () => ({ success: false, error: 'test error' }),
        createMockContext('fail_skill'),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('test error');
    });

    it('应正确处理异常', async () => {
      const result = await lanes.submit(
        'default',
        'throw_skill',
        async () => {
          throw new Error('test exception');
        },
        createMockContext('throw_skill'),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('test exception');
    });
  });

  describe('并发控制', () => {
    it('cron 通道应限制并发数为 5', () => {
      const status = lanes.getLaneStatus('cron');
      expect(status.maxConcurrency).toBe(5);
    });

    it('subagent 通道应限制并发数为 3', () => {
      const status = lanes.getLaneStatus('subagent');
      expect(status.maxConcurrency).toBe(3);
    });

    it('nested 通道应限制并发数为 2', () => {
      const status = lanes.getLaneStatus('nested');
      expect(status.maxConcurrency).toBe(2);
    });
  });

  describe('通道配置', () => {
    it('应支持更新通道配置', () => {
      lanes.updateLaneConfig('cron', { maxConcurrency: 10 });
      const config = lanes.getLaneConfig('cron');
      expect(config.maxConcurrency).toBe(10);
    });

    it('应支持获取通道配置', () => {
      const config = lanes.getLaneConfig('cron');
      expect(config.maxConcurrency).toBe(5);
      expect(config.maxQueueSize).toBeGreaterThan(0);
    });
  });

  describe('队列管理', () => {
    it('应支持清空队列', () => {
      const cleared = lanes.clearQueue('cron');
      expect(cleared).toBe(0); // 初始队列为空
    });

    it('应支持清空所有队列', () => {
      const cleared = lanes.clearAllQueues();
      expect(typeof cleared).toBe('number');
    });
  });

  describe('统计信息', () => {
    it('应返回正确的统计信息', async () => {
      await lanes.submit(
        'default',
        'test1',
        async () => ({ success: true }),
        createMockContext('test1'),
      );

      await lanes.submit(
        'default',
        'test2',
        async () => ({ success: false, error: 'fail' }),
        createMockContext('test2'),
      );

      const stats = lanes.getStats();
      expect(stats.totalCompleted).toBeGreaterThanOrEqual(1);
      expect(stats.totalFailed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('通道状态', () => {
    it('应返回正确的通道状态', () => {
      const status = lanes.getLaneStatus('cron');
      expect(status.running).toBe(0);
      expect(status.queued).toBe(0);
      expect(status.completed).toBe(0);
      expect(status.failed).toBe(0);
    });
  });
});
