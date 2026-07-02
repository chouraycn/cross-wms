// 配置原子变更与冲突检测模块
// 参考 OpenClaw 的 config/mutate.ts 设计，提供基于 mtime 的乐观并发控制

import fs from 'fs';
import path from 'path';

// 配置变更冲突错误（读取后文件被外部修改时抛出）
export class ConfigMutationConflictError extends Error {
  readonly filePath: string;
  readonly expectedMtimeMs: number;
  readonly actualMtimeMs: number;

  constructor(filePath: string, expectedMtimeMs: number, actualMtimeMs: number) {
    super(
      `Config mutation conflict for ${filePath}: expected mtime ${expectedMtimeMs}, actual ${actualMtimeMs}`,
    );
    this.name = 'ConfigMutationConflictError';
    this.filePath = filePath;
    this.expectedMtimeMs = expectedMtimeMs;
    this.actualMtimeMs = actualMtimeMs;
  }
}

// 读取 JSON 配置文件，文件不存在返回 null，解析失败抛出带上下文的错误
export async function readConfigFile<T>(filePath: string): Promise<T | null> {
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  try {
    return JSON.parse(content) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse config file ${filePath}: ${(err as Error).message}`,
    );
  }
}

// 原子写入配置文件（先写临时文件，再 rename），自动创建父目录
export async function writeConfigFile(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const content = JSON.stringify(data, null, 2);

  try {
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
  } catch (err) {
    // 出错时清理临时文件
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // 忽略清理失败
    }
    throw err;
  }
}

// 原子变更配置文件：读取 → transform → 写回
// 支持重试（默认 3 次），通过 mtime 比较进行冲突检测
export async function mutateConfigFile<T>(
  filePath: string,
  transform: (current: T) => T,
  options?: { maxRetries?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 读取当前内容与 mtime
      let current: T;
      let originalMtimeMs: number;

      try {
        const stat = await fs.promises.stat(filePath);
        originalMtimeMs = stat.mtimeMs;
        const content = await fs.promises.readFile(filePath, 'utf-8');
        current = JSON.parse(content) as T;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // 文件不存在，视为初始空状态
          current = null as T;
          originalMtimeMs = 0;
        } else {
          throw err;
        }
      }

      const next = transform(current);

      // 写回前检查 mtime 是否变化（冲突检测）
      try {
        const newStat = await fs.promises.stat(filePath);
        if (newStat.mtimeMs !== originalMtimeMs) {
          throw new ConfigMutationConflictError(
            filePath,
            originalMtimeMs,
            newStat.mtimeMs,
          );
        }
      } catch (err) {
        if (err instanceof ConfigMutationConflictError) {
          throw err;
        }
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // 文件在读取后被删除
          if (originalMtimeMs !== 0) {
            throw new ConfigMutationConflictError(filePath, originalMtimeMs, -1);
          }
          // 文件原本就不存在且仍不存在，可以继续写入
        } else {
          throw err;
        }
      }

      await writeConfigFile(filePath, next);
      return next;
    } catch (err) {
      if (err instanceof ConfigMutationConflictError) {
        lastError = err;
        continue; // 冲突，重试
      }
      throw err; // 非冲突错误直接抛出
    }
  }

  throw lastError ?? new Error('mutateConfigFile: exceeded max retries');
}
