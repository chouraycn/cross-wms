import { logger } from '../../logger.js';
import { AppPaths } from '../../config/appPaths.js';

const MEMORY_FILE_NAME = 'MEMORY.md';
const SOUL_FILE_NAME = 'SOUL.md';

export function resolveRootMemoryPath(agentId?: string): string {
  if (agentId) {
    return `${AppPaths.rootDir}/agents/${agentId}/${MEMORY_FILE_NAME}`;
  }
  return `${AppPaths.rootDir}/${MEMORY_FILE_NAME}`;
}

export function resolveRootSoulPath(agentId?: string): string {
  if (agentId) {
    return `${AppPaths.rootDir}/agents/${agentId}/${SOUL_FILE_NAME}`;
  }
  return `${AppPaths.rootDir}/${SOUL_FILE_NAME}`;
}

export async function readRootMemory(agentId?: string): Promise<string | null> {
  const path = resolveRootMemoryPath(agentId);
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    logger.debug(`[Memory:RootFiles] Read memory: ${path}`);
    return content;
  } catch {
    return null;
  }
}

export async function writeRootMemory(content: string, agentId?: string): Promise<void> {
  const path = resolveRootMemoryPath(agentId);
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(path, content, 'utf-8');
    logger.debug(`[Memory:RootFiles] Wrote memory: ${path}`);
  } catch (err) {
    logger.error(`[Memory:RootFiles] Failed to write memory: ${err}`);
  }
}

export async function readRootSoul(agentId?: string): Promise<string | null> {
  const path = resolveRootSoulPath(agentId);
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    logger.debug(`[Memory:RootFiles] Read soul: ${path}`);
    return content;
  } catch {
    return null;
  }
}

export async function writeRootSoul(content: string, agentId?: string): Promise<void> {
  const path = resolveRootSoulPath(agentId);
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(path, content, 'utf-8');
    logger.debug(`[Memory:RootFiles] Wrote soul: ${path}`);
  } catch (err) {
    logger.error(`[Memory:RootFiles] Failed to write soul: ${err}`);
  }
}