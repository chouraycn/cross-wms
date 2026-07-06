import EventEmitter from 'eventemitter3';
import type { MemoryBackendConfig, MemoryStats, MemoryBackendType } from './types';

export interface EngineStorageEvents {
  storage_initialized: [config: MemoryBackendConfig];
  storage_migrated: [fromVersion: string, toVersion: string];
  storage_full: [usagePercent: number];
  storage_error: [error: Error];
}

export interface StorageUsage {
  usedBytes: number;
  totalBytes?: number;
  percentage: number;
  entryCount: number;
  lastUpdated: number;
}

export interface MigrationPlan {
  fromVersion: string;
  toVersion: string;
  steps: Array<{ name: string; description: string }>;
  estimatedDuration?: number;
  backupRequired: boolean;
}

export class EngineStorage extends EventEmitter<EngineStorageEvents> {
  private config: MemoryBackendConfig | null = null;
  private usage: StorageUsage | null = null;
  private currentVersion = '1.0.0';
  private migrations: Map<string, (config: MemoryBackendConfig) => Promise<void>> = new Map();

  async initialize(config: MemoryBackendConfig): Promise<void> {
    this.config = config;
    this.usage = {
      usedBytes: 0,
      totalBytes: undefined,
      percentage: 0,
      entryCount: 0,
      lastUpdated: Date.now(),
    };
    this.emit('storage_initialized', config);
  }

  getUsage(): StorageUsage | null {
    return this.usage ? { ...this.usage } : null;
  }

  updateUsage(usage: Partial<StorageUsage>): void {
    if (!this.usage) return;

    this.usage = { ...this.usage, ...usage, lastUpdated: Date.now() };

    if (this.usage.percentage >= 80) {
      this.emit('storage_full', this.usage.percentage);
    }
  }

  getVersion(): string {
    return this.currentVersion;
  }

  registerMigration(
    version: string,
    migration: (config: MemoryBackendConfig) => Promise<void>,
  ): void {
    this.migrations.set(version, migration);
  }

  async migrateTo(targetVersion: string): Promise<boolean> {
    if (!this.config) {
      throw new Error('Storage not initialized');
    }

    const migration = this.migrations.get(targetVersion);
    if (!migration) {
      return false;
    }

    try {
      await migration(this.config);
      const oldVersion = this.currentVersion;
      this.currentVersion = targetVersion;
      this.emit('storage_migrated', oldVersion, targetVersion);
      return true;
    } catch (error) {
      this.emit('storage_error', error as Error);
      throw error;
    }
  }

  planMigration(targetVersion: string): MigrationPlan | null {
    if (!this.migrations.has(targetVersion)) {
      return null;
    }

    return {
      fromVersion: this.currentVersion,
      toVersion: targetVersion,
      steps: [
        { name: 'backup', description: '备份现有数据' },
        { name: 'migrate', description: '执行数据迁移' },
        { name: 'verify', description: '验证迁移结果' },
      ],
      backupRequired: true,
    };
  }

  getBackendType(): MemoryBackendType | null {
    return this.config?.type || null;
  }

  getConfig(): MemoryBackendConfig | null {
    return this.config ? { ...this.config } : null;
  }

  async backup(destination: string): Promise<boolean> {
    return true;
  }

  async restore(source: string): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    return this.config !== null;
  }

  getStats(): Partial<MemoryStats> {
    return {
      totalEntries: this.usage?.entryCount ?? 0,
      lastUpdated: this.usage?.lastUpdated ?? Date.now(),
      isHealthy: this.config !== null,
    };
  }
}

export const engineStorage = new EngineStorage();
