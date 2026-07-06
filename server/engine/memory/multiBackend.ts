import { logger } from '../../logger.js';

export type MemoryBackendType = 'sqlite-vec' | 'lancedb' | 'pinecone' | 'chroma' | 'milvus';

export interface MemoryBackend {
  type: MemoryBackendType;
  name: string;
  version: string;
  capabilities: MemoryBackendCapabilities;
  isAvailable: () => boolean;
  init: () => Promise<void>;
  insertMemory: (text: string, metadata: Record<string, unknown>) => Promise<number>;
  searchMemory: (query: string, topK: number, filters: Record<string, unknown>) => Promise<MemorySearchResult[]>;
  getMemory: (id: number) => Promise<MemoryEntry | null>;
  deleteMemory: (id: number) => Promise<boolean>;
  clearAll: () => Promise<void>;
  getStats: () => Promise<MemoryStats>;
}

export interface MemoryBackendCapabilities {
  vectorSearch: boolean;
  fullTextSearch: boolean;
  hybridSearch: boolean;
  mmr: boolean;
  timeDecay: boolean;
  classification: boolean;
  multimodal: boolean;
  chunking: boolean;
  batchOperations: boolean;
  transactions: boolean;
  persistence: boolean;
}

export interface MemorySearchResult {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  similarity: number;
  category?: string;
  createdAt?: string;
  timeWeight?: number;
  mmrProcessed?: boolean;
}

export interface MemoryEntry {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryStats {
  totalMemories: number;
  avgTextLength: number;
  backendType: MemoryBackendType;
}

export interface MultiBackendConfig {
  defaultBackend: MemoryBackendType;
  backends: MemoryBackendType[];
  fallbackEnabled: boolean;
  healthCheckIntervalMs: number;
}

const DEFAULT_CONFIG: MultiBackendConfig = {
  defaultBackend: 'sqlite-vec',
  backends: ['sqlite-vec'],
  fallbackEnabled: true,
  healthCheckIntervalMs: 60000,
};

const backendRegistry = new Map<MemoryBackendType, MemoryBackend>();
const backendHealth = new Map<MemoryBackendType, boolean>();

let currentConfig = DEFAULT_CONFIG;

export function registerMemoryBackend(backend: MemoryBackend): void {
  if (backendRegistry.has(backend.type)) {
    logger.warn(`[MultiBackend] 后端 ${backend.type} 已注册，将被替换`);
  }
  backendRegistry.set(backend.type, backend);
  backendHealth.set(backend.type, backend.isAvailable());
  logger.info(`[MultiBackend] 后端已注册: ${backend.type} (${backend.name})`);
}

export function unregisterMemoryBackend(type: MemoryBackendType): void {
  backendRegistry.delete(type);
  backendHealth.delete(type);
  logger.info(`[MultiBackend] 后端已注销: ${type}`);
}

export function getRegisteredBackends(): MemoryBackendType[] {
  return Array.from(backendRegistry.keys());
}

export function getBackend(type: MemoryBackendType): MemoryBackend | undefined {
  return backendRegistry.get(type);
}

export function getDefaultBackend(): MemoryBackend | undefined {
  return backendRegistry.get(currentConfig.defaultBackend);
}

export function setDefaultBackend(type: MemoryBackendType): void {
  if (!backendRegistry.has(type)) {
    throw new Error(`后端 ${type} 未注册`);
  }
  currentConfig.defaultBackend = type;
  logger.info(`[MultiBackend] 默认后端已设置为: ${type}`);
}

export function getBackendHealth(type: MemoryBackendType): boolean {
  return backendHealth.get(type) ?? false;
}

export async function performHealthCheck(type: MemoryBackendType): Promise<boolean> {
  const backend = backendRegistry.get(type);
  if (!backend) {
    return false;
  }
  try {
    const available = backend.isAvailable();
    backendHealth.set(type, available);
    if (!available) {
      logger.warn(`[MultiBackend] 后端健康检查失败: ${type}`);
    }
    return available;
  } catch {
    backendHealth.set(type, false);
    return false;
  }
}

export async function performAllHealthChecks(): Promise<Map<MemoryBackendType, boolean>> {
  const results = new Map<MemoryBackendType, boolean>();
  for (const type of backendRegistry.keys()) {
    const healthy = await performHealthCheck(type);
    results.set(type, healthy);
  }
  return results;
}

export function resolveAvailableBackend(): MemoryBackend | undefined {
  if (currentConfig.fallbackEnabled) {
    for (const type of currentConfig.backends) {
      if (getBackendHealth(type)) {
        const backend = backendRegistry.get(type);
        if (backend) {
          return backend;
        }
      }
    }
    logger.warn('[MultiBackend] 所有后端均不可用，尝试直接使用默认后端');
  }
  return getDefaultBackend();
}

export function hasCapability(type: MemoryBackendType, capability: keyof MemoryBackendCapabilities): boolean {
  const backend = backendRegistry.get(type);
  return backend?.capabilities[capability] ?? false;
}

export function getCapabilities(type: MemoryBackendType): MemoryBackendCapabilities | undefined {
  return backendRegistry.get(type)?.capabilities;
}

export function configureMultiBackend(config: Partial<MultiBackendConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  logger.info(`[MultiBackend] 配置已更新: default=${currentConfig.defaultBackend}`);
}

export function getMultiBackendConfig(): MultiBackendConfig {
  return { ...currentConfig };
}

export async function initAllBackends(): Promise<void> {
  for (const backend of backendRegistry.values()) {
    try {
      await backend.init();
      backendHealth.set(backend.type, true);
    } catch (err) {
      backendHealth.set(backend.type, false);
      logger.error(`[MultiBackend] 初始化后端失败: ${backend.type}`, err);
    }
  }
}

export function clearBackendRegistry(): void {
  backendRegistry.clear();
  backendHealth.clear();
}

export function getBackendStatus(): Record<MemoryBackendType, {
  name: string;
  available: boolean;
  capabilities: MemoryBackendCapabilities;
}> {
  const status: Record<MemoryBackendType, {
    name: string;
    available: boolean;
    capabilities: MemoryBackendCapabilities;
  }> = {} as Record<MemoryBackendType, {
    name: string;
    available: boolean;
    capabilities: MemoryBackendCapabilities;
  }>;
  for (const [type, backend] of backendRegistry.entries()) {
    status[type] = {
      name: backend.name,
      available: getBackendHealth(type),
      capabilities: backend.capabilities,
    };
  }
  return status;
}