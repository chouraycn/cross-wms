import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';

const lockStore = new Map<string, {
  lockFile: string;
  acquiredAt: number;
  owner: string;
}>();

export interface WriteLockOptions {
  timeoutMs?: number;
  retryIntervalMs?: number;
  owner?: string;
}

function getLockFilePath(sessionId: string): string {
  return path.join(require('./session-dirs.js').getSessionDir(sessionId), '.write.lock');
}

export function acquireWriteLock(
  sessionId: string,
  options: WriteLockOptions = {},
): boolean {
  const timeoutMs = options.timeoutMs ?? 5000;
  const retryIntervalMs = options.retryIntervalMs ?? 50;
  const owner = options.owner ?? 'unknown';
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const existing = lockStore.get(sessionId);
    if (!existing) {
      try {
        require('./session-dirs.js').ensureSessionDir(sessionId);
        const lockFile = getLockFilePath(sessionId);
        fs.writeFileSync(lockFile, JSON.stringify({
          owner,
          acquiredAt: Date.now(),
          pid: process.pid,
        }), 'utf-8');

        lockStore.set(sessionId, {
          lockFile,
          acquiredAt: Date.now(),
          owner,
        });
        
        logger.debug(`[Agents:SessionWriteLock] Acquired lock for ${sessionId} (owner: ${owner})`);
        return true;
      } catch (err) {
        logger.warn(`[Agents:SessionWriteLock] Failed to acquire lock for ${sessionId}:`, err);
      }
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryIntervalMs);
  }

  logger.warn(`[Agents:SessionWriteLock] Timeout acquiring lock for ${sessionId}`);
  return false;
}

export function releaseWriteLock(sessionId: string): boolean {
  const lock = lockStore.get(sessionId);
  if (!lock) return false;

  try {
    if (fs.existsSync(lock.lockFile)) {
      fs.unlinkSync(lock.lockFile);
    }
  } catch (err) {
    logger.warn(`[Agents:SessionWriteLock] Failed to remove lock file for ${sessionId}:`, err);
  }

  lockStore.delete(sessionId);
  logger.debug(`[Agents:SessionWriteLock] Released lock for ${sessionId}`);
  return true;
}

export function hasWriteLock(sessionId: string): boolean {
  return lockStore.has(sessionId);
}

export function getLockInfo(sessionId: string) {
  return lockStore.get(sessionId);
}

export function withWriteLock<T>(
  sessionId: string,
  fn: () => T | Promise<T>,
  options?: WriteLockOptions,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const acquired = acquireWriteLock(sessionId, options);
    if (!acquired) {
      reject(new Error(`Failed to acquire write lock for session ${sessionId}`));
      return;
    }

    try {
      const result = fn();
      if (result instanceof Promise) {
        result
          .then(res => {
            releaseWriteLock(sessionId);
            resolve(res);
          })
          .catch(err => {
            releaseWriteLock(sessionId);
            reject(err);
          });
      } else {
        releaseWriteLock(sessionId);
        resolve(result);
      }
    } catch (err) {
      releaseWriteLock(sessionId);
      reject(err);
    }
  });
}

export function forceReleaseWriteLock(sessionId: string): boolean {
  const lock = lockStore.get(sessionId);
  if (lock) {
    try {
      if (fs.existsSync(lock.lockFile)) {
        fs.unlinkSync(lock.lockFile);
      }
    } catch {
      // 忽略
    }
    lockStore.delete(sessionId);
    logger.debug(`[Agents:SessionWriteLock] Force released lock for ${sessionId}`);
    return true;
  }
  return false;
}

export function clearAllWriteLocks(): void {
  for (const sessionId of lockStore.keys()) {
    forceReleaseWriteLock(sessionId);
  }
  lockStore.clear();
}

logger.debug('[Agents:SessionWriteLock] Module loaded');
