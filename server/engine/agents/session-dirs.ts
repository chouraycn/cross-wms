import path from 'path';
import fs from 'fs';
import { logger } from '../../logger.js';

let baseSessionsDir = './sessions';

export function setSessionsBaseDir(dir: string): void {
  baseSessionsDir = dir;
  logger.debug(`[Agents:SessionDirs] Base sessions dir set to: ${dir}`);
}

export function getSessionsBaseDir(): string {
  return baseSessionsDir;
}

export function getSessionDir(sessionId: string): string {
  return path.join(baseSessionsDir, sessionId);
}

export function ensureSessionDir(sessionId: string): string {
  const dir = getSessionDir(sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.debug(`[Agents:SessionDirs] Created session dir: ${sessionId}`);
  }
  return dir;
}

export function sessionDirExists(sessionId: string): boolean {
  return fs.existsSync(getSessionDir(sessionId));
}

export function deleteSessionDir(sessionId: string): boolean {
  const dir = getSessionDir(sessionId);
  if (!fs.existsSync(dir)) return false;
  
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    logger.debug(`[Agents:SessionDirs] Deleted session dir: ${sessionId}`);
    return true;
  } catch (err) {
    logger.error(`[Agents:SessionDirs] Failed to delete session dir ${sessionId}:`, err);
    return false;
  }
}

export function getSessionFilePath(sessionId: string, fileName: string): string {
  return path.join(getSessionDir(sessionId), fileName);
}

export function listSessionFiles(sessionId: string): string[] {
  const dir = getSessionDir(sessionId);
  if (!fs.existsSync(dir)) return [];
  
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export function listAllSessions(): string[] {
  if (!fs.existsSync(baseSessionsDir)) return [];
  
  try {
    const entries = fs.readdirSync(baseSessionsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}

export function getSessionMetadataPath(sessionId: string): string {
  return getSessionFilePath(sessionId, 'session.json');
}

export function getSessionChatPath(sessionId: string): string {
  return getSessionFilePath(sessionId, 'chat.jsonl');
}

export function getSessionToolCallsPath(sessionId: string): string {
  return getSessionFilePath(sessionId, 'tool-calls.jsonl');
}

export function getSessionMemoryPath(sessionId: string): string {
  return getSessionFilePath(sessionId, 'memory.md');
}

export function getSessionArtifactsDir(sessionId: string): string {
  return path.join(getSessionDir(sessionId), 'artifacts');
}

export function ensureSessionArtifactsDir(sessionId: string): string {
  const dir = getSessionArtifactsDir(sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanupOldSessions(maxAgeDays: number = 30): number {
  const sessions = listAllSessions();
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const sessionId of sessions) {
    const dir = getSessionDir(sessionId);
    try {
      const stat = fs.statSync(dir);
      if (now - stat.mtime.getTime() > maxAgeMs) {
        deleteSessionDir(sessionId);
        cleaned++;
      }
    } catch {
      // 忽略
    }
  }

  if (cleaned > 0) {
    logger.info(`[Agents:SessionDirs] Cleaned up ${cleaned} old sessions`);
  }

  return cleaned;
}

logger.debug('[Agents:SessionDirs] Module loaded');
