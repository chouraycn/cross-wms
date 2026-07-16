import { mkdir, open, rename, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { logger } from '../../logger.js';

export type FileLockOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export type FileLockHandle = {
  release: () => Promise<void>;
  lockPath: string;
};

export class FileLockTimeoutError extends Error {
  constructor(public lockPath: string, timeoutMs: number) {
    super(`File lock timeout: ${lockPath} after ${timeoutMs}ms`);
    this.name = 'FileLockTimeoutError';
  }
}

export const FILE_LOCK_TIMEOUT_ERROR_CODE = 'FILE_LOCK_TIMEOUT';

export async function acquireFileLock(
  lockPath: string,
  options?: FileLockOptions,
): Promise<FileLockHandle> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  await mkdir(dirname(lockPath), { recursive: true });

  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.write(`${process.pid}\n${Date.now()}\n`);
      await handle.close();
      return {
        lockPath,
        release: async () => {
          try { await unlink(lockPath); } catch { /* already released */ }
        },
      };
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  throw new FileLockTimeoutError(lockPath, timeoutMs);
}

export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const handle = await acquireFileLock(lockPath, options);
  try {
    return await fn();
  } finally {
    await handle.release();
  }
}
