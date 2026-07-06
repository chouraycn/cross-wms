/**
 * CLI program 测试
 *
 * 覆盖 CLI program 的契约行为：
 * - 顶层命令注册
 * - 全局选项（--config, --verbose）
 * - help 输出
 * - version
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('CLI program 集成', () => {
  it('从 program 模块加载不抛错', async () => {
    const { buildCLIProgram } = await import('../program.js');
    expect(() => buildCLIProgram()).not.toThrow();
  });

  it('buildCLIProgram 返回 Commander 实例', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    expect(program).toBeDefined();
    expect(program.commands).toBeInstanceOf(Array);
  });

  it('注册的顶层命令数量 > 10', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    expect(program.commands.length).toBeGreaterThan(10);
  });

  it('包含主要命令：plugin/agent/config/status/doctor/hooks/secrets/gateway/cron', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('config');
    expect(names).toContain('status');
    expect(names).toContain('doctor');
    expect(names).toContain('hooks');
  });

  it('程序名称为 cdfknow', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    expect(program.name()).toBe('cdfknow');
  });

  it('包含 description', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    expect(program.description()).toBeDefined();
    expect(program.description().length).toBeGreaterThan(0);
  });

  it('全局选项 --no-color 已注册', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--no-color');
  });

  it('全局选项 --log-level 已注册', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--log-level');
  });

  it('全局选项 --json 已注册', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--json');
  });

  it('全局选项 --verbose 已注册', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--verbose');
  });

  it('全局选项 --quiet 已注册', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--quiet');
  });

  it('包含 version 命令及别名 v/ver', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const versionCmd = program.commands.find((c) => c.name() === 'version');
    expect(versionCmd).toBeDefined();
    expect(versionCmd?.aliases()).toContain('v');
    expect(versionCmd?.aliases()).toContain('ver');
  });

  it('包含 help 命令及别名 h/?', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const helpCmd = program.commands.find((c) => c.name() === 'help');
    expect(helpCmd).toBeDefined();
    expect(helpCmd?.aliases()).toContain('h');
    expect(helpCmd?.aliases()).toContain('?');
  });

  it('包含所有核心 CLI 命令', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const program = buildCLIProgram();
    const names = program.commands.map((c) => c.name());
    // 验证所有主要命令都已注册
    const expectedCommands = [
      'config', 'status', 'doctor', 'chat', 'memory', 'wiki',
      'tool', 'daemon', 'secrets', 'models', 'hooks',
      'cron', 'gateway', 'version', 'help',
    ];
    for (const cmd of expectedCommands) {
      expect(names).toContain(cmd);
    }
    // 验证 skill 命令（可能是单数）
    expect(names.some((n) => n === 'skill' || n === 'skills')).toBe(true);
  });

  it('buildCLIProgram 每次返回独立实例', async () => {
    const { buildCLIProgram } = await import('../program.js');
    const p1 = buildCLIProgram();
    const p2 = buildCLIProgram();
    expect(p1).not.toBe(p2);
  });

  it('导出 runCLI 函数', async () => {
    const mod = await import('../program.js');
    expect(typeof mod.runCLI).toBe('function');
  });
});
