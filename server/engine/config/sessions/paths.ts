import path from 'path';
import fs from 'fs';

export interface SessionPaths {
  baseDir: string;
  archivedDir: string;
  tempDir: string;
  registryFile: string;
  indexFile: string;
}

export function resolveSessionPaths(baseDir: string, archivedDir?: string): SessionPaths {
  const resolvedBaseDir = path.resolve(baseDir);
  const resolvedArchivedDir = archivedDir
    ? path.resolve(archivedDir)
    : path.join(path.dirname(resolvedBaseDir), 'sessions-archived');

  return {
    baseDir: resolvedBaseDir,
    archivedDir: resolvedArchivedDir,
    tempDir: path.join(resolvedBaseDir, '.tmp'),
    registryFile: path.join(resolvedBaseDir, '.registry.json'),
    indexFile: path.join(resolvedBaseDir, '.index.json'),
  };
}

export function getSessionFilePath(baseDir: string, sessionId: string): string {
  return path.join(baseDir, `${sessionId}.jsonl`);
}

export function getArchivedSessionFilePath(archivedDir: string, sessionId: string): string {
  return path.join(archivedDir, `${sessionId}.jsonl`);
}

export function getSessionMetadataPath(baseDir: string, sessionId: string): string {
  return path.join(baseDir, 'metadata', `${sessionId}.json`);
}

export function getTempFilePath(targetPath: string, sessionId?: string): string {
  const dir = path.dirname(targetPath);
  const tempDir = path.join(dir, '.tmp');
  const fileName = path.basename(targetPath);
  const suffix = sessionId ? `.${sessionId}` : '';
  return path.join(tempDir, `${fileName}.tmp${suffix}.${Date.now()}`);
}

export function ensureSessionDirs(paths: SessionPaths): void {
  const dirs = [
    paths.baseDir,
    paths.archivedDir,
    paths.tempDir,
    path.join(paths.baseDir, 'metadata'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function isValidSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== 'string') return false;
  if (sessionId.startsWith('.') || sessionId.startsWith('_')) return false;
  if (sessionId.includes('/') || sessionId.includes('\\')) return false;
  if (sessionId.includes('..')) return false;
  return /^[a-zA-Z0-9_-]+$/.test(sessionId);
}

export function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function getSessionIdFromFilePath(filePath: string): string | null {
  const baseName = path.basename(filePath);
  const match = baseName.match(/^([a-zA-Z0-9_-]+)\.jsonl$/);
  return match ? match[1] : null;
}
