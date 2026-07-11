/**
 * Runtime bridge for memory search manager lifecycle.
 *
 * Semantic adaptation of openclaw/src/plugins/memory-runtime.ts.
 * Manages per-agent MemoryQueryEngine instances backed by EngineStorage,
 * replacing the plugin-runtime resolution model with direct SDK composition.
 */
import { MemoryQueryEngine } from './query.js';
import { EngineStorage, engineStorage } from './engine-storage.js';
import type { MemoryBackend, MemoryBackendConfig } from './types.js';

export type MemoryRuntimeQmdConfig = {
  command?: string;
};

export type MemoryRuntimeBackendConfig =
  | { backend: 'builtin' }
  | { backend: 'qmd'; qmd?: MemoryRuntimeQmdConfig };

export interface MemoryRuntimeParams {
  agentId: string;
  workspaceDir?: string;
  purpose?: 'default' | 'status' | 'cli';
}

export interface MemorySearchManagerHandle {
  engine: MemoryQueryEngine;
  config: MemoryBackendConfig;
  agentId: string;
}

export interface MemorySearchManagerResult {
  manager: MemoryQueryEngine | null;
  error?: string;
}

/**
 * Manages the lifecycle of memory search managers (MemoryQueryEngine instances)
 * keyed by agent. Each agent gets at most one active engine backed by a
 * MemoryBackend + EngineStorage pair.
 *
 * Adapted from openclaw memory-runtime.ts getActiveMemorySearchManager /
 * resolveActiveMemoryBackendConfig / closeActiveMemorySearchManager(s) which
 * delegated to a plugin-owned runtime. Here the runtime is composed directly
 * from the SDK's own MemoryQueryEngine and EngineStorage.
 */
export class MemoryRuntimeBridge {
  private readonly managers: Map<string, MemorySearchManagerHandle> = new Map();
  private backendConfig: MemoryRuntimeBackendConfig = { backend: 'builtin' };
  private readonly storage: EngineStorage;

  constructor(storage: EngineStorage = engineStorage) {
    this.storage = storage;
  }

  /**
   * Resolves the current memory backend config without constructing a manager.
   * Mirrors resolveActiveMemoryBackendConfig.
   */
  resolveMemoryBackendConfig(_params: MemoryRuntimeParams): MemoryRuntimeBackendConfig {
    return this.backendConfig;
  }

  /**
   * Sets the active backend config. Call before requesting managers so that
   * resolveMemoryBackendConfig returns the right shape.
   */
  setBackendConfig(config: MemoryRuntimeBackendConfig): void {
    this.backendConfig = config;
  }

  /**
   * Returns the active memory search manager for an agent, creating one from
   * the supplied backend + config if none exists yet.
   *
   * Mirrors getActiveMemorySearchManager.
   */
  async getMemorySearchManager(
    params: MemoryRuntimeParams & {
      backend?: MemoryBackend;
      config?: MemoryBackendConfig;
    },
  ): Promise<MemorySearchManagerResult> {
    const existing = this.managers.get(params.agentId);
    if (existing) {
      return { manager: existing.engine };
    }

    if (!params.backend || !params.config) {
      return { manager: null, error: 'memory backend unavailable' };
    }

    const engine = new MemoryQueryEngine();
    try {
      await engine.initialize(params.backend, params.config);
      if (!this.storage.getUsage()) {
        await this.storage.initialize(params.config);
      }
      this.managers.set(params.agentId, {
        engine,
        config: params.config,
        agentId: params.agentId,
      });
      return { manager: engine };
    } catch (error) {
      return { manager: null, error: (error as Error).message };
    }
  }

  /**
   * Closes the memory search manager for a single agent.
   * Mirrors closeActiveMemorySearchManager.
   */
  async closeMemorySearchManager(params: MemoryRuntimeParams): Promise<void> {
    const handle = this.managers.get(params.agentId);
    if (!handle) {
      return;
    }
    await handle.engine.shutdown();
    this.managers.delete(params.agentId);
  }

  /**
   * Closes all active memory search managers.
   * Mirrors closeActiveMemorySearchManagers.
   */
  async closeAllMemorySearchManagers(): Promise<void> {
    const handles = Array.from(this.managers.values());
    await Promise.all(
      handles.map(async (handle) => {
        try {
          await handle.engine.shutdown();
        } catch {
          // Best-effort shutdown; continue closing remaining managers.
        }
      }),
    );
    this.managers.clear();
  }

  /**
   * Returns the active manager for an agent without creating one.
   */
  getActiveManager(agentId: string): MemoryQueryEngine | null {
    return this.managers.get(agentId)?.engine ?? null;
  }

  /**
   * Returns the number of currently active managers.
   */
  getActiveManagerCount(): number {
    return this.managers.size;
  }
}

export const memoryRuntimeBridge = new MemoryRuntimeBridge();
