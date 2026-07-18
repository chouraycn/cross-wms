import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LogRotator } from '../logRotation.js';

describe('logging > logRotation', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-rotator-test-'));
  });

  afterEach(async () => {
    try {
      const entries = await fs.readdir(tmpDir);
      for (const entry of entries) {
        await fs.unlink(path.join(tmpDir, entry));
      }
      await fs.rmdir(tmpDir);
    } catch {
      // ignore cleanup errors
    }
  });

  it('returns null when file does not exist', async () => {
    const rotator = new LogRotator();
    const result = await rotator.rotate(path.join(tmpDir, 'nonexistent.log'));
    expect(result).toBeNull();
  });

  it('returns null when file size is within limit', async () => {
    const rotator = new LogRotator({ maxSize: 1024 });
    const filePath = path.join(tmpDir, 'small.log');
    await fs.writeFile(filePath, 'tiny content');
    const result = await rotator.rotate(filePath);
    expect(result).toBeNull();
  });

  it('rotates file when size exceeds limit', async () => {
    const rotator = new LogRotator({ maxSize: 10, maxBackups: 3 });
    const filePath = path.join(tmpDir, 'big.log');
    await fs.writeFile(filePath, 'this content is definitely longer than ten bytes');

    const result = await rotator.rotate(filePath);
    expect(result).toBe(path.join(tmpDir, 'big.1.log'));

    const exists = await fs.access(result).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const originalExists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(originalExists).toBe(false);
  });

  it('shifts existing backups during rotation', async () => {
    const rotator = new LogRotator({ maxSize: 5, maxBackups: 3 });
    const filePath = path.join(tmpDir, 'shift.log');

    // 预置备份文件
    await fs.writeFile(`${filePath.slice(0, -4)}.1.log`, 'old1');
    await fs.writeFile(`${filePath.slice(0, -4)}.2.log`, 'old2');
    await fs.writeFile(filePath, 'new content that is long enough');

    await rotator.rotate(filePath);

    const b1 = await fs.readFile(`${filePath.slice(0, -4)}.1.log`, 'utf8');
    const b2 = await fs.readFile(`${filePath.slice(0, -4)}.2.log`, 'utf8');
    const b3 = await fs.readFile(`${filePath.slice(0, -4)}.3.log`, 'utf8');

    expect(b1).toBe('new content that is long enough');
    expect(b2).toBe('old1');
    expect(b3).toBe('old2');
  });

  it('removes oldest backup when exceeding maxBackups', async () => {
    const rotator = new LogRotator({ maxSize: 5, maxBackups: 2 });
    const filePath = path.join(tmpDir, 'limit.log');

    await fs.writeFile(`${filePath.slice(0, -4)}.1.log`, 'old1');
    await fs.writeFile(`${filePath.slice(0, -4)}.2.log`, 'old2');
    await fs.writeFile(filePath, 'new content that is long enough');

    await rotator.rotate(filePath);

    // 1 -> new, 2 -> old1, 3 应该被删除（因为 maxBackups=2）
    const b1Exists = await fs.access(`${filePath.slice(0, -4)}.1.log`).then(() => true).catch(() => false);
    const b2Exists = await fs.access(`${filePath.slice(0, -4)}.2.log`).then(() => true).catch(() => false);
    const b3Exists = await fs.access(`${filePath.slice(0, -4)}.3.log`).then(() => true).catch(() => false);

    expect(b1Exists).toBe(true);
    expect(b2Exists).toBe(true);
    expect(b3Exists).toBe(false);
  });

  it('cleans up old files by age', async () => {
    const rotator = new LogRotator({ maxAgeDays: 0 });
    const filePath = path.join(tmpDir, 'stale.log');
    await fs.writeFile(filePath, 'stale');

    // 将文件时间戳修改为一天前
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await fs.utimes(filePath, yesterday, yesterday);

    await rotator.cleanup(tmpDir);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('keeps recent files during cleanup', async () => {
    const rotator = new LogRotator({ maxAgeDays: 7 });
    const filePath = path.join(tmpDir, 'fresh.log');
    await fs.writeFile(filePath, 'fresh');

    await rotator.cleanup(tmpDir);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('uses default options when none provided', () => {
    const rotator = new LogRotator();
    expect(rotator.maxSize).toBe(10 * 1024 * 1024);
    expect(rotator.maxBackups).toBe(5);
    expect(rotator.maxAgeDays).toBe(7);
  });

  // ===================== 压力测试与边界测试 =====================

  describe('真实文件系统 rotate 压力测试', () => {
    it('使用 os.tmpdir() 真实文件系统的多次轮转', async () => {
      const rotator = new LogRotator({ maxSize: 50, maxBackups: 3 });
      const filePath = path.join(os.tmpdir(), `log-rotator-real-${Date.now()}-${Math.random()}.log`);

      try {
        // 写入超过 maxSize 的内容
        const content = 'x'.repeat(200);
        await fs.writeFile(filePath, content);

        // 触发 5 次轮转（每次都重新写入新内容）
        for (let i = 0; i < 5; i++) {
          await fs.writeFile(filePath, content);
          const result = await rotator.rotate(filePath);
          expect(result).toBeTruthy();
        }

        // 最多应保留 maxBackups 个备份
        const entries = await fs.readdir(path.dirname(filePath));
        const baseName = path.basename(filePath);
        const ext = path.extname(filePath);
        const stem = baseName.slice(0, baseName.length - ext.length);
        const backups = entries.filter((e) => e.startsWith(`${stem}.`) && e.endsWith(ext));
        // maxBackups=3，所以应只有 3 个备份 + 可能的主文件
        expect(backups.length).toBeLessThanOrEqual(3 + 1);
      } finally {
        // 清理
        try {
          const entries = await fs.readdir(path.dirname(filePath));
          for (const entry of entries) {
            if (entry.startsWith(path.basename(filePath).split('.')[0])) {
              await fs.unlink(path.join(path.dirname(filePath), entry));
            }
          }
        } catch {
          // ignore
        }
      }
    });

    it('真实文件系统：连续 50 次轮转应保持稳定', async () => {
      const rotator = new LogRotator({ maxSize: 10, maxBackups: 2 });
      const filePath = path.join(tmpDir, 'stress-rotate.log');
      const bigContent = 'x'.repeat(100);

      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        await fs.writeFile(filePath, bigContent);
        const result = await rotator.rotate(filePath);
        expect(result).toBeTruthy();
      }
      const duration = performance.now() - start;

      // 50 次轮转应在 5s 内完成
      expect(duration).toBeLessThan(5000);

      // 最终状态：最多 2 个备份
      const entries = await fs.readdir(tmpDir);
      const backups = entries.filter((e) => e.startsWith('stress-rotate.') && e.endsWith('.log'));
      expect(backups.length).toBeLessThanOrEqual(2);
    });
  });

  describe('大量备份（10+）清理测试', () => {
    it('maxBackups=2 时预置 12 个备份应正确执行滑动窗口', async () => {
      const rotator = new LogRotator({ maxSize: 5, maxBackups: 2 });
      const filePath = path.join(tmpDir, 'many-backups.log');
      const base = filePath.slice(0, -4); // remove .log
      const ext = '.log';

      // 预置 12 个旧备份
      for (let i = 1; i <= 12; i++) {
        await fs.writeFile(`${base}.${i}${ext}`, `old-${i}`);
      }
      // 主文件大小超阈值
      await fs.writeFile(filePath, 'this is a large content that exceeds limit');

      await rotator.rotate(filePath);

      // .1 现在应包含新内容
      const b1Content = await fs.readFile(`${base}.1${ext}`, 'utf8');
      expect(b1Content).toBe('this is a large content that exceeds limit');
      // .2 现在应包含之前的 .1 (old-1) 内容
      const b2Content = await fs.readFile(`${base}.2${ext}`, 'utf8');
      expect(b2Content).toBe('old-1');
    });

    it('maxBackups=3 时预置 10 个备份应保留最近 3 个', async () => {
      const rotator = new LogRotator({ maxSize: 5, maxBackups: 3 });
      const filePath = path.join(tmpDir, 'ten-backups.log');
      const base = filePath.slice(0, -4);
      const ext = '.log';

      // 预置 10 个旧备份
      for (let i = 1; i <= 10; i++) {
        await fs.writeFile(`${base}.${i}${ext}`, `old-${i}`);
      }
      await fs.writeFile(filePath, 'new content bigger than 5 bytes limit');

      await rotator.rotate(filePath);

      // .1 应是新内容
      const b1 = await fs.readFile(`${base}.1${ext}`, 'utf8');
      expect(b1).toBe('new content bigger than 5 bytes limit');
      // .2 应是之前的 .1 内容
      const b2 = await fs.readFile(`${base}.2${ext}`, 'utf8');
      expect(b2).toBe('old-1');
      // .3 应是之前的 .2 内容
      const b3 = await fs.readFile(`${base}.3${ext}`, 'utf8');
      expect(b3).toBe('old-2');
    });

    it('轮转过程中逐步推进备份编号（10 次轮转）', async () => {
      const rotator = new LogRotator({ maxSize: 5, maxBackups: 10 });
      const filePath = path.join(tmpDir, 'progressive.log');
      const base = filePath.slice(0, -4);
      const ext = '.log';

      // 预置 .1..9 共 9 个备份
      for (let i = 1; i <= 9; i++) {
        await fs.writeFile(`${base}.${i}${ext}`, `old-${i}`);
      }
      await fs.writeFile(filePath, 'new content longer than 5 bytes');

      await rotator.rotate(filePath);

      // 主文件应变为 .1（内容是"new content..."）
      const b1Content = await fs.readFile(`${base}.1${ext}`, 'utf8');
      expect(b1Content).toBe('new content longer than 5 bytes');
      // 旧 .1 变为 .2
      const b2Content = await fs.readFile(`${base}.2${ext}`, 'utf8');
      expect(b2Content).toBe('old-1');
      // 旧 .9 变为 .10
      const b10Content = await fs.readFile(`${base}.10${ext}`, 'utf8');
      expect(b10Content).toBe('old-9');
    });
  });

  describe('backup 已存在时的覆盖测试', () => {
    it('轮转应覆盖已存在的旧备份内容', async () => {
      const rotator = new LogRotator({ maxSize: 5, maxBackups: 3 });
      const filePath = path.join(tmpDir, 'overwrite.log');
      const base = filePath.slice(0, -4);
      const ext = '.log';

      // 预置 .1 内容为 "stale-old"
      await fs.writeFile(`${base}.1${ext}`, 'stale-old');
      // 主文件内容不同
      await fs.writeFile(filePath, 'fresh-new-content');

      await rotator.rotate(filePath);

      // .1 现在应包含主文件原内容
      const b1Content = await fs.readFile(`${base}.1${ext}`, 'utf8');
      expect(b1Content).toBe('fresh-new-content');
      expect(b1Content).not.toBe('stale-old');
    });

    it('连续多次轮转应不断覆盖最新的 .1 备份', async () => {
      const rotator = new LogRotator({ maxSize: 5, maxBackups: 3 });
      const filePath = path.join(tmpDir, 'consecutive-overwrite.log');
      const base = filePath.slice(0, -4);

      // 第一次轮转
      await fs.writeFile(filePath, 'first-rotation-content');
      await rotator.rotate(filePath);
      let b1 = await fs.readFile(`${base}.1.log`, 'utf8');
      expect(b1).toBe('first-rotation-content');

      // 第二次轮转
      await fs.writeFile(filePath, 'second-rotation-content');
      await rotator.rotate(filePath);
      b1 = await fs.readFile(`${base}.1.log`, 'utf8');
      expect(b1).toBe('second-rotation-content');
      // .2 应包含第一次的内容
      const b2 = await fs.readFile(`${base}.2.log`, 'utf8');
      expect(b2).toBe('first-rotation-content');
    });

    it('轮转覆盖应保留 maxBackups 限制', async () => {
      const rotator = new LogRotator({ maxSize: 5, maxBackups: 2 });
      const filePath = path.join(tmpDir, 'limit-overwrite.log');
      const base = filePath.slice(0, -4);

      // 第一次轮转
      await fs.writeFile(filePath, 'first-big-content');
      await rotator.rotate(filePath);

      // 第二次轮转
      await fs.writeFile(filePath, 'second-big-content');
      await rotator.rotate(filePath);

      // 第三次轮转
      await fs.writeFile(filePath, 'third-big-content');
      await rotator.rotate(filePath);

      // 验证 .1 = third, .2 = second
      const b1 = await fs.readFile(`${base}.1.log`, 'utf8');
      const b2 = await fs.readFile(`${base}.2.log`, 'utf8');
      expect(b1).toBe('third-big-content');
      expect(b2).toBe('second-big-content');
      // .3 不应存在（maxBackups=2）
      const b3Exists = await fs.access(`${base}.3.log`).then(() => true).catch(() => false);
      expect(b3Exists).toBe(false);
    });
  });
});
