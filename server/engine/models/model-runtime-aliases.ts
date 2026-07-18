/**
 * 运行时别名 — 模型的运行时别名管理
 *
 * 管理模型的别名映射，支持全局别名、
 * Provider 别名、用户自定义别名等。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId, normalizeModelId } from './model-selection-normalize.js';

export interface ModelAliasEntry {
  alias: string;
  targetModelId: string;
  targetProviderId: string;
  description?: string;
  source: 'builtin' | 'user' | 'config' | 'plugin';
  createdAt: number;
  isDeprecated?: boolean;
}

export interface ModelAliasRegistryOptions {
  includeBuiltin?: boolean;
}

const BUILTIN_ALIASES: Array<Omit<ModelAliasEntry, 'createdAt'>> = [
  {
    alias: 'claude',
    targetModelId: 'claude-3-5-sonnet',
    targetProviderId: 'anthropic',
    description: 'Claude 默认模型',
    source: 'builtin',
  },
  {
    alias: 'claude-opus',
    targetModelId: 'claude-3-opus',
    targetProviderId: 'anthropic',
    description: 'Claude Opus 旗舰模型',
    source: 'builtin',
  },
  {
    alias: 'claude-sonnet',
    targetModelId: 'claude-3-5-sonnet',
    targetProviderId: 'anthropic',
    description: 'Claude Sonnet 平衡模型',
    source: 'builtin',
  },
  {
    alias: 'gpt4',
    targetModelId: 'gpt-4o',
    targetProviderId: 'openai',
    description: 'GPT-4 系列最新模型',
    source: 'builtin',
  },
  {
    alias: 'gpt-4',
    targetModelId: 'gpt-4o',
    targetProviderId: 'openai',
    description: 'GPT-4 系列最新模型',
    source: 'builtin',
  },
  {
    alias: 'gemini',
    targetModelId: 'gemini-1.5-pro',
    targetProviderId: 'google',
    description: 'Gemini 默认模型',
    source: 'builtin',
  },
  {
    alias: 'deepseek',
    targetModelId: 'deepseek-chat',
    targetProviderId: 'deepseek',
    description: 'DeepSeek 默认模型',
    source: 'builtin',
  },
];

export class ModelAliasRegistry {
  private aliases = new Map<string, ModelAliasEntry>();
  private byProvider = new Map<string, Map<string, ModelAliasEntry>>();

  constructor(options: ModelAliasRegistryOptions = {}) {
    if (options.includeBuiltin !== false) {
      this.loadBuiltinAliases();
    }
  }

  private loadBuiltinAliases(): void {
    for (const alias of BUILTIN_ALIASES) {
      this.addAlias({
        ...alias,
        createdAt: Date.now(),
      });
    }
  }

  addAlias(entry: ModelAliasEntry): void {
    const normalizedAlias = this.normalizeAlias(entry.alias);
    this.aliases.set(normalizedAlias, entry);

    const providerKey = normalizeProviderId(entry.targetProviderId);
    if (!this.byProvider.has(providerKey)) {
      this.byProvider.set(providerKey, new Map());
    }
    this.byProvider.get(providerKey)!.set(normalizedAlias, entry);

    logger.debug(`[ModelAlias] 添加别名: ${entry.alias} → ${entry.targetProviderId}/${entry.targetModelId}`);
  }

  removeAlias(alias: string): boolean {
    const normalized = this.normalizeAlias(alias);
    const entry = this.aliases.get(normalized);
    if (!entry) return false;

    this.aliases.delete(normalized);

    const providerKey = normalizeProviderId(entry.targetProviderId);
    const providerMap = this.byProvider.get(providerKey);
    if (providerMap) {
      providerMap.delete(normalized);
      if (providerMap.size === 0) {
        this.byProvider.delete(providerKey);
      }
    }

    logger.debug(`[ModelAlias] 移除别名: ${alias}`);
    return true;
  }

  resolveAlias(alias: string): { modelId: string; providerId: string } | null {
    const normalized = this.normalizeAlias(alias);
    const entry = this.aliases.get(normalized);
    if (!entry) return null;

    if (entry.isDeprecated) {
      logger.warn(`[ModelAlias] 使用已弃用的别名: ${alias} → ${entry.targetModelId}`);
    }

    return {
      modelId: entry.targetModelId,
      providerId: entry.targetProviderId,
    };
  }

  getAliasInfo(alias: string): ModelAliasEntry | undefined {
    return this.aliases.get(this.normalizeAlias(alias));
  }

  getAllAliases(): ModelAliasEntry[] {
    return Array.from(this.aliases.values());
  }

  getAliasesByProvider(providerId: string): ModelAliasEntry[] {
    const providerMap = this.byProvider.get(normalizeProviderId(providerId));
    return providerMap ? Array.from(providerMap.values()) : [];
  }

  getAliasesBySource(source: ModelAliasEntry['source']): ModelAliasEntry[] {
    return this.getAllAliases().filter(a => a.source === source);
  }

  hasAlias(alias: string): boolean {
    return this.aliases.has(this.normalizeAlias(alias));
  }

  searchAliases(query: string): ModelAliasEntry[] {
    const queryLower = query.toLowerCase();
    return this.getAllAliases().filter(a =>
      a.alias.toLowerCase().includes(queryLower) ||
      a.targetModelId.toLowerCase().includes(queryLower) ||
      a.description?.toLowerCase().includes(queryLower),
    );
  }

  clearUserAliases(): void {
    const userAliases = this.getAliasesBySource('user');
    for (const alias of userAliases) {
      this.removeAlias(alias.alias);
    }
    logger.debug('[ModelAlias] 已清空用户别名');
  }

  clear(): void {
    this.aliases.clear();
    this.byProvider.clear();
    logger.debug('[ModelAlias] 已清空所有别名');
  }

  size(): number {
    return this.aliases.size;
  }

  private normalizeAlias(alias: string): string {
    return alias.toLowerCase().trim();
  }
}

let globalAliasRegistry: ModelAliasRegistry | null = null;

export function getModelAliasRegistry(): ModelAliasRegistry {
  if (!globalAliasRegistry) {
    globalAliasRegistry = new ModelAliasRegistry();
  }
  return globalAliasRegistry;
}

export function resolveModelAlias(alias: string): { modelId: string; providerId: string } | null {
  return getModelAliasRegistry().resolveAlias(alias);
}

export function addModelAlias(
  alias: string,
  targetModelId: string,
  targetProviderId: string,
  description?: string,
): void {
  getModelAliasRegistry().addAlias({
    alias,
    targetModelId,
    targetProviderId,
    description,
    source: 'user',
    createdAt: Date.now(),
  });
}
