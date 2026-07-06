import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';

export const CANONICAL_ROOT_MEMORY_FILENAME = 'MEMORY.md';
export const LEGACY_ROOT_MEMORY_FILENAME = 'memory.md';
const ROOT_MEMORY_REPAIR_RELATIVE_DIR = '.openclaw-repair/root-memory';

export function resolveCanonicalRootMemoryPath(workspaceDir: string): string {
  return path.join(workspaceDir, CANONICAL_ROOT_MEMORY_FILENAME);
}

export function resolveLegacyRootMemoryPath(workspaceDir: string): string {
  return path.join(workspaceDir, LEGACY_ROOT_MEMORY_FILENAME);
}

export function resolveRootMemoryRepairDir(workspaceDir: string): string {
  return path.join(workspaceDir, '.openclaw-repair', 'root-memory');
}

function normalizeWorkspaceRelativePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

export async function exactWorkspaceEntryExists(dir: string, name: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.includes(name);
  } catch {
    return false;
  }
}

export async function resolveCanonicalRootMemoryFile(workspaceDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(workspaceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === CANONICAL_ROOT_MEMORY_FILENAME &&
        entry.isFile() &&
        !entry.isSymbolicLink()
      ) {
        return path.join(workspaceDir, entry.name);
      }
    }
  } catch {}
  return null;
}

export function shouldSkipRootMemoryAuxiliaryPath(params: {
  workspaceDir: string;
  absPath: string;
}): boolean {
  const relative = path.relative(params.workspaceDir, params.absPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  const normalized = normalizeWorkspaceRelativePath(relative);
  return (
    normalized === LEGACY_ROOT_MEMORY_FILENAME ||
    normalized === ROOT_MEMORY_REPAIR_RELATIVE_DIR ||
    normalized.startsWith(`${ROOT_MEMORY_REPAIR_RELATIVE_DIR}/`)
  );
}

export async function readRootMemoryContent(workspaceDir: string): Promise<string | null> {
  const canonicalPath = resolveCanonicalRootMemoryPath(workspaceDir);
  try {
    const stat = await fs.stat(canonicalPath);
    if (stat.isFile()) {
      return fs.readFile(canonicalPath, 'utf-8');
    }
  } catch {
    logger.debug('[RootMemory] 未找到标准根记忆文件，尝试查找遗留文件');
  }

  const legacyPath = resolveLegacyRootMemoryPath(workspaceDir);
  try {
    const stat = await fs.stat(legacyPath);
    if (stat.isFile()) {
      logger.debug('[RootMemory] 使用遗留根记忆文件');
      return fs.readFile(legacyPath, 'utf-8');
    }
  } catch {
    logger.debug('[RootMemory] 未找到根记忆文件');
  }

  return null;
}

export async function writeRootMemoryContent(workspaceDir: string, content: string): Promise<void> {
  const canonicalPath = resolveCanonicalRootMemoryPath(workspaceDir);
  try {
    await fs.writeFile(canonicalPath, content, 'utf-8');
    logger.debug('[RootMemory] 根记忆文件已写入');
  } catch (err) {
    logger.error('[RootMemory] 写入根记忆文件失败:', err);
    throw new Error(`写入根记忆文件失败: ${(err as Error).message}`);
  }
}

export async function rootMemoryExists(workspaceDir: string): Promise<boolean> {
  const canonical = await resolveCanonicalRootMemoryFile(workspaceDir);
  if (canonical) return true;

  const legacyPath = resolveLegacyRootMemoryPath(workspaceDir);
  try {
    const stat = await fs.stat(legacyPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function migrateLegacyRootMemory(workspaceDir: string): Promise<boolean> {
  const legacyPath = resolveLegacyRootMemoryPath(workspaceDir);
  const canonicalPath = resolveCanonicalRootMemoryPath(workspaceDir);

  try {
    const legacyStat = await fs.stat(legacyPath);
    if (!legacyStat.isFile()) return false;
  } catch {
    return false;
  }

  try {
    const canonicalStat = await fs.stat(canonicalPath);
    if (canonicalStat.isFile()) {
      logger.debug('[RootMemory] 标准根记忆文件已存在，跳过迁移');
      return false;
    }
  } catch {}

  try {
    const content = await fs.readFile(legacyPath, 'utf-8');
    await fs.writeFile(canonicalPath, content, 'utf-8');

    const repairDir = resolveRootMemoryRepairDir(workspaceDir);
    await fs.mkdir(repairDir, { recursive: true });
    const backupPath = path.join(repairDir, `memory.md.backup.${Date.now()}`);
    await fs.copyFile(legacyPath, backupPath);

    await fs.unlink(legacyPath);
    logger.info('[RootMemory] 遗留根记忆文件已迁移');
    return true;
  } catch (err) {
    logger.error('[RootMemory] 迁移根记忆文件失败:', err);
    return false;
  }
}