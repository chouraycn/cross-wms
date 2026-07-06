/**
 * CLI tool 命令测试
 *
 * 覆盖 registerToolCommand 的契约行为：
 * - 子命令注册（list/exec/info）
 * - 工具列表、执行、详情
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerToolCommand } from '../commands/tool.js';

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

describe('CLI tool 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerToolCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 tool 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'tool');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('工具');
  });

  it('包含子命令 list/exec/info', () => {
    const toolCmd = program.commands.find((c) => c.name() === 'tool')!;
    const subNames = toolCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('exec');
    expect(subNames).toContain('info');
  });

  describe('list 子命令', () => {
    it('输出包含所有工具', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('每个工具有 name/category/enabled 字段', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const tool of parsed) {
        expect(tool.name).toBeDefined();
        expect(tool.category).toBeDefined();
        expect(typeof tool.enabled).toBe('boolean');
      }
    });

    it('包含 weather_query 工具', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      const names = parsed.map((t: { name: string }) => t.name);
      expect(names).toContain('weather_query');
      expect(names).toContain('wms_query');
    });
  });

  describe('exec 子命令', () => {
    it('执行存在的工具返回 success=true', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'exec', 'weather_query', '{"city":"北京"}', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.tool).toBe('weather_query');
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
    });

    it('执行不存在的工具返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'exec', 'nonexistent', '{}', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });

    it('缺少必需参数返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'exec', 'weather_query', '{}', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });

    it('支持 key=value 简单参数格式', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'exec', 'weather_query', 'city=上海', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
    });

    it('文本输出包含"执行成功"', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'exec', 'weather_query', '{"city":"北京"}']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('执行成功');
    });
  });

  describe('info 子命令', () => {
    it('返回工具详情含参数列表', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'info', 'weather_query', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.name).toBe('weather_query');
      expect(parsed.parameters).toBeInstanceOf(Array);
    });

    it('不存在的工具返回 error', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'info', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.error).toBe('not_found');
    });

    it('文本输出包含工具名称和分类', async () => {
      await program.parseAsync(['node', 'test', 'tool', 'info', 'wms_query']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('wms_query');
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 list', async () => {
      await program.parseAsync(['node', 'test', 'tool']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('可用工具');
    });
  });
});
