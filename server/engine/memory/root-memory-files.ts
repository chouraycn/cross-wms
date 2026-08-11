import { logger } from '../../logger.js';
import { AppPaths } from '../../config/appPaths.js';
import {
  chunkText,
  syncMemoryMdChunkToVec,
} from '../vecMemoryStore.js';

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

    // D1: 写入 MEMORY.md 成功后，分块同步到向量记忆（source='memory_md'，最高优先级）
    try {
      if (content && content.trim().length > 0) {
        const chunks = chunkText(content, { maxChars: 1500, overlapChars: 300 });
        const metadata: Record<string, any> = {
          source: 'MEMORY.md',
          path,
          syncedAt: Date.now(),
        };
        if (agentId) metadata.agentId = agentId;
        const importance = 0.9; // MEMORY.md 结构化内容赋予更高重要性
        await Promise.all(
          chunks.map((chunk, i) =>
            syncMemoryMdChunkToVec(
              chunk,
              { ...metadata, chunkIndex: i, totalChunks: chunks.length },
              'project_memory',
              importance,
            ),
          ),
        );
        logger.debug(
          `[Memory:RootFiles] MEMORY.md 同步向量记忆完成: chunks=${chunks.length}, path=${path}`,
        );
      }
    } catch (syncErr) {
      // 向量同步失败不应阻断 MEMORY.md 写入，仅记录错误
      logger.warn(
        `[Memory:RootFiles] MEMORY.md 同步向量记忆失败（不影响文件写入）: ${
          syncErr instanceof Error ? syncErr.message : String(syncErr)
        }`,
      );
    }
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