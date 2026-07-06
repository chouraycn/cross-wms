/**
 * CLI daemon 命令测试
 *
 * 覆盖 registerDaemonCommand 的契约行为：
 * - 子命令注册（start/stop/restart/status/install/uninstall）
 * - 守护进程生命周期管理
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerDaemonCommand } from '../commands/daemon.js';

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

  it('包含子命令 start/stop/restart/status/install/uninstall', () => {
    const daemonCmd = program.commands.find((c) => c.name() === 'daemon')!;
    const subNames = daemonCmd.commands.map((c) => c.name());
    expect(subNames).toContain('start');
    expect(subNames).toContain('stop');
    expect(subNames).toContain('restart');
    expect(subNames).toContain('status');
    expect(subNames).toContain('install');
    expect(subNames).toContain('uninstall');
  });

  describe('status 子命令', () => {
    it('返回 state/service/platform/restartCount 字段', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'status', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(['running', 'stopped', 'installed', 'not-installed']).toContain(parsed.state);
      expect(parsed.service).toBeDefined();
      expect(parsed.platform).toBeDefined();
      expect(typeof parsed.restartCount).toBe('number');
    });

    it('文本输出包含"守护进程状态"', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'status']);
      expect(outputs[0]).toContain('守护进程状态');
    });
  });

  describe('start 子命令', () => {
    it('启动后 state=running', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'start', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('running');
      expect(typeof parsed.pid).toBe('number');
    });

    it('重复启动保持 running', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'start']);
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'start', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('running');
    });
  });

  describe('stop 子命令', () => {
    it('停止后 state=stopped', async () => {
      // 先启动
      await program.parseAsync(['node', 'test', 'daemon', 'start']);
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'stop', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('stopped');
      expect(parsed.pid).toBeUndefined();
    });
  });

  describe('restart 子命令', () => {
    it('重启后 state=running 且 restartCount+1', async () => {
      // 先启动
      await program.parseAsync(['node', 'test', 'daemon', 'start', '--json']);
      const beforeCount = JSON.parse(outputs[0]).restartCount;
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'restart', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('running');
      expect(parsed.restartCount).toBe(beforeCount + 1);
    });
  });

  describe('install/uninstall 子命令', () => {
    it('安装后 state=installed', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'install', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('installed');
    });

    it('卸载后 state=not-installed', async () => {
      await program.parseAsync(['node', 'test', 'daemon', 'install']);
      outputs = [];
      await program.parseAsync(['node', 'test', 'daemon', 'uninstall', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('not-installed');
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 status', async () => {
      await program.parseAsync(['node', 'test', 'daemon']);
      expect(outputs[0]).toContain('守护进程状态');
    });
  });
});
