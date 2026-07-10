/**
 * CLI doctor 命令测试
 *
 * 覆盖 registerDoctorCommand 的契约行为：
 * - 命令注册（名称、描述、选项）
 * - JSON 输出格式（DoctorReport: ok/scopesChecked/totalFindings/findings）
 * - 文本输出格式
 * - 报告结构和摘要
 * - --only / --skip 范围过滤
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerDoctorCommand(program);
    loggerMock.info.mockImplementation((msg: string) => {
      lastOutput = msg;
    });
    lastOutput = '';
    // doctor 在发现 error 级别问题时调用 process.exit(1)，测试中拦截避免真正退出
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('注册名为 doctor 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('诊断');
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
    it('输出包含 ok/scopesChecked/totalFindings/findings 的 DoctorReport', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json']);
      const parsed = JSON.parse(lastOutput);
      expect(typeof parsed.ok).toBe('boolean');
      expect(typeof parsed.scopesChecked).toBe('number');
      expect(typeof parsed.totalFindings).toBe('number');
      expect(Array.isArray(parsed.findings)).toBe(true);
    });

    it('每个 finding 都有 id/severity/message', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json']);
      const parsed = JSON.parse(lastOutput);
      for (const finding of parsed.findings) {
        expect(typeof finding.id).toBe('string');
        expect(['error', 'warning', 'info']).toContain(finding.severity);
        expect(typeof finding.message).toBe('string');
      }
    });

    it('totalFindings 与 findings 长度一致', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json']);
      const parsed = JSON.parse(lastOutput);
      expect(parsed.totalFindings).toBe(parsed.findings.length);
    });
  });

  describe('文本输出', () => {
    it('输出包含"诊断报告"标题', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      expect(lastOutput).toContain('诊断报告');
    });

    it('输出包含"发现"和"摘要"小节', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      expect(lastOutput).toContain('发现');
      expect(lastOutput).toContain('摘要');
    });

    it('为每个 finding 显示状态图标', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      // 至少包含一个状态图标 (✓ 通过 / ✗ 错误 / ! 警告)
      expect(/[✓✗!]/.test(lastOutput)).toBe(true);
    });

    it('summary 显示总计/警告/摘要', async () => {
      await program.parseAsync(['node', 'test', 'doctor']);
      expect(lastOutput).toContain('总计');
      expect(lastOutput).toContain('警告');
      expect(lastOutput).toContain('摘要');
    });
  });

  describe('详细输出 (--verbose)', () => {
    it('输出包含 PID/Node/Platform', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--verbose']);
      expect(lastOutput).toContain('PID');
      expect(lastOutput).toContain('Node');
      expect(lastOutput).toContain('Platform');
    });

    it('每个 finding 显示修复提示', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--verbose']);
      expect(lastOutput).toContain('修复');
    });

    it('summary 包含检查范围与总计发现', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--verbose']);
      expect(lastOutput).toContain('检查范围');
      expect(lastOutput).toContain('总计发现');
    });
  });

  describe('--only 过滤', () => {
    it('只运行指定范围的检查', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json', '--only', 'gateway']);
      const parsed = JSON.parse(lastOutput);
      expect(parsed.scopesChecked).toBe(1);
      expect(parsed.findings.every((f: { id: string }) => f.id.startsWith('doctor/gateway/'))).toBe(
        true,
      );
    });

    it('支持多范围过滤', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json', '--only', 'gateway,channels']);
      const parsed = JSON.parse(lastOutput);
      expect(parsed.scopesChecked).toBe(2);
    });
  });

  describe('--skip 过滤', () => {
    it('跳过指定范围的检查', async () => {
      await program.parseAsync(['node', 'test', 'doctor', '--json', '--skip', 'channels']);
      const parsed = JSON.parse(lastOutput);
      expect(
        parsed.findings.some((f: { id: string }) => f.id.startsWith('doctor/channels/')),
      ).toBe(false);
    });
  });

  describe('--only 与 --skip 组合', () => {
    it('先 only 后 skip', async () => {
      await program.parseAsync([
        'node',
        'test',
        'doctor',
        '--json',
        '--only',
        'gateway,channels',
        '--skip',
        'channels',
      ]);
      const parsed = JSON.parse(lastOutput);
      expect(parsed.scopesChecked).toBe(1);
      expect(
        parsed.findings.some((f: { id: string }) => f.id.startsWith('doctor/channels/')),
      ).toBe(false);
    });
  });
});
