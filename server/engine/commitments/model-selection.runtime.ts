/**
 * 承诺模型选择
 *
 * 运行时模型选择逻辑，根据承诺类型、敏感度、
 * 可用模型等因素选择最合适的提取模型。
 */

import { logger } from '../../logger.js';
import type { CommitmentKind, CommitmentSensitivity } from './types.js';

export type CommitmentModelConfig = {
  defaultModel: string;
  fastModel?: string;
  careModel?: string;
  highPriorityModel?: string;
  perKindModels?: Partial<Record<CommitmentKind, string>>;
  perSensitivityModels?: Partial<Record<CommitmentSensitivity, string>>;
  fallbackModels?: string[];
};

export type ModelSelectionContext = {
  kind?: CommitmentKind;
  sensitivity?: CommitmentSensitivity;
  batchSize?: number;
  hasComplexContext?: boolean;
  preferredModels?: string[];
  availableModels?: string[];
};

export type ModelSelectionResult = {
  model: string;
  reason: string;
  confidence: number;
  fallbackIndex?: number;
};

export type ModelSelectionStats = {
  totalSelections: number;
  perModelCount: Record<string, number>;
  fallbackCount: number;
  averageConfidence: number;
  cacheHits: number;
  cacheMisses: number;
  lastSelectionAt?: number;
};

export type CachedSelection = {
  result: ModelSelectionResult;
  cachedAt: number;
  ttlMs: number;
};

const DEFAULT_MODEL_CONFIG: CommitmentModelConfig = {
  defaultModel: 'default',
  careModel: 'default',
  highPriorityModel: 'default',
  fallbackModels: ['default'],
};

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_CACHE_MAX_SIZE = 100;

export class CommitmentModelSelector {
  private config: CommitmentModelConfig;
  private modelAvailability: Map<string, boolean> = new Map();
  private stats: ModelSelectionStats = {
    totalSelections: 0,
    perModelCount: {},
    fallbackCount: 0,
    averageConfidence: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  private cache: Map<string, CachedSelection> = new Map();
  private cacheEnabled = true;
  private cacheTtlMs = DEFAULT_CACHE_TTL_MS;
  private cacheMaxSize = DEFAULT_CACHE_MAX_SIZE;

  constructor(config: Partial<CommitmentModelConfig> = {}) {
    this.config = { ...DEFAULT_MODEL_CONFIG, ...config };
  }

  setConfig(config: Partial<CommitmentModelConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug(`[Commitments ModelSelection] Config updated`);
    this.invalidateCache();
  }

  getConfig(): CommitmentModelConfig {
    return { ...this.config };
  }

  setModelAvailable(model: string, available: boolean): void {
    this.modelAvailability.set(model, available);
    if (!available) {
      this.invalidateCacheForModel(model);
    }
  }

  isModelAvailable(model: string): boolean {
    if (this.modelAvailability.size === 0) {
      return true;
    }
    const available = this.modelAvailability.get(model);
    if (available === false) {
      return false;
    }
    return true;
  }

  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
    if (!enabled) {
      this.cache.clear();
    }
  }

  setCacheTtl(ttlMs: number): void {
    this.cacheTtlMs = ttlMs;
  }

  setCacheMaxSize(maxSize: number): void {
    this.cacheMaxSize = maxSize;
    this.trimCache();
  }

  private generateCacheKey(context: ModelSelectionContext): string {
    const parts: string[] = [];
    if (context.kind) parts.push(`k:${context.kind}`);
    if (context.sensitivity) parts.push(`s:${context.sensitivity}`);
    if (context.batchSize) parts.push(`b:${context.batchSize}`);
    if (context.hasComplexContext) parts.push(`c:1`);
    if (context.preferredModels?.length) parts.push(`p:${context.preferredModels.join(',')}`);
    if (context.availableModels?.length) parts.push(`a:${context.availableModels.join(',')}`);
    return parts.join('|');
  }

  private getCached(key: string): ModelSelectionResult | null {
    if (!this.cacheEnabled) return null;
    const cached = this.cache.get(key);
    if (!cached) return null;
    const now = Date.now();
    if (now - cached.cachedAt > cached.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    this.stats.cacheHits++;
    return cached.result;
  }

  private setCached(key: string, result: ModelSelectionResult): void {
    if (!this.cacheEnabled) return;
    this.trimCache();
    this.cache.set(key, {
      result,
      cachedAt: Date.now(),
      ttlMs: this.cacheTtlMs,
    });
  }

  private trimCache(): void {
    if (this.cache.size <= this.cacheMaxSize) return;
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, entries.length - this.cacheMaxSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  invalidateCache(): void {
    this.cache.clear();
    logger.debug(`[Commitments ModelSelection] Cache invalidated`);
  }

  invalidateCacheForModel(model: string): void {
    const keysToDelete: string[] = [];
    for (const [key, cached] of this.cache) {
      if (cached.result.model === model) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    logger.debug(`[Commitments ModelSelection] Cache invalidated for model: ${model}`);
  }

  selectModel(context: ModelSelectionContext = {}): ModelSelectionResult {
    const cacheKey = this.generateCacheKey(context);
    const cached = this.getCached(cacheKey);
    if (cached) {
      this.stats.totalSelections++;
      this.stats.perModelCount[cached.model] = (this.stats.perModelCount[cached.model] ?? 0) + 1;
      this.stats.lastSelectionAt = Date.now();
      return cached;
    }

    this.stats.cacheMisses++;
    const result = this.doSelectModel(context);
    this.updateStats(result);
    this.setCached(cacheKey, result);
    return result;
  }

  private doSelectModel(context: ModelSelectionContext): ModelSelectionResult {
    const { kind, sensitivity, batchSize = 1, hasComplexContext = false, preferredModels, availableModels } = context;

    const candidateModels: Array<{ model: string; priority: number; reason: string; isFallback?: boolean }> = [];

    if (preferredModels && preferredModels.length > 0) {
      for (let i = 0; i < preferredModels.length; i++) {
        candidateModels.push({
          model: preferredModels[i]!,
          priority: 1 + i * 0.1,
          reason: 'preferred model',
        });
      }
    }

    if (kind && this.config.perKindModels?.[kind]) {
      candidateModels.push({
        model: this.config.perKindModels[kind]!,
        priority: 2,
        reason: `per-kind model for ${kind}`,
      });
    }

    if (sensitivity && this.config.perSensitivityModels?.[sensitivity]) {
      candidateModels.push({
        model: this.config.perSensitivityModels[sensitivity]!,
        priority: 3,
        reason: `per-sensitivity model for ${sensitivity}`,
      });
    }

    if (sensitivity === 'care' && this.config.careModel) {
      candidateModels.push({
        model: this.config.careModel,
        priority: 4,
        reason: 'care model',
      });
    }

    if (hasComplexContext && this.config.highPriorityModel) {
      candidateModels.push({
        model: this.config.highPriorityModel,
        priority: 5,
        reason: 'complex context',
      });
    }

    if (batchSize <= 1 && !hasComplexContext && this.config.fastModel) {
      candidateModels.push({
        model: this.config.fastModel,
        priority: 6,
        reason: 'fast model for simple/single extraction',
      });
    }

    candidateModels.push({
      model: this.config.defaultModel,
      priority: 100,
      reason: 'default model',
    });

    let fallbackIndex = 0;
    if (this.config.fallbackModels) {
      for (let i = 0; i < this.config.fallbackModels.length; i++) {
        candidateModels.push({
          model: this.config.fallbackModels[i]!,
          priority: 200 + i,
          reason: `fallback model ${i + 1}`,
          isFallback: true,
        });
      }
    }

    candidateModels.sort((a, b) => a.priority - b.priority);

    const modelPool = availableModels?.length ? availableModels : null;

    for (const candidate of candidateModels) {
      if (this.isModelAvailable(candidate.model)) {
        if (modelPool && !modelPool.includes(candidate.model)) {
          continue;
        }
        return {
          model: candidate.model,
          reason: candidate.reason,
          confidence: this.calculateConfidence(candidate.priority),
          fallbackIndex: candidate.isFallback ? fallbackIndex : undefined,
        };
      }
      if (candidate.isFallback) {
        fallbackIndex++;
      }
    }

    this.stats.fallbackCount++;
    return {
      model: this.config.defaultModel,
      reason: 'all candidates unavailable, using default',
      confidence: 0.3,
    };
  }

  private calculateConfidence(priority: number): number {
    if (priority <= 2) return 0.95;
    if (priority <= 5) return 0.85;
    if (priority <= 10) return 0.75;
    if (priority <= 100) return 0.6;
    return 0.4;
  }

  private updateStats(result: ModelSelectionResult): void {
    this.stats.totalSelections++;
    this.stats.perModelCount[result.model] = (this.stats.perModelCount[result.model] ?? 0) + 1;
    const totalConf = this.stats.averageConfidence * (this.stats.totalSelections - 1) + result.confidence;
    this.stats.averageConfidence = totalConf / this.stats.totalSelections;
    this.stats.lastSelectionAt = Date.now();
  }

  selectBatchModel(
    items: Array<{ kind?: CommitmentKind; sensitivity?: CommitmentSensitivity }>,
  ): ModelSelectionResult {
    const kinds = new Set<CommitmentKind>();
    const sensitivities = new Set<CommitmentSensitivity>();
    let hasCare = false;
    let hasComplex = false;

    for (const item of items) {
      if (item.kind) kinds.add(item.kind);
      if (item.sensitivity) {
        sensitivities.add(item.sensitivity);
        if (item.sensitivity === 'care') hasCare = true;
      }
    }

    if (kinds.size > 2 || sensitivities.size > 1) {
      hasComplex = true;
    }

    const primaryKind = Array.from(kinds)[0];
    const primarySensitivity = hasCare ? 'care' : Array.from(sensitivities)[0];

    return this.selectModel({
      kind: primaryKind,
      sensitivity: primarySensitivity,
      batchSize: items.length,
      hasComplexContext: hasComplex,
    });
  }

  getStats(): ModelSelectionStats {
    return {
      ...this.stats,
      perModelCount: { ...this.stats.perModelCount },
    };
  }

  resetStats(): void {
    this.stats = {
      totalSelections: 0,
      perModelCount: {},
      fallbackCount: 0,
      averageConfidence: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  reset(): void {
    this.config = { ...DEFAULT_MODEL_CONFIG };
    this.modelAvailability.clear();
    this.resetStats();
    this.cache.clear();
  }
}

export const commitmentModelSelector = new CommitmentModelSelector();

export function selectCommitmentModel(context?: ModelSelectionContext): ModelSelectionResult {
  return commitmentModelSelector.selectModel(context);
}

export function configureCommitmentModelSelection(config: Partial<CommitmentModelConfig>): void {
  commitmentModelSelector.setConfig(config);
}
