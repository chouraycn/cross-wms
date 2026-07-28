import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { Command } from 'commander';
import { createBackup, listBackup, verifyBackup, restoreBackup } from '../backup.js';

/**
 * 重新导入 backup 模块以获取全新的 backupCommand 实例。
 * 原因：commander 的 Command 对象在多次 parseAsync 之间会保留 option 值，
 * 重复使用同一个实例会导致后续测试继承前一个测试设置的选项（例如 --dry-run）。
 */
async function freshBackupCommand(): Promise<Command> {
  vi.resetModules();
  const mod = await import('../backup.js');
  return mod.backupCommand;
}

describe('CLI backup command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let tempDir: string;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
    originalStateDir = process.env.CROSSWMS_STATE_DIR;
    process.env.CROSSWMS_STATE_DIR = tempDir;
    // 创建一些"被备份"的文件
    await fs.writeFile(path.join(tempDir, 'config.json'), '{"foo":"bar"}', 'utf-8');
    await fs.mkdir(path.join(tempDir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'sub', 'data.txt'), 'hello', 'utf-8');
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

  it('has correct command name and description', async () => {
    const backupCommand = await freshBackupCommand();
    expect(backupCommand.name()).toBe('backup');
    expect(backupCommand.description()).toContain('备份');
  });

  it('shows help output with all subcommands', async () => {
    const backupCommand = await freshBackupCommand();
    const help = backupCommand.helpInformation();
    expect(help).toContain('create');
    expect(help).toContain('list');
    expect(help).toContain('verify');
    expect(help).toContain('restore');
  });

  it('create generates an archive file', async () => {
    const backupCommand = await freshBackupCommand();
    const outDir = path.join(tempDir, 'out');
    await backupCommand.parseAsync(['node', 'test', 'create', '-o', outDir]);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('备份已创建'))).toBe(true);

    // 检查 outDir 中有 .tar.gz 文件（archive 直接放在 outputDir 下）
    const files = await fs.readdir(outDir);
    const archives = files.filter((f) => f.endsWith('.tar.gz'));
    expect(archives.length).toBeGreaterThan(0);
  });

  it('create with --dry-run does not write archive', async () => {
    const backupCommand = await freshBackupCommand();
    await backupCommand.parseAsync(['node', 'test', 'create', '--dry-run']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('dry-run'))).toBe(true);
    expect(calls.some((line) => line.includes('即将备份'))).toBe(true);

    // 不应写入文件（默认输出目录为 ~/.crosswms/backups）
    const backupsDir = path.join(tempDir, 'backups');
    try {
      const files = await fs.readdir(backupsDir);
      expect(files.length).toBe(0);
    } catch {
      // 目录可能不存在
    }
  });

  it('create with --name uses custom name', async () => {
    const backupCommand = await freshBackupCommand();
    const outDir = path.join(tempDir, 'out');
    await backupCommand.parseAsync([
      'node', 'test', 'create',
      '-o', outDir,
      '-n', 'my-backup',
    ]);

    const files = await fs.readdir(outDir);
    expect(files.some((f) => f.includes('my-backup'))).toBe(true);
  });

  it('list command shows archive contents', async () => {
    const backupCommand = await freshBackupCommand();
    const outDir = path.join(tempDir, 'out');
    // 先创建备份
    await backupCommand.parseAsync(['node', 'test', 'create', '-o', outDir]);
    consoleSpy.mockClear();

    const files = await fs.readdir(outDir);
    const archive = path.join(outDir, files.find((f) => f.endsWith('.tar.gz'))!);

    await backupCommand.parseAsync(['node', 'test', 'list', archive]);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('包含'))).toBe(true);
  });

  it('verify returns valid for correctly created archive', async () => {
    const backupCommand = await freshBackupCommand();
    const outDir = path.join(tempDir, 'out');
    await backupCommand.parseAsync(['node', 'test', 'create', '-o', outDir]);
    consoleSpy.mockClear();

    const files = await fs.readdir(outDir);
    const archive = path.join(outDir, files.find((f) => f.endsWith('.tar.gz'))!);

    await backupCommand.parseAsync(['node', 'test', 'verify', archive]);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('完整可读'))).toBe(true);
  });

  it('verify returns invalid for non-existent file', async () => {
    const backupCommand = await freshBackupCommand();
    const fakeArchive = path.join(tempDir, 'not-exist.tar.gz');
    // 应当失败而非抛错（使用了 process.exitCode）
    await backupCommand.parseAsync(['node', 'test', 'verify', fakeArchive]);
    // 验证 process.exitCode 被设置
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('restore with --dry-run does not write files', async () => {
    const backupCommand = await freshBackupCommand();
    const outDir = path.join(tempDir, 'out');
    await backupCommand.parseAsync(['node', 'test', 'create', '-o', outDir]);

    const files = await fs.readdir(outDir);
    const archive = path.join(outDir, files.find((f) => f.endsWith('.tar.gz'))!);
    consoleSpy.mockClear();

    const restoreTarget = path.join(tempDir, 'restored');
    await backupCommand.parseAsync(['node', 'test', 'restore', archive, '-t', restoreTarget, '--dry-run']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('dry-run'))).toBe(true);

    // 目标目录应为空（无文件被实际恢复）
    try {
      const restored = await fs.readdir(restoreTarget);
      expect(restored.length).toBe(0);
    } catch {
      // 目录可能未被创建
    }
  });

  it('restore on non-existent archive throws', async () => {
    const backupCommand = await freshBackupCommand();
    const fakeArchive = path.join(tempDir, 'not-exist.tar.gz');
    const restoreTarget = path.join(tempDir, 'restored');
    await expect(
      backupCommand.parseAsync(['node', 'test', 'restore', fakeArchive, '-t', restoreTarget, '--dry-run']),
    ).rejects.toThrow();
  });
});

describe('CLI backup functions (direct API)', () => {
  let tempDir: string;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-fn-'));
    originalStateDir = process.env.CROSSWMS_STATE_DIR;
    process.env.CROSSWMS_STATE_DIR = tempDir;
    await fs.writeFile(path.join(tempDir, 'config.json'), '{"foo":"bar"}', 'utf-8');
  });

  afterEach(async () => {
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

  it('createBackup produces a valid tar.gz', async () => {
    const outDir = path.join(tempDir, 'out');
    const result = await createBackup({ outputDir: outDir });
    expect(result.archivePath).toContain(outDir);
    expect(result.archivePath.endsWith('.tar.gz')).toBe(true);
    expect(result.size).toBeGreaterThan(0);
    expect(result.files).toBeGreaterThan(0);
    expect(result.verified).toBe(false);
  });

  it('createBackup with verify returns verified=true', async () => {
    const outDir = path.join(tempDir, 'out');
    const result = await createBackup({ outputDir: outDir, verify: true });
    expect(result.verified).toBe(true);
  });

  it('createBackup with dryRun does not write files', async () => {
    const outDir = path.join(tempDir, 'out');
    const result = await createBackup({ outputDir: outDir, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.size).toBe(0);
    // 不应该写入文件
    try {
      const files = await fs.readdir(outDir);
      expect(files.length).toBe(0);
    } catch {
      // ok, 目录未被创建
    }
  });

  it('createBackup with custom name uses that name', async () => {
    const outDir = path.join(tempDir, 'out');
    const result = await createBackup({ outputDir: outDir, name: 'custom-name' });
    expect(path.basename(result.archivePath)).toBe('custom-name.tar.gz');
  });

  it('listBackup returns entries from archive', async () => {
    const outDir = path.join(tempDir, 'out');
    const { archivePath } = await createBackup({ outputDir: outDir });
    const entries = await listBackup(archivePath);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('listBackup throws for non-existent archive', async () => {
    await expect(listBackup('/nonexistent/path.tar.gz')).rejects.toThrow();
  });

  it('verifyBackup returns true for valid archive', async () => {
    const outDir = path.join(tempDir, 'out');
    const { archivePath } = await createBackup({ outputDir: outDir });
    const ok = await verifyBackup(archivePath);
    expect(ok).toBe(true);
  });

  it('verifyBackup returns false for non-existent file', async () => {
    const ok = await verifyBackup('/nonexistent/file.tar.gz');
    expect(ok).toBe(false);
  });

  it('restoreBackup dryRun does not write files', async () => {
    const outDir = path.join(tempDir, 'out');
    const { archivePath } = await createBackup({ outputDir: outDir });

    const target = path.join(tempDir, 'restored');
    const result = await restoreBackup({ archive: archivePath, targetDir: target, dryRun: true });
    expect(result.dryRun).toBe(true);
    // 目标目录应为空或不存在
    try {
      const files = await fs.readdir(target);
      expect(files.length).toBe(0);
    } catch {
      // ok
    }
  });

  it('restoreBackup actually writes files when not dryRun', async () => {
    const outDir = path.join(tempDir, 'out');
    const { archivePath } = await createBackup({ outputDir: outDir });

    const target = path.join(tempDir, 'restored');
    const result = await restoreBackup({ archive: archivePath, targetDir: target });
    expect(result.dryRun).toBe(false);
    expect(result.extractedFiles.length).toBeGreaterThan(0);
    // 验证文件被恢复
    const files = await fs.readdir(target);
    expect(files.length).toBeGreaterThan(0);
  });

  it('restoreBackup throws on non-existent archive', async () => {
    await expect(
      restoreBackup({ archive: '/nonexistent.tar.gz' }),
    ).rejects.toThrow();
  });
});
