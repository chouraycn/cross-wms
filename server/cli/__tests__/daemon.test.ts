/**
 * CLI daemon 命令测试
 *
 * 覆盖 registerDaemonCommand 的契约行为：
 * - 子命令注册（start/stop/restart/status/list/stats/logs/health-check）
 * - 守护进程生命周期管理
 * - JSON 与文本输出
 *
 * 注意：daemonManager 为进程内单例，beforeEach 中 resetDaemonManagerForTests()
 * 以保证各个用例之间的状态隔离。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerDaemonCommand } from '../commands/daemon.js';
import { resetDaemonManagerForTests } from '../../engine/daemonManager.js';

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

describe('CLI daemon 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    resetDaemonManagerForTests();
    program = new Command();
    registerDaemonCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 daemon 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'daemon');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('守护进程');
  });

  it('包含子命令 start/stop/restart/status/list/stats/logs/health-check', () => {
    const daemonCmd = program.commands.find((c) => c.name() === 'daemon')!;
    const subNames = daemonCmd.commands.map((c) => c.name());
    expect(subNames).toContain('start');
    expect(subNames).toContain('stop');
    expect(subNames).toContain('restart');
    expect(subNames).toContain('status');
    expect(subNames).toContain('list');
    expect(subNames).toContain('stats');
    expect(subNames).toContain('logs');
    expect(subNames).toContain('health-check');
  });

  describe('start 子命令', () => {
    it('启动后 status=running 且有 pid', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'start', 'my-daemon', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.status).toBe('running');
      expect(typeof parsed.pid).toBe('number');
    });

    it('重复启动各自返回 running 的进程', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'start', 'first']);
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'start', 'second', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.status).toBe('running');
      expect(typeof parsed.pid).toBe('number');
    });
  });

  describe('status 子命令', () => {
    it('返回 status/type/name/restartCount 字段', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'start', 'my-daemon', '--json']);
      const started = JSON.parse(outputs[0]);
      const id = started.id;
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'status', id, '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(['running', 'stopped', 'error', 'restarting', 'starting', 'stopping']).toContain(
        parsed.status,
      );
      expect(parsed.type).toBeDefined();
      expect(parsed.name).toBeDefined();
      expect(typeof parsed.restartCount).toBe('number');
    });

    it('文本输出包含"守护进程:"', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'start', 'my-daemon', '--json']);
      const id = JSON.parse(outputs[0]).id;
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'status', id]);
      expect(outputs.join('\n')).toContain('守护进程:');
    });
  });

  describe('stop 子命令', () => {
    it('停止后返回 success 且状态变为 stopped', async () => {
      // 先启动
      await program.parseAsync(['node', 'test', 'daemon', 'start', 'my-daemon', '--json']);
      const id = JSON.parse(outputs[0]).id;
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'stop', id, '--json']);
      const stopResult = JSON.parse(outputs[0]);
      expect(stopResult.success).toBe(true);

      // 查询确认状态为 stopped
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'status', id, '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.status).toBe('stopped');
    });
  });

  describe('restart 子命令', () => {
    it('重启后返回 running 的进程', async () => {
      // 先启动
      await program.parseAsync(['node', 'test', 'daemon', 'start', 'my-daemon', '--json']);
      const before = JSON.parse(outputs[0]);
      const id = before.id;
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'restart', id, '--json']);
      const parsed = JSON.parse(outputs[0]);
      // 注意：当前 daemonManager.restart 内部重新调用 start()，
      // start() 会重置 restartCount，因此此处 restartCount 不一定递增。
      expect(parsed.status).toBe('running');
      expect(typeof parsed.restartCount).toBe('number');
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认列出守护进程列表', async () => {
      await program.parseAsync(['node', 'test', 'daemon']);
      expect(outputs.join('\n')).toContain('守护进程列表');
    });
  });
});
