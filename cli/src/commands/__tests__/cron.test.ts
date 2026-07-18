import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { cronCommand } from '../cron.js';

describe('CLI cron command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('has correct command name and description', () => {
    expect(cronCommand.name()).toBe('cron');
    expect(cronCommand.description()).toContain('定时任务');
  });

  it('shows help output', async () => {
    const helpInformation = cronCommand.helpInformation();
    expect(helpInformation).toContain('list');
    expect(helpInformation).toContain('run');
    expect(helpInformation).toContain('logs');
  });

  it('list subcommand outputs job list', async () => {
    await cronCommand.parseAsync(['node', 'test', 'list']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('定时任务列表'))).toBe(true);
    expect(calls.some((line) => line.includes('共'))).toBe(true);
  });

  it('run subcommand outputs trigger message', async () => {
    await cronCommand.parseAsync(['node', 'test', 'run', 'cleanup-logs']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('cleanup-logs'))).toBe(true);
  });

  it('logs subcommand outputs log message', async () => {
    await cronCommand.parseAsync(['node', 'test', 'logs', 'cleanup-logs']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('cleanup-logs'))).toBe(true);
  });

  // ===================== 边界测试 =====================

  describe('无效 cron id 的边界测试', () => {
    it('run 一个不存在的任务 id 应不抛错（仅模拟触发）', async () => {
      await cronCommand.parseAsync(['node', 'test', 'run', 'non-existent-job-id-12345']);

      const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
      // triggerJob 始终输出模拟触发消息，不做存在性校验
      expect(calls.some((line) => line.includes('non-existent-job-id-12345'))).toBe(true);
      expect(calls.some((line) => line.includes('已手动触发'))).toBe(true);
    });

    it('logs 一个不存在的任务 id 应返回模拟日志', async () => {
      await cronCommand.parseAsync(['node', 'test', 'logs', 'no-such-job']);

      const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
      expect(calls.some((line) => line.includes('no-such-job'))).toBe(true);
    });

    it('run 空字符串 id 应不抛错', async () => {
      await cronCommand.parseAsync(['node', 'test', 'run', '']);

      const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
      // 应输出空 id 的触发消息
      expect(calls.length).toBeGreaterThan(0);
    });

    it('run 包含特殊字符的 id 应不抛错', async () => {
      const specialIds = [
        'job-with-dash',
        'job_with_underscore',
        'jobWithCamelCase',
        '中文任务ID',
        'job.with.dots',
      ];

      for (const id of specialIds) {
        await expect(
          cronCommand.parseAsync(['node', 'test', 'run', id]),
        ).resolves.toBeDefined();
      }
    });
  });

  describe('list 时的空数据测试', () => {
    let originalCwd: string;
    let tempDir: string;

    beforeEach(async () => {
      originalCwd = process.cwd();
      // 创建临时目录并在其中创建一个空的 logs 目录
      const os = await import('os');
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cron-empty-test-'));
      await fs.mkdir(path.join(tempDir, 'logs'), { recursive: true });
      // 写入一个空数组作为 cron-jobs.json
      await fs.writeFile(
        path.join(tempDir, 'logs', 'cron-jobs.json'),
        JSON.stringify([]),
        'utf-8',
      );
      process.chdir(tempDir);
    });

    afterEach(async () => {
      process.chdir(originalCwd);
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('持久化文件为空数组时 list 应回退到 mock 数据（现有实现行为）', async () => {
      // 重要：每次 parseAsync 之前需要清空 consoleSpy
      consoleSpy.mockClear();
      await cronCommand.parseAsync(['node', 'test', 'list']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      // 现有实现：当持久化为空数组时回退到 mock 数据（这是设计行为）
      // 因此应显示 mock 任务和"共 3 个任务"
      expect(calls.some((line) => line.includes('定时任务列表'))).toBe(true);
      // 至少应显示一个 mock 任务
      expect(calls.some((line) => line.includes('cleanup-logs'))).toBe(true);
    });

    it('持久化文件有任务时 list 应显示持久化的数据', async () => {
      // 覆盖空数据，改为写入单个任务
      await fs.writeFile(
        path.join(tempDir, 'logs', 'cron-jobs.json'),
        JSON.stringify([
          {
            id: 'only-one-job',
            name: '唯一的任务',
            cron: '0 * * * *',
            enabled: true,
            description: '测试持久化数据',
          },
        ]),
        'utf-8',
      );
      consoleSpy.mockClear();
      await cronCommand.parseAsync(['node', 'test', 'list']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      // 应显示持久化的任务
      expect(calls.some((line) => line.includes('only-one-job'))).toBe(true);
      expect(calls.some((line) => line.includes('唯一的任务'))).toBe(true);
      // 不应显示 mock 数据
      expect(calls.some((line) => line.includes('cleanup-logs'))).toBe(false);
    });

    it('持久化文件不存在时 list 应回退到 mock 数据', async () => {
      // 删除持久化文件
      await fs.unlink(path.join(tempDir, 'logs', 'cron-jobs.json')).catch(() => {});
      consoleSpy.mockClear();
      await cronCommand.parseAsync(['node', 'test', 'list']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      // 应显示 mock 任务
      expect(calls.some((line) => line.includes('cleanup-logs'))).toBe(true);
      expect(calls.some((line) => line.includes('sync-models'))).toBe(true);
    });
  });
});
