/**
 * @cdf-know/memory-host-sdk STABLE API 契约声明
 *
 * 本文件定义了 @cdf-know/memory-host-sdk 包中所有 STABLE 等级公共 API 的
 * 类型契约。任何 STABLE API 的移除或签名变更均视为破坏性变更。
 *
 * 仅供契约检查脚本使用，不应被其他包直接导入。
 */

// ── 核心类型 ──

export type MemoryBackendType = string;
export type MemoryScope = string;
export type MemoryEventType = string;

export interface MemoryEntry {
  id: string;
  content: string;
  scope?: MemoryScope;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  total: number;
  scores?: number[];
}

export interface MemoryStats {
  totalEntries: number;
  totalSize: number;
  byScope?: Record<string, number>;
}

export interface MemoryQuery {
  text: string;
  scope?: MemoryScope;
  limit?: number;
  threshold?: number;
}

export interface MemoryInsertOptions {
  scope?: MemoryScope;
  metadata?: Record<string, unknown>;
}

export interface MemoryBackend {
  type: MemoryBackendType;
  search(query: MemoryQuery): Promise<MemorySearchResult>;
  insert(entry: MemoryEntry, options?: MemoryInsertOptions): Promise<void>;
  delete?(id: string): Promise<void>;
  getStats(): Promise<MemoryStats>;
}

export interface MemoryEvent {
  type: MemoryEventType;
  data: unknown;
  timestamp: number;
}

export interface StorageUsage {
  totalBytes: number;
  usedBytes: number;
  entries: number;
}

export interface MigrationPlan {
  fromVersion: string;
  toVersion: string;
  steps: unknown[];
}

// ── 事件类型 ──

export interface MemoryQueryEngineEvents {
  [key: string]: unknown;
}

export interface MemoryEventBusEvents {
  [key: string]: unknown;
}

export interface EngineStorageEvents {
  [key: string]: unknown;
}

// ── 核心类 ──

export declare class MemoryQueryEngine {
  initialize(backend: MemoryBackend): void;
  search(query: MemoryQuery): Promise<MemorySearchResult>;
  semanticSearch(query: MemoryQuery): Promise<MemorySearchResult>;
  hybridSearch(query: MemoryQuery): Promise<MemorySearchResult>;
  getQueryHistory(): unknown[];
  clearHistory(): void;
  getStats(): MemoryStats;
  getBackendType(): MemoryBackendType;
  isInitialized(): boolean;
  shutdown(): void;
}

export declare class MemoryEventBus {
  emitEvent(event: MemoryEvent): void;
  onEvent(type: MemoryEventType, handler: (event: MemoryEvent) => void): void;
  getHistory(): MemoryEvent[];
  getHistoryByType(type: MemoryEventType): MemoryEvent[];
  clearHistory(): void;
  getEventCount(): number;
  getLastEvent(): MemoryEvent | undefined;
}

export declare class EngineStorage {
  initialize(): void;
  getUsage(): StorageUsage;
  updateUsage(): void;
  getVersion(): string;
  registerMigration(plan: MigrationPlan): void;
  migrateTo(version: string): void;
  planMigration(fromVersion: string, toVersion: string): MigrationPlan;
  getBackendType(): MemoryBackendType;
  getConfig(): Record<string, unknown>;
  backup(): unknown;
  restore(data: unknown): void;
  healthCheck(): boolean;
  getStats(): unknown;
}

// ── 单例 ──

export declare const memoryQueryEngine: MemoryQueryEngine;
export declare const memoryEventBus: MemoryEventBus;
export declare const engineStorage: EngineStorage;
