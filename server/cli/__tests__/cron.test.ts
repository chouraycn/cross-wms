/**
 * CLI cron 命令测试
 *
 * 覆盖 registerCronCommand 的契约行为：
 * - 子命令注册（list/add/remove/run/history/pause/resume）
 * - 定时任务 CRUD 和生命周期管理
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerCronCommand } from '../commands/cron.js';

// mock logger
const { loggerMock } = vi.hoisted(() => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { loggerMock };
});

vi.mock('../../logger.js', () => ({ logger: loggerMock }));

describe('CLI cron 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerCronCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 cron 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'cron');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('定时任务');
  });

  it('包含 cr 别名', () => {
    const cmd = program.commands.find((c) => c.name() === 'cron')!;
    expect(cmd.aliases()).toContain('cr');
  });

  it('包含子命令 list/add/remove/run/history/pause/resume', () => {
    const cronCmd = program.commands.find((c) => c.name() === 'cron')!;
    const subNames = cronCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('add');
    expect(subNames).toContain('remove');
    expect(subNames).toContain('run');
    expect(subNames).toContain('history');
    expect(subNames).toContain('pause');
    expect(subNames).toContain('resume');
  });

  describe('list 子命令', () => {
    it('输出包含所有定时任务', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('每个任务都有 id/name/cron/task/paused 字段', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const job of parsed) {
        expect(job.id).toBeDefined();
        expect(job.name).toBeDefined();
        expect(job.cron).toBeDefined();
        expect(job.task).toBeDefined();
        expect(typeof job.paused).toBe('boolean');
      }
    });
  });

  describe('add 子命令', () => {
    it('添加任务返回完整任务对象', async () => {
      await program.parseAsync([
        'node', 'test', 'cron', 'add',
        '--name', '测试任务', '--cron', '0 * * * *', '--task', 'test:task',
        '--json',
      ]);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.id).toBeDefined();
      expect(parsed.name).toBe('测试任务');
      expect(parsed.cron).toBe('0 * * * *');
      expect(parsed.task).toBe('test:task');
    });
  });

  describe('remove 子命令', () => {
    it('删除存在的任务返回 success=true', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'remove', 'cron-003', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
    });

    it('删除不存在的任务返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'remove', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });
  });

  describe('run 子命令', () => {
    it('运行存在的任务返回 success=true', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'run', 'cron-001', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
      expect(typeof parsed.durationMs).toBe('number');
    });

    it('运行不存在的任务返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'run', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });
  });

  describe('history 子命令', () => {
    it('返回运行历史数组', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'history', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
    });

    it('按 jobId 过滤', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'history', 'cron-001', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.every((h: { jobId: string }) => h.jobId === 'cron-001')).toBe(true);
    });
  });

  describe('pause/resume 子命令', () => {
    it('暂停存在的任务返回 success=true', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'pause', 'cron-001', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
    });

    it('恢复存在的任务返回 success=true', async () => {
      // 先暂停
      await program.parseAsync(['node', 'test', 'cron', 'pause', 'cron-002']);
      outputs = [];
      await program.parseAsync(['node', 'test', 'cron', 'resume', 'cron-002', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
    });

    it('暂停不存在的任务返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'cron', 'pause', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 list', async () => {
      await program.parseAsync(['node', 'test', 'cron']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('定时任务');
    });
  });
});
