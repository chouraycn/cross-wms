/**
 * CLI gateway 命令测试
 *
 * 覆盖 registerGatewayCommand 的契约行为：
 * - 子命令注册（status/probe/models/resolve/info）
 * - 网关状态查询、探活、模型列表、模型解析、信息查看
 * - JSON 与文本输出
 *
 * 注意：本命令不负责启动/停止网关，而是对外部网关 HTTP 服务
 * (默认 http://localhost:7331) 进行查询。测试环境中无网关监听，
 * status.state 通常为 'stopped'，probe.reachable 通常为 false。
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

  it('包含子命令 status/probe/models/resolve/info', () => {
    const gatewayCmd = program.commands.find((c) => c.name() === 'gateway')!;
    const subNames = gatewayCmd.commands.map((c) => c.name());
    expect(subNames).toContain('status');
    expect(subNames).toContain('probe');
    expect(subNames).toContain('models');
    expect(subNames).toContain('resolve');
    expect(subNames).toContain('info');
  });

  describe('status 子命令', () => {
    it('返回 state/url/port/protocol/version 字段', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'status', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(['running', 'stopped']).toContain(parsed.state);
      expect(parsed.url).toContain('http://localhost:');
      expect(parsed.port).toBeGreaterThan(0);
      expect(parsed.protocol).toBeDefined();
      expect(parsed.version).toBeDefined();
    });

    it('文本输出包含"网关状态"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'status']);
      expect(outputs.join('\n')).toContain('网关状态');
    });
  });

  describe('probe 子命令', () => {
    it('返回 reachable/latencyMs 字段', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'probe', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(typeof parsed.reachable).toBe('boolean');
      expect(typeof parsed.latencyMs).toBe('number');
    });

    it('未启动时 reachable=false', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'probe', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.reachable).toBe(false);
    });

    it('文本输出包含"网关探活"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'probe']);
      expect(outputs.join('\n')).toContain('网关探活');
    });
  });

  describe('models 子命令', () => {
    it('返回模型数组或错误对象', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'models', '--json']);
      const parsed = JSON.parse(outputs[0]);
      // 网关不可达时返回 { error }，可达时返回数组
      expect(Array.isArray(parsed) || typeof parsed.error === 'string').toBe(true);
    });
  });

  describe('resolve 子命令', () => {
    it('返回 id/normalizedId/provider 字段', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'resolve', 'gpt-4', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.id).toBe('gpt-4');
      expect(typeof parsed.normalizedId).toBe('string');
      expect(typeof parsed.provider).toBe('string');
    });

    it('文本输出包含"模型解析"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'resolve', 'gpt-4']);
      expect(outputs.join('\n')).toContain('模型解析');
    });
  });

  describe('info 子命令', () => {
    it('返回 state/url/port/protocol/version/latency/reachable 字段', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'info', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(['running', 'stopped']).toContain(parsed.state);
      expect(parsed.url).toBeDefined();
      expect(typeof parsed.port).toBe('number');
      expect(parsed.protocol).toBeDefined();
      expect(parsed.version).toBeDefined();
      expect(typeof parsed.latency).toBe('number');
      expect(typeof parsed.reachable).toBe('boolean');
    });

    it('文本输出包含"网关信息"', async () => {
      await program.parseAsync(['node', 'test', 'gateway', 'info']);
      expect(outputs.join('\n')).toContain('网关信息');
    });
  });
});
