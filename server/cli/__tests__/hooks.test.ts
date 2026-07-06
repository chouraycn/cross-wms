/**
 * CLI hooks 命令测试
 *
 * 覆盖 registerHooksCommand 的契约行为：
 * - 子命令注册（list/enable/disable/reload/info）
 * - 钩子列表、启用/禁用、详情、重新加载
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerHooksCommand } from '../commands/hooks.js';

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

describe('CLI hooks 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerHooksCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 hooks 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'hooks');
    expect(cmd).toBeDefined();
  });

  it('包含子命令 list/enable/disable/reload/info', () => {
    const hooksCmd = program.commands.find((c) => c.name() === 'hooks')!;
    const subNames = hooksCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('enable');
    expect(subNames).toContain('disable');
    expect(subNames).toContain('reload');
    expect(subNames).toContain('info');
  });

  describe('list 子命令', () => {
    it('输出包含所有钩子条目', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
      const names = parsed.map((h: { name: string }) => h.name);
      expect(names).toContain('pre-tool-use');
      expect(names).toContain('post-tool-use');
    });

    it('--eligible 仅返回可加载的钩子', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'list', '--eligible', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const hook of parsed) {
        expect(hook.loadable).toBe(true);
      }
    });

    it('文本输出包含"钩子列表"标题', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'list']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('钩子列表');
    });
  });

  describe('enable 子命令', () => {
    it('成功启用存在的钩子', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'enable', 'pre-tool-use', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
      expect(parsed.name).toBe('pre-tool-use');
    });

    it('启用不存在的钩子返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'enable', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain('不存在');
    });

    it('启用不可加载的钩子返回 blockedReason', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'enable', 'session-start', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain('缺少依赖');
    });
  });

  describe('disable 子命令', () => {
    it('成功禁用存在的钩子', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'disable', 'pre-tool-use', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);

      // 验证状态已更新
      await program.parseAsync(['node', 'test', 'hooks', 'info', 'pre-tool-use', '--json']);
      const info = JSON.parse(outputs[outputs.length - 1]);
      expect(info.enabled).toBe(false);
    });

    it('禁用不存在的钩子返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'disable', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });
  });

  describe('reload 子命令', () => {
    it('返回 reloaded/failed 计数', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'reload', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toHaveProperty('reloaded');
      expect(parsed).toHaveProperty('failed');
      expect(parsed.reloaded + parsed.failed).toBe(3);
    });
  });

  describe('info 子命令', () => {
    it('返回存在的钩子详情', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'info', 'pre-tool-use', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.name).toBe('pre-tool-use');
      expect(parsed.description).toBeDefined();
      expect(parsed.source).toBeDefined();
      expect(parsed.events).toBeInstanceOf(Array);
    });

    it('返回不存在钩子的 error', async () => {
      await program.parseAsync(['node', 'test', 'hooks', 'info', 'missing', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.error).toBe('not found');
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 list 并以文本输出', async () => {
      await program.parseAsync(['node', 'test', 'hooks']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('钩子列表');
      // 应包含至少一个钩子名称
      expect(allOutput).toContain('pre-tool-use');
    });
  });
});
