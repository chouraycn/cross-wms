import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { doctorCommand } from '../doctor.js';

describe('CLI doctor command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = originalExitCode;
    // 清理模块缓存，确保每个测试拿到全新的 doctorCommand 实例。
    vi.resetModules();
  });

  it('runs health checks and reports results', async () => {
    await doctorCommand.parseAsync(['node', 'test', 'doctor']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('=== cdf-know Doctor ==='))).toBe(true);
    expect(calls.some((line) => line.includes('Node.js version:'))).toBe(true);
    expect(
      calls.some(
        (line) =>
          line.includes('OK:') ||
          line.includes('Warnings:') ||
          line.includes('Errors:')
      )
    ).toBe(true);
  });

  it('includes all primary health check sections', async () => {
    await doctorCommand.parseAsync(['node', 'test', 'doctor']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('Config file:'))).toBe(true);
    expect(calls.some((line) => line.includes('Environment:'))).toBe(true);
    expect(calls.some((line) => line.includes('Plugins:'))).toBe(true);
    expect(calls.some((line) => line.includes('Extensions:'))).toBe(true);
    expect(calls.some((line) => line.includes('Agents:'))).toBe(true);
    expect(calls.some((line) => line.includes('Log directory:'))).toBe(true);
  });

  it('runs at least 10 health checks', async () => {
    await doctorCommand.parseAsync(['node', 'test', 'doctor']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    // 检查项以 "[OK]   Name: ..." 或 "[WARN] Name: ..." 形式输出
    // 提取所有以 [OK]/[WARN]/[FAIL] 开头并包含冒号分隔的 "Name:" 段
    const resultLines = calls.filter((line) => /\[(OK|WARN|FAIL)\][^:]*\b\w[\w ]*:/.test(line));
    expect(resultLines.length).toBeGreaterThanOrEqual(10);

    // 抽样验证新增的检查项
    expect(calls.some((line) => line.includes('Disk space:'))).toBe(true);
    expect(calls.some((line) => line.includes('node_modules:'))).toBe(true);
    expect(calls.some((line) => line.includes('.env file:'))).toBe(true);
    expect(calls.some((line) => line.includes('TypeScript:'))).toBe(true);
    expect(calls.some((line) => line.includes('Crestodian:'))).toBe(true);
  });

  it('--json option emits a valid JSON report', async () => {
    // 重新载入模块，确保拿到全新的 doctorCommand 实例（不受其它测试污染）
    vi.resetModules();
    const mod = await import('../doctor.js');
    const fresh = mod.doctorCommand;
    await fresh.parseAsync(['node', 'test', 'doctor', '--json']);

    const jsonPayload = consoleSpy.mock.calls
      .map((c) => c.join(' '))
      .join('\n')
      .trim();
    const firstBrace = jsonPayload.indexOf('{');
    expect(firstBrace).toBeGreaterThanOrEqual(0);
    const candidate = jsonPayload.slice(firstBrace);

    const parsed = JSON.parse(candidate) as {
      startedAt: string;
      endedAt: string;
      durationMs: number;
      summary: { total: number; ok: number; warnings: number; errors: number };
      checks: Array<{ name: string; status: string; message: string }>;
    };
    expect(typeof parsed.startedAt).toBe('string');
    expect(typeof parsed.endedAt).toBe('string');
    expect(typeof parsed.durationMs).toBe('number');
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
    expect(parsed.summary.total).toBeGreaterThanOrEqual(10);
    expect(Array.isArray(parsed.checks)).toBe(true);
    const names = parsed.checks.map((c) => c.name);
    expect(names).toContain('Node.js version');
    expect(names).toContain('Crestodian');
    // 验证 JSON 模式不打印 summary 区
    expect(jsonPayload).not.toContain('--- Summary ---');
  });

  it('--verbose option displays detailed information', async () => {
    vi.resetModules();
    const mod = await import('../doctor.js');
    const fresh = mod.doctorCommand;
    await fresh.parseAsync(['node', 'test', 'doctor', '--verbose', '--no-color']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    // verbose 模式下应输出汇总区
    expect(calls.some((line) => line.includes('Total:'))).toBe(true);
    expect(calls.some((line) => line.includes('Duration:'))).toBe(true);
    // verbose 模式下应输出 detailed table 区域
    expect(calls.some((line) => line.includes('--- Detailed table ---'))).toBe(true);
    // verbose 模式下应显示每行耗时
    expect(calls.some((line) => line.includes('耗时:'))).toBe(true);
  });

  it('handles Crestodian probe result safely', async () => {
    vi.resetModules();
    const mod = await import('../doctor.js');
    const fresh = mod.doctorCommand;
    await expect(fresh.parseAsync(['node', 'test', 'doctor'])).resolves.not.toThrow();
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    // 至少有一行提到 Crestodian（无论结果是 probe 还是降级提示）
    expect(calls.some((line) => line.includes('Crestodian:'))).toBe(true);
  });
});
