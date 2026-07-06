/**
 * CLI secrets 命令测试
 *
 * 覆盖 registerSecretsCommand 的契约行为：
 * - 子命令注册（list/audit/apply/resolve/scrub）
 * - 密钥审计、解析、清洗
 * - JSON 与文本输出
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerSecretsCommand } from '../commands/secrets.js';

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

describe('CLI secrets 命令 Contract', () => {
  let program: Command;
  let outputs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerSecretsCommand(program);
    outputs = [];
    loggerMock.info.mockImplementation((msg: string) => outputs.push(msg));
  });

  it('注册名为 secrets 的命令', () => {
    const cmd = program.commands.find((c) => c.name() === 'secrets');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('密钥');
  });

  it('包含子命令 list/audit/apply/resolve/scrub', () => {
    const secretsCmd = program.commands.find((c) => c.name() === 'secrets')!;
    const subNames = secretsCmd.commands.map((c) => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('audit');
    expect(subNames).toContain('apply');
    expect(subNames).toContain('resolve');
    expect(subNames).toContain('scrub');
  });

  describe('list 子命令', () => {
    it('输出包含所有密钥条目', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('每个密钥都有 key/ref/provider/resolved 字段', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'list', '--json']);
      const parsed = JSON.parse(outputs[0]);
      for (const entry of parsed) {
        expect(entry.key).toBeDefined();
        expect(entry.ref).toBeDefined();
        expect(entry.provider).toBeDefined();
        expect(typeof entry.resolved).toBe('boolean');
      }
    });
  });

  describe('audit 子命令', () => {
    it('返回 findings 和 summary', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'audit', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.findings).toBeInstanceOf(Array);
      expect(parsed.summary).toHaveProperty('plaintext');
      expect(parsed.summary).toHaveProperty('unresolved');
      expect(parsed.summary).toHaveProperty('shadowed');
    });

    it('检测到明文密钥', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'audit', '--json']);
      const parsed = JSON.parse(outputs[0]);
      const plaintextFindings = parsed.findings.filter((f: { code: string }) => f.code === 'PLAINTEXT_SECRET');
      expect(plaintextFindings.length).toBeGreaterThan(0);
    });

    it('文本输出包含审计报告', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'audit']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('密钥审计报告');
    });
  });

  describe('apply 子命令', () => {
    it('应用密钥计划返回 changed/changedKeys/skipped', async () => {
      const plan = JSON.stringify([{ key: 'test.apiKey', action: 'upsert', ref: 'secretRef:test#default' }]);
      await program.parseAsync(['node', 'test', 'secrets', 'apply', '--plan', plan, '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toHaveProperty('changed');
      expect(parsed).toHaveProperty('changedKeys');
      expect(parsed).toHaveProperty('skipped');
    });

    it('--dry-run 不写入存储', async () => {
      const plan = JSON.stringify([{ key: 'openai.apiKey', action: 'delete' }]);
      await program.parseAsync(['node', 'test', 'secrets', 'apply', '--plan', plan, '--dry-run', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.changed).toBe(true);
    });
  });

  describe('resolve 子命令', () => {
    it('解析存在的密钥返回 resolved=true', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'resolve', 'openai.apiKey', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.key).toBe('openai.apiKey');
      expect(parsed.resolved).toBe(true);
    });

    it('解析不存在的密钥返回 resolved=false', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'resolve', 'nonexistent', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed.resolved).toBe(false);
    });
  });

  describe('scrub 子命令', () => {
    it('dry-run 模式下返回待清洗的明文密钥列表', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'scrub', '--dry-run', '--json']);
      const parsed = JSON.parse(outputs[0]);
      expect(parsed).toHaveProperty('scrubbed');
      expect(parsed).toHaveProperty('skipped');
      expect(parsed.scrubbed.length).toBeGreaterThan(0);
    });
  });

  describe('默认行为（无子命令）', () => {
    it('默认调用 list', async () => {
      await program.parseAsync(['node', 'test', 'secrets']);
      const allOutput = outputs.join('\n');
      expect(allOutput).toContain('密钥条目');
    });
  });
});
