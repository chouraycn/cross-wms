import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { updateCommand, compareSemver } from '../update.js';

describe('CLI update command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let tempDir: string;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'update-test-'));
    originalStateDir = process.env.CROSSWMS_STATE_DIR;
    process.env.CROSSWMS_STATE_DIR = tempDir;
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    if (originalStateDir === undefined) {
      delete process.env.CROSSWMS_STATE_DIR;
    } else {
      process.env.CROSSWMS_STATE_DIR = originalStateDir;
    }
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('has correct command name and description', () => {
    expect(updateCommand.name()).toBe('update');
    expect(updateCommand.description()).toContain('自更新');
  });

  it('shows help output with all subcommands', () => {
    const help = updateCommand.helpInformation();
    expect(help).toContain('check');
    expect(help).toContain('download');
    expect(help).toContain('install');
    expect(help).toContain('status');
  });

  it('check in offline mode returns mock data', async () => {
    await updateCommand.parseAsync(['node', 'test', 'check', '--offline']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('当前版本'))).toBe(true);
    expect(calls.some((line) => line.includes('最新版本'))).toBe(true);
  });

  it('check writes cache file', async () => {
    await updateCommand.parseAsync(['node', 'test', 'check', '--offline']);

    const cacheFile = path.join(tempDir, 'update-cache.json');
    const content = await fs.readFile(cacheFile, 'utf-8');
    const data = JSON.parse(content);
    expect(typeof data.lastCheckedAt).toBe('number');
    expect(typeof data.lastKnownVersion).toBe('string');
  });

  it('status shows no cache initially', async () => {
    await updateCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('当前版本'))).toBe(true);
    expect(calls.some((line) => line.includes('尚未执行 check'))).toBe(true);
  });

  it('status shows cache after check', async () => {
    await updateCommand.parseAsync(['node', 'test', 'check', '--offline']);
    consoleSpy.mockClear();

    await updateCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('上次检查'))).toBe(true);
    expect(calls.some((line) => line.includes('上次已知版本'))).toBe(true);
  });

  it('download creates artifact file', async () => {
    await updateCommand.parseAsync(['node', 'test', 'download', '1.2.3']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('已下载'))).toBe(true);
    expect(calls.some((line) => line.includes('1.2.3'))).toBe(true);

    // 验证 downloads 目录中有文件
    const downloadsDir = path.join(tempDir, 'downloads');
    const files = await fs.readdir(downloadsDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('download without version uses latest', async () => {
    // 先写入 cache
    await updateCommand.parseAsync(['node', 'test', 'check', '--offline']);
    consoleSpy.mockClear();

    await updateCommand.parseAsync(['node', 'test', 'download']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('已下载'))).toBe(true);
  });

  it('install with --dry-run does not execute', async () => {
    await updateCommand.parseAsync(['node', 'test', 'install', '1.2.3', '--dry-run']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('命令:'))).toBe(true);
    expect(calls.some((line) => line.includes('预览模式: 是'))).toBe(true);
  });

  it('check JSON output is valid JSON', async () => {
    await updateCommand.parseAsync(['node', 'test', 'check', '--offline', '--json']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    const jsonLine = calls.find((line) => line.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.current).toBeDefined();
    expect(parsed.latest).toBeDefined();
    expect(typeof parsed.hasUpdate).toBe('boolean');
    expect(parsed.source).toBe('mock');
  });
});

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('2.3.4', '2.3.4')).toBe(0);
  });

  it('returns -1 when first is smaller', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
  });

  it('returns 1 when first is larger', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
  });

  it('handles missing patch versions', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.0.1', '1.0')).toBe(1);
  });
});
