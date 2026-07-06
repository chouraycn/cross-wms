/**
 * CLI memory 命令测试
 *
 * 覆盖 registerMemoryCommand 的契约行为：
 * - 子命令注册（list/search/add/delete/sync）
 * - 记忆条目 CRUD 和向量同步
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerMemoryCommand } from '../commands/memory.js';

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

describe('CLI memory 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerMemoryCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 memory 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'memory');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('记忆');
  });

  it('包含子命令 list/search/add/delete/sync', () => {
    const memoryCmd = program.commands.find((c) => c.name() === 'memory')!;
    const subNames = memoryCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('search');
    expect(subNames).toContain('add');
    expect(subNames).toContain('delete');
    expect(subNames).toContain('sync');
  });

  describe('list 子命令', () => {
    it('输出包含所有记忆条目', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('每个记忆有 id/content/tags/createdAt 字段', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const item of parsed) {
        expect(item.id).toBeDefined();
        expect(item.content).toBeDefined();
        expect(item.tags).toBeInstanceOf(Array);
        expect(item.createdAt).toBeDefined();
      }
    });
  });

  describe('search 子命令', () => {
    it('按关键词搜索返回结果', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'search', 'TypeScript', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.query).toBe('TypeScript');
      expect(parsed.results).toBeInstanceOf(Array);
      expect(parsed.count).toBeGreaterThan(0);
    });

    it('按标签搜索返回结果', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'search', 'preference', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.count).toBeGreaterThan(0);
    });

    it('无匹配返回空数组', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'search', 'xyznonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.count).toBe(0);
    });
  });

  describe('add 子命令', () => {
    it('添加记忆返回完整对象', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'add', '新记忆内容', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.id).toBeDefined();
      expect(parsed.content).toBe('新记忆内容');
      expect(parsed.tags).toEqual([]);
    });

    it('--tags 添加标签', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'add', '带标签的记忆', '-t', 'test,important', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.tags).toContain('test');
      expect(parsed.tags).toContain('important');
    });
  });

  describe('delete 子命令', () => {
    it('删除存在的记忆返回 success=true', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'delete', 'mem-001', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(true);
    });

    it('删除不存在的记忆返回 success=false', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'delete', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.success).toBe(false);
    });
  });

  describe('sync 子命令', () => {
    it('同步返回 synced/total 计数', async () => {
      await program.parseAsync(['node', 'test', 'memory', 'sync', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(typeof parsed.synced).toBe('number');
      expect(typeof parsed.total).toBe('number');
      expect(parsed.synced).toBe(parsed.total);
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 list', async () => {
      await program.parseAsync(['node', 'test', 'memory']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('记忆条目');
    });
  });
});
