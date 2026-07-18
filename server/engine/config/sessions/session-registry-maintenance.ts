import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { listSessionFiles, listArchivedSessionFiles, readSessionFirstLine } from './session-file.js';
import type { SessionMetadata, SessionStatus } from './types.js';

export interface RegistryEntry {
  sessionId: string;
  status: SessionStatus;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  sessionDate: string;
  size: number;
  messageCount: number;
  tags: string[];
}

export interface SessionRegistry {
  version: string;
  lastUpdated: string;
  entries: RegistryEntry[];
}

const REGISTRY_VERSION = '1.0.0';

export function loadRegistry(registryFile: string): SessionRegistry {
  try {
    if (!fs.existsSync(registryFile)) {
      return createEmptyRegistry();
    }

    const content = fs.readFileSync(registryFile, 'utf-8');
    const data = JSON.parse(content);

    if (!data.entries || !Array.isArray(data.entries)) {
      return createEmptyRegistry();
    }

    return data as SessionRegistry;
  } catch (err) {
    logger.warn('[SessionRegistry] 加载注册表失败，重建中:', err);
    return createEmptyRegistry();
  }
}

export function saveRegistry(registryFile: string, registry: SessionRegistry): void {
  try {
    const dir = path.dirname(registryFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    registry.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(registry, null, 2);
    fs.writeFileSync(registryFile, content, 'utf-8');
  } catch (err) {
    logger.error('[SessionRegistry] 保存注册表失败:', err);
  }
}

export function createEmptyRegistry(): SessionRegistry {
  return {
    version: REGISTRY_VERSION,
    lastUpdated: new Date().toISOString(),
    entries: [],
  };
}

export function rebuildRegistry(
  baseDir: string,
  archivedDir: string,
  registryFile: string
): SessionRegistry {
  logger.info('[SessionRegistry] 重建会话注册表...');

  const entries: RegistryEntry[] = [];

  try {
    const activeIds = listSessionFiles(baseDir);
    for (const sessionId of activeIds) {
      const entry = buildRegistryEntry(baseDir, sessionId, 'active');
      if (entry) {
        entries.push(entry);
      }
    }

    const archivedIds = listArchivedSessionFiles(archivedDir);
    for (const sessionId of archivedIds) {
      const entry = buildRegistryEntry(archivedDir, sessionId, 'archived');
      if (entry) {
        entries.push(entry);
      }
    }

    const registry: SessionRegistry = {
      version: REGISTRY_VERSION,
      lastUpdated: new Date().toISOString(),
      entries,
    };

    saveRegistry(registryFile, registry);
    logger.info(`[SessionRegistry] 注册表重建完成，共 ${entries.length} 个会话`);
    return registry;
  } catch (err) {
    logger.error('[SessionRegistry] 重建注册表失败:', err);
    return createEmptyRegistry();
  }
}

function buildRegistryEntry(
  dir: string,
  sessionId: string,
  status: SessionStatus
): RegistryEntry | null {
  try {
    const firstLine = readSessionFirstLine(dir, sessionId);
    if (!firstLine) return null;

    const parsed = JSON.parse(firstLine);
    const metadata: Partial<SessionMetadata> = parsed.session || {};

    const filePath = path.join(dir, `${sessionId}.jsonl`);
    let size = 0;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      // ignore
    }

    return {
      sessionId,
      status,
      title: metadata.title || '未命名会话',
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: metadata.updatedAt || new Date().toISOString(),
      lastActiveAt: metadata.lastActiveAt || new Date().toISOString(),
      sessionDate: metadata.sessionDate || new Date().toISOString().split('T')[0],
      size,
      messageCount: metadata.messageCount || 0,
      tags: metadata.tags || [],
    };
  } catch {
    return null;
  }
}

export function updateRegistryEntry(
  registry: SessionRegistry,
  sessionId: string,
  updates: Partial<RegistryEntry>
): SessionRegistry {
  const index = registry.entries.findIndex(e => e.sessionId === sessionId);

  if (index >= 0) {
    registry.entries[index] = {
      ...registry.entries[index],
      ...updates,
    };
  } else if (updates.status) {
    registry.entries.push({
      sessionId,
      status: updates.status,
      title: updates.title || '未命名会话',
      createdAt: updates.createdAt || new Date().toISOString(),
      updatedAt: updates.updatedAt || new Date().toISOString(),
      lastActiveAt: updates.lastActiveAt || new Date().toISOString(),
      sessionDate: updates.sessionDate || new Date().toISOString().split('T')[0],
      size: updates.size || 0,
      messageCount: updates.messageCount || 0,
      tags: updates.tags || [],
    });
  }

  registry.lastUpdated = new Date().toISOString();
  return registry;
}

export function removeRegistryEntry(registry: SessionRegistry, sessionId: string): SessionRegistry {
  registry.entries = registry.entries.filter(e => e.sessionId !== sessionId);
  registry.lastUpdated = new Date().toISOString();
  return registry;
}

export function findRegistryEntries(
  registry: SessionRegistry,
  options: {
    status?: SessionStatus | SessionStatus[];
    searchQuery?: string;
    tags?: string[];
  } = {}
): RegistryEntry[] {
  let results = [...registry.entries];

  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    results = results.filter(e => statuses.includes(e.status));
  }

  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase();
    results = results.filter(e =>
      e.title.toLowerCase().includes(query) ||
      e.sessionId.toLowerCase().includes(query) ||
      e.tags.some(t => t.toLowerCase().includes(query))
    );
  }

  if (options.tags && options.tags.length > 0) {
    results = results.filter(e =>
      options.tags!.some(tag => e.tags.includes(tag))
    );
  }

  return results;
}

export function getRegistryStats(registry: SessionRegistry): {
  total: number;
  active: number;
  archived: number;
  totalSize: number;
} {
  let active = 0;
  let archived = 0;
  let totalSize = 0;

  for (const entry of registry.entries) {
    if (entry.status === 'active') active++;
    if (entry.status === 'archived') archived++;
    totalSize += entry.size;
  }

  return {
    total: registry.entries.length,
    active,
    archived,
    totalSize,
  };
}
