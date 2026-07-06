/**
 * CLI gateway 命令测试
 *
 * 覆盖 registerGatewayCommand 的契约行为：
 * - 子命令注册（start/stop/status/probe/info）
 * - 启动/停止网关、状态查询、探活、信息查看
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerGatewayCommand } from '../commands/gateway.js';

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

describe('CLI gateway 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerGatewayCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 gateway 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'gateway');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('网关');
  });

  it('包含子命令 start/stop/status/probe/info', () => {
    const gatewayCmd = program.commands.find((c) => c.name() === 'gateway')!;
    const subNames = gatewayCmd.commands.map((c) => c.name());
    expect(subNames).toContain('start');
    expect(subNames).toContain('stop');
    expect(subNames).toContain('status');
    expect(subNames).toContain('probe');
    expect(subNames).toContain('info');
  });

  describe('start 子命令', () => {
    it('启动网关后 state 为 running', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'start', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('running');
      expect(parsed.url).toMatch(/ws:\/\/localhost:/);
      expect(parsed.port).toBeGreaterThan(0);
      expect(parsed.pid).toBeGreaterThan(0);
      expect(parsed.startedAt).toBeDefined();
    });

    it('--port 选项被解析', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'start', '--port', '9999', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.port).toBe(9999);
      expect(parsed.url).toContain('9999');
    });

    it('启动后通道列表非空', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'start', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.channels.length).toBeGreaterThan(0);
    });

    it('文本输出包含"网关已启动"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'start']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('网关已启动');
    });
  });

  describe('stop 子命令', () => {
    it('停止网关后 state 为 stopped', async () => {
      // 先启动
      await program.parseAsync(['node', 'test', 'gateway', 'start', '--json']);
      outputs = [];
      // 再停止
      await program.parseAsync(['node', 'test', 'gateway', 'stop', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.state).toBe('stopped');
      expect(parsed.channels).toEqual([]);
    });

    it('文本输出包含"网关已停止"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'stop']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('网关已停止');
    });
  });

  describe('status 子命令', () => {
    it('返回 state/url/port/channels 字段', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'status', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(['running', 'stopped', 'error']).toContain(parsed.state);
      expect(parsed.url).toBeDefined();
      expect(parsed.port).toBeGreaterThan(0);
      expect(parsed.channels).toBeInstanceOf(Array);
    });

    it('文本输出包含"网关状态"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'status']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('网关状态');
    });
  });

  describe('probe 子命令', () => {
    it('返回 reachable/latencyMs/auth/channels 字段', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'probe', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(typeof parsed.reachable).toBe('boolean');
      expect(typeof parsed.latencyMs).toBe('number');
      expect(['ok', 'missing', 'denied']).toContain(parsed.auth);
      expect(typeof parsed.channels).toBe('number');
    });

    it('未启动时 reachable=false', async () => {
      // 先确保是 stopped 状态
      await program.parseAsync(['node', 'test', 'gateway', 'stop']);
      outputs = [];
      await program.parseAsync(['node', 'test', 'gateway', 'probe', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.reachable).toBe(false);
    });

    it('启动后 reachable=true', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'start']);
      outputs = [];
      await program.parseAsync(['node', 'test', 'gateway', 'probe', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.reachable).toBe(true);
      expect(parsed.auth).toBe('ok');
    });

    it('文本输出包含"网关探活"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'probe']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('网关探活');
    });
  });

  describe('info 子命令', () => {
    it('返回 version/protocol/maxConnections/activeConnections/uptime', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'info', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.version).toBeDefined();
      expect(parsed.protocol).toBeDefined();
      expect(typeof parsed.maxConnections).toBe('number');
      expect(typeof parsed.activeConnections).toBe('number');
      expect(parsed.uptime).toBeDefined();
    });

    it('文本输出包含"网关信息"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'info']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('网关信息');
    });
  });
});
