/**
 * CLI status 命令测试
 *
 * 覆盖 registerStatusCommand 的契约行为：
 * - 命令注册（名称、别名、选项）
 * - JSON 输出格式
 * - 文本输出格式
 * - 数据结构正确性
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerStatusCommand } from '../commands/status.js';

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

describe('CLI status 命令 Contract', () => {
  let program: Command;
  let lastOutput: string;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerStatusCommand(program);
    loggerMock.info.mockImplementation((msg: string) => {
      lastOutput = msg;
    });
    lastOutput = '';
  });

  it('注册名为 status 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'status');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('Gateway');
  });

  it('包含 st 别名', () => {
    const cmd = program.commands.find((c) => c.name() === 'status')!;
    expect(cmd.aliases()).toContain('st');
  });

  it('--json 选项存在', () => {
    const cmd = program.commands.find((c) => c.name() === 'status')!;
    const jsonOpt = cmd.options.find((o) => o.long === '--json');
    expect(jsonOpt).toBeDefined();
  });

  describe('JSON 输出', () => {
    it('输出包含 uptime/memory/active_sessions 等字段', async () => {
      await program.parseAsync(['node', 'test', 'status', '--json']);
      const parsed = JSON.parse(lastOutput);
      expect(parsed.uptime).toBeDefined();
      expect(parsed.memory).toBeDefined();
      expect(parsed.memory.used_mb).toBeGreaterThan(0);
      expect(parsed.memory.total_mb).toBeGreaterThan(0);
      expect(typeof parsed.active_sessions).toBe('number');
      expect(typeof parsed.active_cron_jobs).toBe('number');
      expect(typeof parsed.active_agents).toBe('number');
      expect(typeof parsed.enabled_plugins).toBe('number');
      expect(typeof parsed.online_nodes).toBe('number');
      expect(parsed.channels).toBeInstanceOf(Array);
    });

    it('每个 channel 都有 name/status/lastHeartbeat', async () => {
      await program.parseAsync(['node', 'test', 'status', '--json']);
      const parsed = JSON.parse(lastOutput);
      for (const ch of parsed.channels) {
        expect(ch.name).toBeDefined();
        expect(['online', 'offline', 'error']).toContain(ch.status);
        expect(ch.lastHeartbeat).toBeDefined();
      }
    });
  });

  describe('文本输出', () => {
    it('输出包含"系统状态"和"通道状态"小节', async () => {
      await program.parseAsync(['node', 'test', 'status']);
      expect(lastOutput).toContain('系统状态');
      expect(lastOutput).toContain('通道状态');
    });

    it('显示运行时间和内存使用', async () => {
      await program.parseAsync(['node', 'test', 'status']);
      expect(lastOutput).toContain('运行时间');
      expect(lastOutput).toContain('内存使用');
    });

    it('显示会话/任务/代理/插件/节点统计', async () => {
      await program.parseAsync(['node', 'test', 'status']);
      expect(lastOutput).toContain('活跃会话');
      expect(lastOutput).toContain('定时任务');
      expect(lastOutput).toContain('子代理');
      expect(lastOutput).toContain('插件');
      expect(lastOutput).toContain('节点');
    });

    it('为每个 channel 显示状态图标', async () => {
      await program.parseAsync(['node', 'test', 'status']);
      expect(/[✓✗!]/.test(lastOutput)).toBe(true);
    });
  });
});
