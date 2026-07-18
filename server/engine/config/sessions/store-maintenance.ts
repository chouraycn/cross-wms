import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { listSessionFiles, listArchivedSessionFiles, getSessionFileInfo } from './session-file.js';
import { rebuildRegistry, loadRegistry, saveRegistry } from './session-registry-maintenance.js';
import type { SessionRegistry, RegistryEntry } from './session-registry-maintenance.js';
import type { SessionStatus } from './types.js';

export interface MaintenanceStats {
  sessionsChecked: number;
  sessionsRepaired: number;
  sessionsRemoved: number;
  spaceReclaimedBytes: number;
  errors: string[];
}

export interface MaintenanceConfig {
  verifyIntegrity: boolean;
  cleanupOrphans: boolean;
  compactFiles: boolean;
  rebuildIndex: boolean;
  maxRepairs: number;
}

export const defaultMaintenanceConfig: MaintenanceConfig = {
  verifyIntegrity: true,
  cleanupOrphans: true,
  compactFiles: true,
  rebuildIndex: true,
  maxRepairs: 100,
};

export class SessionStoreMaintenance {
  private baseDir: string;
  private archivedDir: string;
  private registryFile: string;

  constructor(baseDir: string, archivedDir: string, registryFile: string) {
    this.baseDir = baseDir;
    this.archivedDir = archivedDir;
    this.registryFile = registryFile;
  }

  runMaintenance(config: Partial<MaintenanceConfig> = {}): MaintenanceStats {
    const cfg = { ...defaultMaintenanceConfig, ...config };
    const stats: MaintenanceStats = {
      sessionsChecked: 0,
      sessionsRepaired: 0,
      sessionsRemoved: 0,
      spaceReclaimedBytes: 0,
      errors: [],
    };

    logger.info('[StoreMaintenance] 开始执行维护任务...');

    try {
      if (cfg.verifyIntegrity) {
        this.verifyIntegrity(stats);
      }

      if (cfg.cleanupOrphans) {
        this.cleanupOrphanedFiles(stats);
      }

      if (cfg.compactFiles) {
        this.compactSessionFiles(stats);
      }

      if (cfg.rebuildIndex) {
        this.rebuildRegistry(stats);
      }

      this.cleanupTempFiles(stats);
    } catch (err) {
      stats.errors.push(`维护失败: ${String(err)}`);
      logger.error('[StoreMaintenance] 维护任务异常:', err);
    }

    logger.info(`[StoreMaintenance] 维护完成: 检查 ${stats.sessionsChecked} 个, 修复 ${stats.sessionsRepaired} 个, 清理 ${stats.sessionsRemoved} 个`);
    return stats;
  }

  private verifyIntegrity(stats: MaintenanceStats): void {
    logger.debug('[StoreMaintenance] 验证会话文件完整性...');

    const activeIds = listSessionFiles(this.baseDir);
    const archivedIds = listArchivedSessionFiles(this.archivedDir);
    const allIds = [...activeIds, ...archivedIds];

    for (const sessionId of allIds) {
      stats.sessionsChecked++;
      const isArchived = !activeIds.includes(sessionId);
      const dir = isArchived ? this.archivedDir : this.baseDir;

      try {
        const repaired = this.repairSessionFile(dir, sessionId, isArchived);
        if (repaired) {
          stats.sessionsRepaired++;
        }
      } catch (err) {
        stats.errors.push(`${sessionId}: ${String(err)}`);
      }
    }
  }

  private repairSessionFile(
    dir: string,
    sessionId: string,
    _isArchived: boolean
  ): boolean {
    const filePath = path.join(dir, `${sessionId}.jsonl`);

    try {
      if (!fs.existsSync(filePath)) return false;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);

      if (lines.length === 0) {
        logger.warn('[StoreMaintenance] 空文件，删除:', sessionId);
        fs.unlinkSync(filePath);
        return true;
      }

      let hasValidFirstLine = false;
      try {
        const firstLine = JSON.parse(lines[0]);
        hasValidFirstLine = !!(firstLine.session || firstLine.metadata);
      } catch {
        hasValidFirstLine = false;
      }

      if (!hasValidFirstLine) {
        logger.warn('[StoreMaintenance] 首行无效，尝试重建首行:', sessionId);
        const now = new Date().toISOString();
        const reconstructedFirstLine = JSON.stringify({
          session: {
            id: sessionId,
            title: '恢复的会话',
            status: 'active',
            createdAt: now,
            updatedAt: now,
            lastActiveAt: now,
            sessionDate: now.split('T')[0],
            messageCount: Math.max(0, lines.length - 1),
            schemaVersion: '1.0.0',
          },
          messages: [],
        });

        const newContent = [reconstructedFirstLine, ...lines.slice(1)].join('\n');
        fs.writeFileSync(filePath, newContent, 'utf-8');
        return true;
      }

      return false;
    } catch (err) {
      logger.error('[StoreMaintenance] 修复会话文件失败:', sessionId, err);
      return false;
    }
  }

  private cleanupOrphanedFiles(stats: MaintenanceStats): void {
    logger.debug('[StoreMaintenance] 清理孤立文件...');

    const tempDir = path.join(this.baseDir, '.tmp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoffTime) {
            const size = stat.size;
            fs.unlinkSync(filePath);
            stats.spaceReclaimedBytes += size;
            stats.sessionsRemoved++;
          }
        } catch {
          // ignore
        }
      }
    }

    const metadataDir = path.join(this.baseDir, 'metadata');
    if (fs.existsSync(metadataDir)) {
      const metaFiles = fs.readdirSync(metadataDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));

      const activeIds = new Set(listSessionFiles(this.baseDir));

      for (const metaId of metaFiles) {
        if (!activeIds.has(metaId)) {
          const metaPath = path.join(metadataDir, `${metaId}.json`);
          try {
            const size = fs.statSync(metaPath).size;
            fs.unlinkSync(metaPath);
            stats.spaceReclaimedBytes += size;
          } catch {
            // ignore
          }
        }
      }
    }
  }

  private compactSessionFiles(stats: MaintenanceStats): void {
    logger.debug('[StoreMaintenance] 压缩会话文件...');

    const activeIds = listSessionFiles(this.baseDir);

    for (const sessionId of activeIds.slice(0, 50)) {
      const filePath = path.join(this.baseDir, `${sessionId}.jsonl`);
      try {
        const originalSize = fs.statSync(filePath).size;
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);

        if (lines.length * 2 < content.length / 100) {
          const compacted = lines.join('\n') + '\n';
          fs.writeFileSync(filePath, compacted, 'utf-8');
          const newSize = fs.statSync(filePath).size;
          stats.spaceReclaimedBytes += Math.max(0, originalSize - newSize);
        }
      } catch {
        // ignore
      }
    }
  }

  private rebuildRegistry(stats: MaintenanceStats): void {
    logger.debug('[StoreMaintenance] 重建会话注册表...');
    rebuildRegistry(this.baseDir, this.archivedDir, this.registryFile);
  }

  private cleanupTempFiles(stats: MaintenanceStats): void {
    logger.debug('[StoreMaintenance] 清理临时文件...');

    const tempDir = path.join(this.baseDir, '.tmp');
    if (!fs.existsSync(tempDir)) return;

    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoffTime) {
            stats.spaceReclaimedBytes += stat.size;
            fs.unlinkSync(filePath);
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      logger.warn('[StoreMaintenance] 清理临时文件失败:', err);
    }
  }

  quickCheck(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];

    try {
      if (!fs.existsSync(this.baseDir)) {
        issues.push('会话目录不存在');
      }

      const registry = loadRegistry(this.registryFile);
      const activeIds = listSessionFiles(this.baseDir);

      if (registry.entries.length > 0 && activeIds.length > 0) {
        const registryIds = new Set(registry.entries.map(e => e.sessionId));
        const fileIds = new Set(activeIds);

        const missingInRegistry = activeIds.filter(id => !registryIds.has(id));
        const missingOnDisk = registry.entries
          .filter(e => e.status === 'active' && !fileIds.has(e.sessionId))
          .map(e => e.sessionId);

        if (missingInRegistry.length > 0) {
          issues.push(`${missingInRegistry.length} 个会话在注册表中缺失`);
        }
        if (missingOnDisk.length > 0) {
          issues.push(`${missingOnDisk.length} 个注册表条目文件不存在`);
        }
      }
    } catch (err) {
      issues.push(`检查失败: ${String(err)}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  getDiskUsage(): { totalBytes: number; activeBytes: number; archivedBytes: number; tempBytes: number } {
    let activeBytes = 0;
    let archivedBytes = 0;
    let tempBytes = 0;

    try {
      const activeIds = listSessionFiles(this.baseDir);
      for (const id of activeIds) {
        const info = getSessionFileInfo(this.baseDir, id, false);
        if (info) activeBytes += info.size;
      }

      const archivedIds = listArchivedSessionFiles(this.archivedDir);
      for (const id of archivedIds) {
        const info = getSessionFileInfo(this.archivedDir, id, true);
        if (info) archivedBytes += info.size;
      }

      const tempDir = path.join(this.baseDir, '.tmp');
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          try {
            tempBytes += fs.statSync(path.join(tempDir, file)).size;
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    return {
      totalBytes: activeBytes + archivedBytes + tempBytes,
      activeBytes,
      archivedBytes,
      tempBytes,
    };
  }

  updateRegistryEntry(
    sessionId: string,
    updates: Partial<RegistryEntry>
  ): void {
    const registry = loadRegistry(this.registryFile);
    const index = registry.entries.findIndex(e => e.sessionId === sessionId);

    if (index >= 0) {
      registry.entries[index] = { ...registry.entries[index], ...updates };
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

    saveRegistry(this.registryFile, registry);
  }

  removeRegistryEntry(sessionId: string): void {
    const registry = loadRegistry(this.registryFile);
    registry.entries = registry.entries.filter(e => e.sessionId !== sessionId);
    saveRegistry(this.registryFile, registry);
  }
}
