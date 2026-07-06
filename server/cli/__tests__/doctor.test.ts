/**
 * CLI doctor 命令测试
 *
 * 覆盖 registerDoctorCommand 的契约行为：
 * - 命令注册（名称、描述、选项）
 * - JSON 输出格式
 * - 文本输出格式
 * - 报告结构和摘要
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerDoctorCommand } from '../commands/doctor.js';

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

describe('CLI doctor 命令 Contract', () => {
  let program: Command;
  let lastOutput: string;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerDoctorCommand(program);
    loggerMock.info.mockImplementation((msg: string) => {
      lastOutput = msg;
    });
    lastOutput = '';
  });

  it('注册名为 doctor 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('检查并修复');
  });

  it('--fix 选项存在', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor')!;
    const fixOpt = cmd.options.find((o) => o.long === '--fix');
    expect(fixOpt).toBeDefined();
  });

  it('--json 选项存在', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor')!;
    const jsonOpt = cmd.options.find((o) => o.long === '--json');
    expect(jsonOpt).toBeDefined();
  });

  it('-v/--verbose 选项存在', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor')!;
    const verboseOpt = cmd.options.find((o) => o.long === '--verbose');
    expect(verboseOpt).toBeDefined();
    expect(verboseOpt?.short).toBe('-v');
  });

  it('--only 选项存在且接受参数', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor')!;
    const onlyOpt = cmd.options.find((o) => o.long === '--only');
    expect(onlyOpt).toBeDefined();
  });

  it('--skip 选项存在且接受参数', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor')!;
    const skipOpt = cmd.options.find((o) => o.long === '--skip');
    expect(skipOpt).toBeDefined();
  });

  it('--exit-code 选项存在且接受参数', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor')!;
    const exitOpt = cmd.options.find((o) => o.long === '--exit-code');
    expect(exitOpt).toBeDefined();
  });

  describe('JSON 输出', () => {
    it('输出包含 timestamp/checks/summary 的 JSON', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json']);
      const parsed = JSON.parse(lastOutput);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.checks).toBeInstanceOf(Array);
      expect(parsed.summary).toHaveProperty('total');
      expect(parsed.summary).toHaveProperty('passed');
      expect(parsed.summary).toHaveProperty('failed');
      expect(parsed.summary).toHaveProperty('warnings');
    });

    it('checks 包含 Node.js/数据库/配置文件等检查项', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json']);
      const parsed = JSON.parse(lastOutput);
      const names = parsed.checks.map((c: { name: string }) => c.name);
      expect(names).toContain('Node.js 版本');
      expect(names).toContain('数据库');
      expect(names).toContain('配置文件');
      expect(names).toContain('模型配置');
      expect(names).toContain('Gateway 连接');
      expect(names).toContain('插件');
    });

    it('每个 check 都有 name/status/message', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json']);
      const parsed = JSON.parse(lastOutput);
      for (const check of parsed.checks) {
        expect(check.name).toBeDefined();
        expect(['pass', 'fail', 'warn']).toContain(check.status);
        expect(check.message).toBeDefined();
      }
    });

    it('summary 数字与 checks 匹配', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json']);
      const parsed = JSON.parse(lastOutput);
      const passed = parsed.checks.filter((c: { status: string }) => c.status === 'pass').length;
      const failed = parsed.checks.filter((c: { status: string }) => c.status === 'fail').length;
      const warnings = parsed.checks.filter((c: { status: string }) => c.status === 'warn').length;
      expect(parsed.summary.total).toBe(parsed.checks.length);
      expect(parsed.summary.passed).toBe(passed);
      expect(parsed.summary.failed).toBe(failed);
      expect(parsed.summary.warnings).toBe(warnings);
    });
  });

  describe('文本输出', () => {
    it('输出包含"诊断报告"标题', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      expect(lastOutput).toContain('诊断报告');
    });

    it('输出包含"检查项"和"摘要"小节', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      expect(lastOutput).toContain('检查项');
      expect(lastOutput).toContain('摘要');
    });

    it('为每个 check 显示状态图标', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      // 至少包含一个状态图标
      expect(/[✓✗!]/.test(lastOutput)).toBe(true);
    });

    it('summary 显示总数/通过/失败/警告', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      expect(lastOutput).toContain('总计');
      expect(lastOutput).toContain('通过');
      expect(lastOutput).toContain('失败');
      expect(lastOutput).toContain('警告');
    });
  });

  describe('详细输出 (--verbose)', () => {
    it('输出包含 PID/Node/Platform', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--verbose']);
      expect(lastOutput).toContain('PID');
      expect(lastOutput).toContain('Node');
      expect(lastOutput).toContain('Platform');
    });

    it('每个 check 显示可修复/类型字段', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--verbose']);
      expect(lastOutput).toContain('可修复');
      expect(lastOutput).toContain('类型');
    });

    it('summary 包含百分比', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--verbose']);
      expect(lastOutput).toMatch(/\d+\.\d+%/);
    });
  });

  describe('--only 过滤', () => {
    it('只运行指定类型的检查', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json', '--only', 'db']);
      const parsed = JSON.parse(lastOutput);
      // 应该只剩数据库相关检查
      expect(parsed.checks.every((c: { name: string }) => c.name.includes('数据库'))).toBe(true);
      expect(parsed.summary.total).toBeLessThan(6);
    });

    it('支持多类型过滤', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json', '--only', 'db,plugin']);
      const parsed = JSON.parse(lastOutput);
      expect(parsed.checks.length).toBeGreaterThan(0);
      for (const c of parsed.checks) {
        expect(c.name.includes('数据库') || c.name.includes('插件')).toBe(true);
      }
    });
  });

  describe('--skip 过滤', () => {
    it('跳过指定类型的检查', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json', '--skip', 'runtime']);
      const parsed = JSON.parse(lastOutput);
      // 不应包含 Node.js 运行时检查
      expect(parsed.checks.some((c: { name: string }) => c.name.includes('Node.js 版本'))).toBe(false);
    });
  });

  describe('--only 与 --skip 组合', () => {
    it('先 only 后 skip', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json', '--only', 'db,model', '--skip', 'model']);
      const parsed = JSON.parse(lastOutput);
      // 应只剩数据库
      expect(parsed.checks.length).toBeGreaterThan(0);
      expect(parsed.checks.every((c: { name: string }) => c.name.includes('数据库'))).toBe(true);
    });
  });
});
