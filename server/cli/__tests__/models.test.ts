/**
 * CLI models 命令测试
 *
 * 覆盖 registerModelsCommand 的契约行为：
 * - 子命令注册（list/set/test/info）
 * - 模型列表、设置、测试、详情
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerModelsCommand } from '../commands/models.js';

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

describe('CLI models 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerModelsCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 models 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'models');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('模型');
  });

  it('包含子命令 list/set/test/info', () => {
    const modelsCmd = program.commands.find((c) => c.name() === 'models')!;
    const subNames = modelsCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('set');
    expect(subNames).toContain('test');
    expect(subNames).toContain('info');
  });

  describe('list 子命令', () => {
    it('默认只显示已配置模型', async () => {
      await program.parseAsync(['node', 'test', 'models', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toHaveProperty('models');
      expect(parsed).toHaveProperty('config');
      expect(parsed.models.every((m: { configured: boolean }) => m.configured)).toBe(true);
    });

    it('--all 显示完整目录', async () => {
      await program.parseAsync(['node', 'test', 'models', 'list', '--all', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.models.length).toBeGreaterThan(1);
    });

    it('模型条目有 id/provider/contextWindow 字段', async () => {
      await program.parseAsync(['node', 'test', 'models', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const model of parsed.models) {
        expect(model.id).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(typeof model.contextWindow).toBe('number');
      }
    });

    it('文本输出包含默认模型', async () => {
      await program.parseAsync(['node', 'test', 'models', 'list']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('默认模型');
    });
  });

  describe('set 子命令', () => {
    it('设置存在的模型返回 success=true', async () => {
      await program.parseAsync(['node', 'test', 'models', 'set', 'deepseek-chat', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
    });

    it('设置不存在的模型返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'models', 'set', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });
  });

  describe('test 子命令', () => {
    it('测试存在的模型返回 ok=true', async () => {
      await program.parseAsync(['node', 'test', 'models', 'test', 'qwen-plus', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.model).toBe('qwen-plus');
      expect(parsed.ok).toBe(true);
      expect(typeof parsed.latencyMs).toBe('number');
    });

    it('测试不存在的模型返回 ok=false', async () => {
      await program.parseAsync(['node', 'test', 'models', 'test', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.ok).toBe(false);
    });
  });

  describe('info 子命令', () => {
    it('返回模型详情', async () => {
      await program.parseAsync(['node', 'test', 'models', 'info', 'qwen-plus', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.model.id).toBe('qwen-plus');
      expect(parsed.provider).toBeDefined();
    });

    it('不存在的模型返回 error', async () => {
      await program.parseAsync(['node', 'test', 'models', 'info', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.error).toBe('not found');
    });
  });
});
