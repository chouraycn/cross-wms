import EventEmitter from 'eventemitter3';
import type { MemoryEntry } from './types';

export type DreamingPhase = 'idle' | 'consolidating' | 'reflecting' | 'clustering' | 'pruning' | 'indexing';

export interface DreamingOptions {
  enabled?: boolean;
  intervalMs?: number;
  batchSize?: number;
  minSimilarity?: number;
  maxClusters?: number;
  autoPrune?: boolean;
  pruneThresholdDays?: number;
}

export interface DreamingStats {
  totalSessions: number;
  totalMemoriesConsolidated: number;
  totalClusters: number;
  lastRunAt?: number;
  currentPhase: DreamingPhase;
  isRunning: boolean;
}

export interface MemoryCluster {
  id: string;
  center: string;
  entries: MemoryEntry[];
  tags: string[];
  summary?: string;
  createdAt: number;
  lastUpdated: number;
}

export interface DreamingEvents {
  dreaming_started: [];
  dreaming_finished: [stats: DreamingStats];
  phase_changed: [phase: DreamingPhase];
  cluster_created: [cluster: MemoryCluster];
  memory_consolidated: [entry: MemoryEntry];
  memory_pruned: [id: number];
  error: [error: Error];
}

export class MemoryDreaming extends EventEmitter<DreamingEvents> {
  private options: DreamingOptions;
  private clusters: Map<string, MemoryCluster> = new Map();
  private stats: DreamingStats = {
    totalSessions: 0,
    totalMemoriesConsolidated: 0,
    totalClusters: 0,
    currentPhase: 'idle',
    isRunning: false,
  };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DreamingOptions = {}) {
    super();
    this.options = {
      enabled: false,
      intervalMs: 3600000,
      batchSize: 100,
      minSimilarity: 0.7,
      maxClusters: 100,
      autoPrune: false,
      pruneThresholdDays: 90,
      ...options,
    };
  }

  start(): void {
    if (this.timer || !this.options.enabled) return;

    this.timer = setInterval(() => {
      this.runDreamingCycle().catch(() => {});
    }, this.options.intervalMs!);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setPhase('idle');
  }

  async runDreamingCycle(): Promise<DreamingStats> {
    if (this.stats.isRunning) {
      return this.stats;
    }

    this.stats.isRunning = true;
    this.emit('dreaming_started');

    try {
      this.setPhase('consolidating');
      await this.consolidateMemories();

      this.setPhase('reflecting');
      await this.reflectAndSummarize();

      this.setPhase('clustering');
      await this.formClusters();

      if (this.options.autoPrune) {
        this.setPhase('pruning');
        await this.pruneOldMemories();
      }

      this.setPhase('indexing');
      await this.rebuildIndex();

      this.stats.totalSessions++;
      this.stats.lastRunAt = Date.now();

      this.emit('dreaming_finished', { ...this.stats });
      return { ...this.stats };
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    } finally {
      this.stats.isRunning = false;
      this.setPhase('idle');
    }
  }

  private setPhase(phase: DreamingPhase): void {
    this.stats.currentPhase = phase;
    this.emit('phase_changed', phase);
  }

  private async consolidateMemories(): Promise<void> {
    this.stats.totalMemoriesConsolidated++;
  }

  private async reflectAndSummarize(): Promise<void> {
    for (const cluster of this.clusters.values()) {
      if (cluster.entries.length >= 3 && !cluster.summary) {
        cluster.summary = `总结了 ${cluster.entries.length} 条相关记忆`;
        cluster.lastUpdated = Date.now();
      }
    }
  }

  private async formClusters(): Promise<void> {
    if (this.clusters.size >= (this.options.maxClusters || 100)) {
      return;
    }
  }

  private async pruneOldMemories(): Promise<number> {
    let pruned = 0;
    const threshold = Date.now() - (this.options.pruneThresholdDays || 90) * 24 * 60 * 60 * 1000;

    for (const cluster of this.clusters.values()) {
      const before = cluster.entries.length;
      cluster.entries = cluster.entries.filter((e) => e.createdAt >= threshold);
      pruned += before - cluster.entries.length;
    }

    return pruned;
  }

  private async rebuildIndex(): Promise<void> {
  }

  getStats(): DreamingStats {
    return { ...this.stats };
  }

  getClusters(): MemoryCluster[] {
    return Array.from(this.clusters.values());
  }

  getCluster(id: string): MemoryCluster | undefined {
    return this.clusters.get(id);
  }

  setOptions(options: Partial<DreamingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): DreamingOptions {
    return { ...this.options };
  }

  clearClusters(): void {
    this.clusters.clear();
    this.stats.totalClusters = 0;
  }
}

export const memoryDreaming = new MemoryDreaming();

// Stub exports required by server/engine plugins
export const DEFAULT_MEMORY_DREAMING_PLUGIN_ID = 'memory-dreaming';
export const resolveMemoryDreamingConfig = (_config?: unknown) => ({ enabled: true });
export const resolveMemoryDreamingPluginConfig = resolveMemoryDreamingConfig;
export const resolveMemoryDreamingPluginId = () => DEFAULT_MEMORY_DREAMING_PLUGIN_ID;
