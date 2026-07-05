/**
 * cronScheduler 单元测试
 *
 * 测试定时任务调度器的基本功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cronScheduler } from '../cronScheduler.js';

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../config/appPaths.js', () => ({
  AppPaths: {
    userDataDir: '/tmp/test-cron',
    rootDir: '/tmp/test-cron',
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('path', () => ({
  default: {
    join: (...args: string[]) => args.join('/'),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
  },
}));

describe('cronScheduler', () => {
  beforeEach(() => {
    cronScheduler.destroy();
  });

  describe('任务注册', () => {
    it('应能注册定时任务', async () => {
      await cronScheduler.init();

      let executed = false;
      cronScheduler.registerJob({
        id: 'test-job-1',
        name: '测试任务',
        cron: '0 * * * *',
        description: '每小时执行一次',
        handler: () => {
          executed = true;
        },
      });

      const jobs = cronScheduler.getJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].id).toBe('test-job-1');
      expect(jobs[0].name).toBe('测试任务');
      expect(jobs[0].cron).toBe('0 * * * *');
      expect(jobs[0].enabled).toBe(true);
      expect(executed).toBe(false);
    });

    it('应能注册多个任务', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'job-1',
        name: '任务1',
        cron: '0 * * * *',
        handler: () => {},
      });

      cronScheduler.registerJob({
        id: 'job-2',
        name: '任务2',
        cron: '0 0 * * *',
        handler: () => {},
      });

      const jobs = cronScheduler.getJobs();
      expect(jobs.length).toBe(2);
    });

    it('应能取消注册任务', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'to-remove',
        name: '待删除',
        cron: '* * * * *',
        handler: () => {},
      });

      expect(cronScheduler.getJobs().length).toBe(1);

      cronScheduler.unregisterJob('to-remove');
      expect(cronScheduler.getJobs().length).toBe(0);
    });

    it('重复注册相同 ID 的任务应更新', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'same-id',
        name: '旧名称',
        cron: '* * * * *',
        handler: () => {},
      });

      cronScheduler.registerJob({
        id: 'same-id',
        name: '新名称',
        cron: '0 * * * *',
        handler: () => {},
      });

      const jobs = cronScheduler.getJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].name).toBe('新名称');
      expect(jobs[0].cron).toBe('0 * * * *');
    });
  });

  describe('任务启用/禁用', () => {
    it('应能禁用任务', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'toggle-test',
        name: '切换测试',
        cron: '* * * * *',
        handler: () => {},
      });

      let jobs = cronScheduler.getJobs();
      expect(jobs[0].enabled).toBe(true);

      const result = cronScheduler.setJobEnabled('toggle-test', false);
      expect(result).toBe(true);

      jobs = cronScheduler.getJobs();
      expect(jobs[0].enabled).toBe(false);
    });

    it('应能启用任务', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'toggle-test-2',
        name: '切换测试',
        cron: '* * * * *',
        enabled: false,
        handler: () => {},
      });

      let jobs = cronScheduler.getJobs();
      expect(jobs[0].enabled).toBe(false);

      const result = cronScheduler.setJobEnabled('toggle-test-2', true);
      expect(result).toBe(true);

      jobs = cronScheduler.getJobs();
      expect(jobs[0].enabled).toBe(true);
    });

    it('操作不存在的任务应返回 false', async () => {
      await cronScheduler.init();

      const result = cronScheduler.setJobEnabled('non-existent', true);
      expect(result).toBe(false);
    });
  });

  describe('手动触发', () => {
    it('应能手动触发任务', async () => {
      await cronScheduler.init();

      let executed = false;
      cronScheduler.registerJob({
        id: 'manual-test',
        name: '手动触发测试',
        cron: '0 0 1 1 *',
        handler: () => {
          executed = true;
        },
      });

      await cronScheduler.triggerJob('manual-test');
      expect(executed).toBe(true);
    });

    it('应记录上次运行时间', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'last-run-test',
        name: '上次运行测试',
        cron: '0 0 1 1 *',
        handler: () => {},
      });

      const before = cronScheduler.getJobs()[0];
      expect(before.lastRunAt).toBeUndefined();

      await cronScheduler.triggerJob('last-run-test');

      const after = cronScheduler.getJobs()[0];
      expect(after.lastRunAt).toBeDefined();
    });
  });

  describe('错误处理', () => {
    it('任务执行失败不应导致调度器崩溃', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'error-test',
        name: '错误测试',
        cron: '0 0 1 1 *',
        handler: () => {
          throw new Error('故意的测试错误');
        },
      });

      // 不应该抛出异常
      await expect(cronScheduler.triggerJob('error-test')).resolves.not.toThrow();

      const jobs = cronScheduler.getJobs();
      expect(jobs[0].lastError).toBe('故意的测试错误');
    });

    it('应支持重试机制', async () => {
      await cronScheduler.init();

      let attemptCount = 0;
      const jobId = 'retry-test-' + Date.now();
      cronScheduler.registerJob({
        id: jobId,
        name: '重试测试',
        cron: '0 0 1 1 *',
        maxRetries: 2,
        retryDelayMs: 10,
        handler: () => {
          attemptCount++;
          throw new Error(`错误 ${attemptCount}`);
        },
      });

      await cronScheduler.triggerJob(jobId);
      expect(attemptCount).toBe(3); // 1 次初始 + 2 次重试
    });
  });

  describe('getJobs', () => {
    it('应返回所有任务的状态', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'status-test',
        name: '状态测试',
        cron: '0 * * * *',
        description: '测试任务描述',
        handler: () => {},
      });

      const jobs = cronScheduler.getJobs();
      expect(jobs[0]).toHaveProperty('id');
      expect(jobs[0]).toHaveProperty('name');
      expect(jobs[0]).toHaveProperty('cron');
      expect(jobs[0]).toHaveProperty('enabled');
      expect(jobs[0]).toHaveProperty('description');
      expect(jobs[0]).toHaveProperty('lastRunAt');
      expect(jobs[0]).toHaveProperty('nextRunAt');
      expect(jobs[0]).toHaveProperty('lastError');
    });
  });

  describe('销毁', () => {
    it('销毁后应清除所有任务', async () => {
      await cronScheduler.init();

      cronScheduler.registerJob({
        id: 'destroy-test',
        name: '销毁测试',
        cron: '* * * * *',
        handler: () => {},
      });

      expect(cronScheduler.getJobs().length).toBe(1);

      cronScheduler.destroy();
      expect(cronScheduler.getJobs().length).toBe(0);
    });
  });
});
