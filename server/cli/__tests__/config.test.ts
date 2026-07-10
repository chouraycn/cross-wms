/**
 * CLI config 命令测试
 *
 * 覆盖 registerConfigCommand 的契约行为：
 * - 子命令注册（list/get/set/validate）
 * - 配置项的获取、设置、验证
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerConfigCommand } from '../commands/config.js';

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

describe('CLI config 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerConfigCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 config 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'config');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('配置');
  });

  it('包含子命令 list/get/set/validate', () => {
    const configCmd = program.commands.find((c) => c.name() === 'config')!;
    const subNames = configCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('get');
    expect(subNames).toContain('set');
    expect(subNames).toContain('validate');
  });

  describe('list 子命令', () => {
    it('输出包含所有配置项', async () => {
      await program.parseAsync(['node', 'test', 'config', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('每个配置项都有 key 字段', async () => {
      await program.parseAsync(['node', 'test', 'config', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const item of parsed) {
        expect(item).toHaveProperty('key');
        expect(item.key).toBeDefined();
      }
      // 未设置且无默认值的必填项（如 ai.defaultModel）在 JSON 中不含 value 字段
      // （JSON.stringify 会丢弃 undefined），此处额外验证带默认值的项确有 value
      const lang = parsed.find((i: { key: string }) => i.key === 'app.language');
      expect(lang.value).toBeDefined();
    });

    it('文本输出包含"配置项"标题', async () => {
      await program.parseAsync(['node', 'test', 'config', 'list']);
      expect(outputs[0]).toContain('配置项');
    });
  });

  describe('get 子命令', () => {
    it('获取存在的配置项返回 key/value', async () => {
      await program.parseAsync(['node', 'test', 'config', 'get', 'app.theme', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.key).toBe('app.theme');
      // 该配置项在 schema 中有默认值，且环境设置文件中已配置，故 value 必有值
      // （不硬编码具体值，避免依赖环境设置文件内容）
      expect(parsed.value).toBeDefined();
    });

    it('获取不存在的配置项返回 value=null', async () => {
      await program.parseAsync(['node', 'test', 'config', 'get', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.value).toBeNull();
    });

    it('文本输出显示 key = value', async () => {
      await program.parseAsync(['node', 'test', 'config', 'get', 'app.language']);
      expect(outputs[0]).toContain('app.language');
    });
  });

  describe('set 子命令', () => {
    it('设置配置项返回 success=true', async () => {
      await program.parseAsync(['node', 'test', 'config', 'set', 'app.language', 'en-US', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
      expect(parsed.key).toBe('app.language');
      expect(parsed.value).toBe('en-US');
    });

    it('设置新配置项成功', async () => {
      await program.parseAsync(['node', 'test', 'config', 'set', 'new.key', 'new-value', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
    });

    it('文本输出包含"已设置"', async () => {
      await program.parseAsync(['node', 'test', 'config', 'set', 'app.theme', 'dark']);
      expect(outputs[0]).toContain('已设置');
    });
  });

  describe('validate 子命令', () => {
    it('有效配置值返回 valid=true', async () => {
      await program.parseAsync(['node', 'test', 'config', 'validate', 'app.language', 'zh-CN', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.valid).toBe(true);
    });

    it('无效配置值返回 valid=false', async () => {
      await program.parseAsync(['node', 'test', 'config', 'validate', 'app.language', 'invalid', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.valid).toBe(false);
    });

    it('无效 app.theme 返回 valid=false', async () => {
      await program.parseAsync(['node', 'test', 'config', 'validate', 'app.theme', 'blue', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.valid).toBe(false);
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 list 并以文本输出', async () => {
      await program.parseAsync(['node', 'test', 'config']);
      expect(outputs[0]).toContain('配置项');
    });
  });
});
