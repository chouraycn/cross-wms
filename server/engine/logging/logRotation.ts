import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 日志轮转器：按文件大小轮转，并按保留策略清理过期日志
 */
export class LogRotator {
  readonly maxSize: number;
  readonly maxBackups: number;
  readonly maxAgeDays: number;

  constructor(options?: { maxSize?: number; maxBackups?: number; maxAgeDays?: number }) {
    // 默认 10MB
    this.maxSize = options?.maxSize ?? 10 * 1024 * 1024;
    // 默认保留 5 个备份
    this.maxBackups = options?.maxBackups ?? 5;
    // 默认保留 7 天
    this.maxAgeDays = options?.maxAgeDays ?? 7;
  }

  /**
   * 检查日志文件大小，超过阈值则执行轮转，返回新文件名或 null
   */
  async rotate(logFilePath: string): Promise<string | null> {
    try {
      const stat = await fs.stat(logFilePath);
      if (stat.size <= this.maxSize) {
        return null;
      }
    } catch {
      // 文件不存在，无需轮转
      return null;
    }

    const ext = path.extname(logFilePath);
    const base = logFilePath.slice(0, logFilePath.length - ext.length);

    // 删除最老的备份
    const oldest = `${base}.${this.maxBackups}${ext}`;
    try {
      await fs.unlink(oldest);
    } catch {
      // 文件可能不存在，忽略
    }

    // 依次重命名备份文件
    for (let index = this.maxBackups - 1; index >= 1; index -= 1) {
      const from = `${base}.${index}${ext}`;
      const to = `${base}.${index + 1}${ext}`;
      try {
        await fs.access(from);
        await fs.rename(from, to);
      } catch {
        // 源文件不存在则跳过
      }
    }

    // 将当前文件重命名为 .1
    const rotated = `${base}.1${ext}`;
    try {
      await fs.rename(logFilePath, rotated);
    } catch {
      return null;
    }

    return rotated;
  }

  /**
   * 清理目录中超过保留天数的旧日志文件
   */
  async cleanup(logDir: string): Promise<void> {
    const entries = await fs.readdir(logDir, { withFileTypes: true });
    const cutoff = Date.now() - this.maxAgeDays * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const fullPath = path.join(logDir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fullPath);
        }
      } catch {
        // 忽略单个文件清理失败
      }
    }
  }
}
