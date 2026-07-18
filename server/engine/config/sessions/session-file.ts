import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { acquireFileLock, withFileLock } from '../../../infra/file-lock.js';
import {
  getSessionFilePath,
  getArchivedSessionFilePath,
  getTempFilePath,
  isValidSessionId,
  getSessionIdFromFilePath,
} from './paths.js';
import type { SessionFileInfo } from './types.js';

const READ_LOCK_TIMEOUT_MS = 5000;
const WRITE_LOCK_TIMEOUT_MS = 10000;

export function sessionFileExists(baseDir: string, sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false;
  const filePath = getSessionFilePath(baseDir, sessionId);
  return fs.existsSync(filePath);
}

export function archivedSessionFileExists(archivedDir: string, sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false;
  const filePath = getArchivedSessionFilePath(archivedDir, sessionId);
  return fs.existsSync(filePath);
}

export function readSessionFile(baseDir: string, sessionId: string): string | null {
  if (!isValidSessionId(sessionId)) return null;

  const filePath = getSessionFilePath(baseDir, sessionId);
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    logger.error('[SessionFile] 读取文件失败:', sessionId, err);
    return null;
  }
}

export function readArchivedSessionFile(archivedDir: string, sessionId: string): string | null {
  if (!isValidSessionId(sessionId)) return null;

  const filePath = getArchivedSessionFilePath(archivedDir, sessionId);
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    logger.error('[SessionFile] 读取归档文件失败:', sessionId, err);
    return null;
  }
}

export async function writeSessionFileAtomic(
  baseDir: string,
  sessionId: string,
  content: string,
  enableLocking: boolean = true
): Promise<boolean> {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);
  const tempPath = getTempFilePath(filePath, sessionId);

  const writeFn = async (): Promise<boolean> => {
    try {
      const tempDir = path.dirname(tempPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, filePath);
      return true;
    } catch (err) {
      logger.error('[SessionFile] 原子写入失败:', sessionId, err);
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // ignore
      }
      return false;
    }
  };

  if (enableLocking) {
    try {
      return await withFileLock(filePath, writeFn, WRITE_LOCK_TIMEOUT_MS);
    } catch (err) {
      logger.error('[SessionFile] 获取写入锁失败:', sessionId, err);
      return false;
    }
  }

  return writeFn();
}

export async function appendToSessionFile(
  baseDir: string,
  sessionId: string,
  line: string,
  enableLocking: boolean = true
): Promise<boolean> {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);

  const appendFn = async (): Promise<boolean> => {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fd = fs.openSync(filePath, 'a');
      try {
        fs.writeSync(fd, line + '\n');
      } finally {
        fs.closeSync(fd);
      }
      return true;
    } catch (err) {
      logger.error('[SessionFile] 追加写入失败:', sessionId, err);
      return false;
    }
  };

  if (enableLocking) {
    try {
      return await withFileLock(filePath, appendFn, WRITE_LOCK_TIMEOUT_MS);
    } catch (err) {
      logger.error('[SessionFile] 获取追加锁失败:', sessionId, err);
      return false;
    }
  }

  return appendFn();
}

export function deleteSessionFile(baseDir: string, sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    logger.error('[SessionFile] 删除文件失败:', sessionId, err);
    return false;
  }
}

export function deleteArchivedSessionFile(archivedDir: string, sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getArchivedSessionFilePath(archivedDir, sessionId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    logger.error('[SessionFile] 删除归档文件失败:', sessionId, err);
    return false;
  }
}

export function moveSessionToArchive(
  baseDir: string,
  archivedDir: string,
  sessionId: string
): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const srcPath = getSessionFilePath(baseDir, sessionId);
  const destPath = getArchivedSessionFilePath(archivedDir, sessionId);

  try {
    if (!fs.existsSync(srcPath)) return false;

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.renameSync(srcPath, destPath);
    return true;
  } catch (err) {
    logger.error('[SessionFile] 移动到归档失败:', sessionId, err);
    return false;
  }
}

export function moveSessionFromArchive(
  baseDir: string,
  archivedDir: string,
  sessionId: string
): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const srcPath = getArchivedSessionFilePath(archivedDir, sessionId);
  const destPath = getSessionFilePath(baseDir, sessionId);

  try {
    if (!fs.existsSync(srcPath)) return false;

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.renameSync(srcPath, destPath);
    return true;
  } catch (err) {
    logger.error('[SessionFile] 从归档恢复失败:', sessionId, err);
    return false;
  }
}

export function getSessionFileInfo(
  baseDir: string,
  sessionId: string,
  isArchived: boolean = false
): SessionFileInfo | null {
  if (!isValidSessionId(sessionId)) return null;

  const dir = isArchived
    ? path.dirname(getArchivedSessionFilePath(baseDir, sessionId))
    : baseDir;
  const filePath = isArchived
    ? getArchivedSessionFilePath(baseDir, sessionId)
    : getSessionFilePath(baseDir, sessionId);

  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);

    return {
      path: filePath,
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
      isArchived,
    };
  } catch (err) {
    logger.error('[SessionFile] 获取文件信息失败:', sessionId, err);
    return null;
  }
}

export function listSessionFiles(baseDir: string): string[] {
  try {
    if (!fs.existsSync(baseDir)) return [];

    const files = fs.readdirSync(baseDir);
    const sessionIds: string[] = [];

    for (const file of files) {
      const sessionId = getSessionIdFromFilePath(file);
      if (sessionId) {
        sessionIds.push(sessionId);
      }
    }

    return sessionIds;
  } catch (err) {
    logger.error('[SessionFile] 列出会话文件失败:', err);
    return [];
  }
}

export function listArchivedSessionFiles(archivedDir: string): string[] {
  return listSessionFiles(archivedDir);
}

export function getSessionFileSize(baseDir: string, sessionId: string): number {
  const info = getSessionFileInfo(baseDir, sessionId, false);
  return info?.size ?? 0;
}

export function readSessionFirstLine(baseDir: string, sessionId: string): string | null {
  if (!isValidSessionId(sessionId)) return null;

  const filePath = getSessionFilePath(baseDir, sessionId);
  try {
    if (!fs.existsSync(filePath)) return null;

    const buffer = Buffer.alloc(64 * 1024);
    const fd = fs.openSync(filePath, 'r');
    try {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (bytesRead === 0) return null;

      const content = buffer.toString('utf-8', 0, bytesRead);
      const newlineIndex = content.indexOf('\n');
      return newlineIndex >= 0 ? content.slice(0, newlineIndex) : content;
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    logger.error('[SessionFile] 读取首行失败:', sessionId, err);
    return null;
  }
}

export async function rewriteSessionFirstLine(
  baseDir: string,
  sessionId: string,
  newFirstLine: string,
  enableLocking: boolean = true
): Promise<boolean> {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);

  const rewriteFn = async (): Promise<boolean> => {
    try {
      if (!fs.existsSync(filePath)) return false;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      lines[0] = newFirstLine;
      const newContent = lines.join('\n');

      const tempPath = getTempFilePath(filePath, sessionId);
      const tempDir = path.dirname(tempPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(tempPath, newContent, 'utf-8');
      fs.renameSync(tempPath, filePath);
      return true;
    } catch (err) {
      logger.error('[SessionFile] 重写首行失败:', sessionId, err);
      return false;
    }
  };

  if (enableLocking) {
    try {
      return await withFileLock(filePath, rewriteFn, WRITE_LOCK_TIMEOUT_MS);
    } catch (err) {
      logger.error('[SessionFile] 获取重写锁失败:', sessionId, err);
      return false;
    }
  }

  return rewriteFn();
}
