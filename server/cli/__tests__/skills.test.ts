/**
 * CLI skills 命令测试
 *
 * 覆盖 registerSkillsCommand 的契约行为：
 * - 子命令注册（list/install/scan/enable/disable/info）
 * - 技能列表、安装、扫描、启用/禁用、详情
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerSkillsCommand } from '../commands/skills.js';

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

describe('CLI skills 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerSkillsCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 skill 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'skill');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('技能');
  });

  it('包含子命令 list/install/scan/enable/disable/info', () => {
    const skillsCmd = program.commands.find((c) => c.name() === 'skill')!;
    const subNames = skillsCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('install');
    expect(subNames).toContain('scan');
    expect(subNames).toContain('enable');
    expect(subNames).toContain('disable');
    expect(subNames).toContain('info');
  });

  describe('list 子命令', () => {
    it('输出包含所有技能', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('每个技能有 id/name/version/enabled/source 字段', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const skill of parsed) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
        expect(skill.version).toBeDefined();
        expect(typeof skill.enabled).toBe('boolean');
        expect(['builtin', 'local', 'remote']).toContain(skill.source);
      }
    });
  });

  describe('install 子命令', () => {
    it('安装技能返回完整技能对象', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'install', 'my-skill@1.0.0', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.id).toBe('my-skill');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.enabled).toBe(true);
    });

    it('重复安装更新版本', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'install', 'pdf-tools@2.0.0', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.version).toBe('2.0.0');
    });
  });

  describe('scan 子命令', () => {
    it('返回 found 和 eligible 数组', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'scan', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(typeof parsed.found).toBe('number');
      expect(parsed.eligible).toBeInstanceOf(Array);
    });
  });

  describe('enable/disable 子命令', () => {
    it('启用存在的技能返回 enabled=true', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'enable', 'wms-ops', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.enabled).toBe(true);
    });

    it('禁用存在的技能返回 disabled=true', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'disable', 'wms-ops', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.disabled).toBe(true);
    });

    it('启用不存在的技能返回 enabled=false', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'enable', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.enabled).toBe(false);
    });
  });

  describe('info 子命令', () => {
    it('返回技能详情', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'info', 'web-search', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.id).toBe('web-search');
      expect(parsed.name).toBeDefined();
    });

    it('不存在的技能返回 error', async () => {
      await program.parseAsync(['node', 'test', 'skill', 'info', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.error).toBe('not found');
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 list', async () => {
      await program.parseAsync(['node', 'test', 'skill']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('技能列表');
    });
  });
});
