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

// ── Runtime Bridge (semantic redo of openclaw memory-runtime) ──

export type MemoryRuntimeBackendConfig = unknown;
export type MemoryRuntimeQmdConfig = unknown;
export type MemoryRuntimeParams = unknown;

export declare class MemoryRuntimeBridge {
  resolveMemoryBackendConfig(params: unknown): unknown;
  setBackendConfig(config: unknown): void;
  getMemorySearchManager(params: unknown): Promise<unknown>;
  closeMemorySearchManager(params: unknown): Promise<void>;
  closeAllMemorySearchManagers(): Promise<void>;
  getActiveManager(agentId: string): unknown;
  getActiveManagerCount(): number;
}

export declare const memoryRuntimeBridge: MemoryRuntimeBridge;

// ── State Registry (semantic redo of openclaw memory-state) ──

export type MemoryCitationsMode = string;
export type MemoryPromptSectionBuilder = unknown;
export type MemoryCorpusSearchResult = unknown;
export type MemoryCorpusGetResult = unknown;
export type MemoryCorpusSupplement = unknown;
export type MemoryFlushPlan = unknown;
export type MemoryFlushPlanResolver = unknown;
export type MemoryPluginRuntime = unknown;
export type MemoryPluginCapability = unknown;

export declare class MemoryStateRegistry {
  registerMemoryCapability(pluginId: string, capability: unknown): void;
  registerMemoryCorpusSupplement(pluginId: string, supplement: unknown): void;
  registerMemoryPromptSupplement(pluginId: string, builder: unknown): void;
  buildMemoryPromptSection(params: unknown): string[];
  resolveMemoryFlushPlan(params: unknown): unknown;
  getMemoryRuntime(): unknown;
  listMemoryCorpusSupplements(): unknown[];
  listMemoryPromptSupplements(): unknown[];
  getMemoryCapabilityRegistration(): unknown;
  clearState(): void;
}

export declare const memoryStateRegistry: MemoryStateRegistry;

// ── Vector Backend (semantic redo of openclaw memory-lancedb) ──

export type MemoryCategory = string;
export type MemoryCaptureOptions = unknown;
export type MemoryCaptureResult = unknown;
export type MemoryRecallOptions = unknown;
export type MemoryMessage = unknown;
export type AutoCaptureCursor = unknown;
export type VectorStore = unknown;
export type VectorStoreRow = unknown;
export type EmbeddingProvider = unknown;
export type VectorMemoryBackendConfig = unknown;

export declare class VectorMemoryBackend {
  readonly type: MemoryBackendType;
  readonly name: string;
  readonly version: string;
  readonly capabilities: unknown;
  isAvailable(): boolean;
  init(config: unknown): Promise<void>;
  shutdown(): Promise<void>;
  insertMemory(text: string, metadata?: unknown): Promise<number>;
  insertBatch?(entries: unknown[]): Promise<number[]>;
  searchMemory(query: unknown): Promise<unknown>;
  getMemory(id: number): Promise<unknown>;
  updateMemory?(id: number, updates: unknown): Promise<boolean>;
  deleteMemory(id: number): Promise<boolean>;
  deleteByFilter?(filter: unknown): Promise<number>;
  clearAll(): Promise<void>;
  getStats(): Promise<unknown>;
  healthCheck(): Promise<boolean>;
  autoRecall(options: unknown): Promise<unknown>;
  autoCapture(options: unknown): Promise<unknown>;
}

export declare function createVectorMemoryBackend(config: unknown): VectorMemoryBackend;
export declare function sanitizeForMemoryCapture(text: string): string;
export declare function shouldCapture(text: string, options?: unknown): boolean;
export declare function detectCategory(text: string): unknown;
export declare function looksLikePromptInjection(text: string): boolean;
export declare function looksLikeEnvelopeSludge(text: string): boolean;
export declare function escapeMemoryForPrompt(text: string): string;
export declare function normalizeRecallQuery(text: string, maxChars?: number): string;
export declare function formatRelevantMemoriesContext(memories: unknown[]): string;
export declare function extractLatestUserText(messages: unknown[]): string | undefined;
