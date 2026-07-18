import { logger } from '../../logger.js';

export type MemoryLayerType = 'working' | 'short-term' | 'long-term';

export interface MemoryItem {
  id: string;
  content: string;
  layer: MemoryLayerType;
  source: string;
  importance: number;
  accessCount: number;
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  sessionId?: string;
}

export interface MemoryLayerConfig {
  workingMemory: {
    maxItems: number;
    maxAgeMs: number;
  };
  shortTermMemory: {
    maxItems: number;
    maxAgeMs: number;
    promotionThreshold: number;
  };
  longTermMemory: {
    maxItems: number;
    promotionThreshold: number;
    demotionThreshold: number;
  };
  autoPromote: boolean;
  autoDemote: boolean;
  importanceDecayRate: number;
}

export interface MemoryStats {
  workingMemory: {
    itemCount: number;
    totalSizeBytes: number;
  };
  shortTermMemory: {
    itemCount: number;
    totalSizeBytes: number;
  };
  longTermMemory: {
    itemCount: number;
    totalSizeBytes: number;
  };
  totalItems: number;
  totalSizeBytes: number;
  lastPromotionAt?: number;
  lastDemotionAt?: number;
}

export interface MemorySearchOptions {
  query: string;
  topK?: number;
  layers?: MemoryLayerType[];
  minImportance?: number;
  maxAgeMs?: number;
  tags?: string[];
  sessionId?: string;
}

const DEFAULT_CONFIG: Required<MemoryLayerConfig> = {
  workingMemory: {
    maxItems: 50,
    maxAgeMs: 30 * 60 * 1000,
  },
  shortTermMemory: {
    maxItems: 500,
    maxAgeMs: 24 * 60 * 60 * 1000,
    promotionThreshold: 5,
  },
  longTermMemory: {
    maxItems: 10000,
    promotionThreshold: 10,
    demotionThreshold: 0.2,
  },
  autoPromote: true,
  autoDemote: true,
  importanceDecayRate: 0.01,
};

export class MemoryLayers {
  private config: Required<MemoryLayerConfig>;
  private workingMemory: Map<string, MemoryItem> = new Map();
  private shortTermMemory: Map<string, MemoryItem> = new Map();
  private longTermMemory: Map<string, MemoryItem> = new Map();
  private lastPromotionAt?: number;
  private lastDemotionAt?: number;

  constructor(config: Partial<MemoryLayerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      workingMemory: { ...DEFAULT_CONFIG.workingMemory, ...config.workingMemory },
      shortTermMemory: { ...DEFAULT_CONFIG.shortTermMemory, ...config.shortTermMemory },
      longTermMemory: { ...DEFAULT_CONFIG.longTermMemory, ...config.longTermMemory },
    };
    logger.debug('[MemoryLayers] 记忆层初始化完成');
  }

  addItem(
    content: string,
    options: {
      id?: string;
      layer?: MemoryLayerType;
      source?: string;
      importance?: number;
      metadata?: Record<string, unknown>;
      tags?: string[];
      sessionId?: string;
    } = {}
  ): MemoryItem {
    const {
      id = this.generateId(),
      layer = 'short-term',
      source = 'unknown',
      importance = 0.5,
      metadata,
      tags,
      sessionId,
    } = options;

    const now = Date.now();
    const item: MemoryItem = {
      id,
      content,
      layer,
      source,
      importance,
      accessCount: 0,
      createdAt: now,
      lastAccessedAt: now,
      metadata,
      tags,
      sessionId,
    };

    this.getLayerMap(layer).set(id, item);
    this.checkCapacity(layer);

    logger.debug(`[MemoryLayers] 添加记忆项: ${id} -> ${layer}`);
    return item;
  }

  getItem(id: string): MemoryItem | null {
    for (const layer of ['working', 'short-term', 'long-term'] as MemoryLayerType[]) {
      const map = this.getLayerMap(layer);
      const item = map.get(id);
      if (item) {
        this.recordAccess(item);
        return { ...item };
      }
    }
    return null;
  }

  updateItem(
    id: string,
    updates: Partial<{
      content: string;
      importance: number;
      metadata: Record<string, unknown>;
      tags: string[];
    }>
  ): MemoryItem | null {
    const item = this.getItem(id);
    if (!item) return null;

    const map = this.getLayerMap(item.layer);
    const storedItem = map.get(id);
    if (!storedItem) return null;

    if (updates.content !== undefined) storedItem.content = updates.content;
    if (updates.importance !== undefined) storedItem.importance = updates.importance;
    if (updates.metadata !== undefined) storedItem.metadata = updates.metadata;
    if (updates.tags !== undefined) storedItem.tags = updates.tags;

    storedItem.lastAccessedAt = Date.now();

    return { ...storedItem };
  }

  removeItem(id: string): boolean {
    for (const layer of ['working', 'short-term', 'long-term'] as MemoryLayerType[]) {
      const map = this.getLayerMap(layer);
      if (map.has(id)) {
        map.delete(id);
        logger.debug(`[MemoryLayers] 移除记忆项: ${id}`);
        return true;
      }
    }
    return false;
  }

  search(options: MemorySearchOptions): MemoryItem[] {
    const {
      query,
      topK = 10,
      layers = ['working', 'short-term', 'long-term'],
      minImportance = 0,
      maxAgeMs,
      tags,
      sessionId,
    } = options;

    const results: MemoryItem[] = [];
    const queryLower = query.toLowerCase();
    const queryKeywords = new Set(queryLower.split(/\s+/).filter(w => w.length > 1));
    const now = Date.now();

    for (const layer of layers) {
      const map = this.getLayerMap(layer);
      for (const item of map.values()) {
        if (item.importance < minImportance) continue;
        if (maxAgeMs && now - item.createdAt > maxAgeMs) continue;
        if (sessionId && item.sessionId !== sessionId) continue;
        if (tags && tags.length > 0) {
          const itemTags = new Set(item.tags || []);
          const hasMatchingTag = tags.some(t => itemTags.has(t));
          if (!hasMatchingTag) continue;
        }

        const contentLower = item.content.toLowerCase();
        let score = 0;

        if (contentLower.includes(queryLower)) {
          score += 0.5;
        }

        let matchedKeywords = 0;
        for (const keyword of queryKeywords) {
          if (contentLower.includes(keyword)) {
            matchedKeywords++;
          }
        }
        if (queryKeywords.size > 0) {
          score += (matchedKeywords / queryKeywords.size) * 0.3;
        }

        score += item.importance * 0.2;

        if (score > 0.1) {
          this.recordAccess(item);
          results.push({ ...item });
        }
      }
    }

    return results
      .sort((a, b) => {
        const aScore = this.calculateRelevanceScore(a, queryLower, queryKeywords);
        const bScore = this.calculateRelevanceScore(b, queryLower, queryKeywords);
        return bScore - aScore;
      })
      .slice(0, topK);
  }

  promoteItem(id: string): MemoryItem | null {
    const item = this.getItem(id);
    if (!item) return null;

    const currentLayer = item.layer;
    let targetLayer: MemoryLayerType | null = null;

    if (currentLayer === 'long-term') {
      targetLayer = 'short-term';
    } else if (currentLayer === 'short-term') {
      targetLayer = 'working';
    }

    if (!targetLayer) return item;

    this.moveToLayer(item.id, targetLayer);
    logger.debug(`[MemoryLayers] 记忆项提升: ${id} ${currentLayer} -> ${targetLayer}`);
    return this.getItem(id);
  }

  demoteItem(id: string): MemoryItem | null {
    const item = this.getItem(id);
    if (!item) return null;

    const currentLayer = item.layer;
    let targetLayer: MemoryLayerType | null = null;

    if (currentLayer === 'working') {
      targetLayer = 'short-term';
    } else if (currentLayer === 'short-term') {
      targetLayer = 'long-term';
    }

    if (!targetLayer) return item;

    this.moveToLayer(item.id, targetLayer);
    logger.debug(`[MemoryLayers] 记忆项降级: ${id} ${currentLayer} -> ${targetLayer}`);
    return this.getItem(id);
  }

  clearLayer(layer: MemoryLayerType): number {
    const map = this.getLayerMap(layer);
    const count = map.size;
    map.clear();
    logger.debug(`[MemoryLayers] 清空记忆层: ${layer}, 移除 ${count} 项`);
    return count;
  }

  clearAll(): void {
    this.workingMemory.clear();
    this.shortTermMemory.clear();
    this.longTermMemory.clear();
    this.lastPromotionAt = undefined;
    this.lastDemotionAt = undefined;
    logger.debug('[MemoryLayers] 清空所有记忆');
  }

  getStats(): MemoryStats {
    const calcStats = (map: Map<string, MemoryItem>) => ({
      itemCount: map.size,
      totalSizeBytes: Array.from(map.values()).reduce(
        (sum, item) => sum + Buffer.byteLength(item.content, 'utf-8'),
        0
      ),
    });

    const working = calcStats(this.workingMemory);
    const shortTerm = calcStats(this.shortTermMemory);
    const longTerm = calcStats(this.longTermMemory);

    return {
      workingMemory: working,
      shortTermMemory: shortTerm,
      longTermMemory: longTerm,
      totalItems: working.itemCount + shortTerm.itemCount + longTerm.itemCount,
      totalSizeBytes: working.totalSizeBytes + shortTerm.totalSizeBytes + longTerm.totalSizeBytes,
      lastPromotionAt: this.lastPromotionAt,
      lastDemotionAt: this.lastDemotionAt,
    };
  }

  runMaintenance(): void {
    const now = Date.now();

    if (this.config.autoPromote) {
      this.autoPromoteItems();
    }

    if (this.config.autoDemote) {
      this.autoDemoteItems();
    }

    this.cleanupExpiredItems();

    logger.debug('[MemoryLayers] 记忆层维护完成');
  }

  getAllItems(layer?: MemoryLayerType): MemoryItem[] {
    if (layer) {
      return Array.from(this.getLayerMap(layer).values()).map(i => ({ ...i }));
    }
    return [
      ...Array.from(this.workingMemory.values()),
      ...Array.from(this.shortTermMemory.values()),
      ...Array.from(this.longTermMemory.values()),
    ].map(i => ({ ...i }));
  }

  private recordAccess(item: MemoryItem): void {
    item.accessCount++;
    item.lastAccessedAt = Date.now();

    if (this.config.autoPromote) {
      const promotionThreshold =
        item.layer === 'short-term'
          ? this.config.shortTermMemory.promotionThreshold
          : this.config.longTermMemory.promotionThreshold;

      if (item.accessCount >= promotionThreshold && item.layer !== 'working') {
        this.promoteItem(item.id);
      }
    }
  }

  private moveToLayer(id: string, targetLayer: MemoryLayerType): void {
    let item: MemoryItem | null = null;
    let sourceLayer: MemoryLayerType | null = null;

    for (const layer of ['working', 'short-term', 'long-term'] as MemoryLayerType[]) {
      const map = this.getLayerMap(layer);
      if (map.has(id)) {
        item = map.get(id)!;
        sourceLayer = layer;
        map.delete(id);
        break;
      }
    }

    if (item && sourceLayer !== targetLayer) {
      item.layer = targetLayer;
      this.getLayerMap(targetLayer).set(id, item);
      this.checkCapacity(targetLayer);
    }
  }

  private autoPromoteItems(): void {
    this.lastPromotionAt = Date.now();

    for (const item of this.shortTermMemory.values()) {
      if (item.accessCount >= this.config.shortTermMemory.promotionThreshold) {
        this.moveToLayer(item.id, 'working');
      }
    }

    for (const item of this.longTermMemory.values()) {
      if (item.accessCount >= this.config.longTermMemory.promotionThreshold) {
        this.moveToLayer(item.id, 'short-term');
      }
    }
  }

  private autoDemoteItems(): void {
    this.lastDemotionAt = Date.now();
    const now = Date.now();

    for (const item of Array.from(this.workingMemory.values())) {
      const ageMs = now - item.lastAccessedAt;
      if (ageMs > this.config.workingMemory.maxAgeMs) {
        this.moveToLayer(item.id, 'short-term');
      }
    }

    for (const item of Array.from(this.shortTermMemory.values())) {
      const ageMs = now - item.lastAccessedAt;
      if (ageMs > this.config.shortTermMemory.maxAgeMs) {
        this.moveToLayer(item.id, 'long-term');
      }
    }

    for (const item of Array.from(this.longTermMemory.values())) {
      const decayedImportance = item.importance * Math.pow(
        1 - this.config.importanceDecayRate,
        (now - item.lastAccessedAt) / (24 * 60 * 60 * 1000)
      );
      if (decayedImportance < this.config.longTermMemory.demotionThreshold) {
        this.longTermMemory.delete(item.id);
      }
    }
  }

  private cleanupExpiredItems(): void {
    const now = Date.now();

    for (const item of Array.from(this.workingMemory.values())) {
      if (now - item.lastAccessedAt > this.config.workingMemory.maxAgeMs) {
        this.moveToLayer(item.id, 'short-term');
      }
    }
  }

  private checkCapacity(layer: MemoryLayerType): void {
    const map = this.getLayerMap(layer);
    const maxItems = this.getLayerMaxItems(layer);

    if (map.size <= maxItems) return;

    const sorted = Array.from(map.values()).sort((a, b) => {
      const aScore = a.importance + a.accessCount * 0.1;
      const bScore = b.importance + b.accessCount * 0.1;
      return aScore - bScore;
    });

    const itemsToRemove = map.size - maxItems;
    for (let i = 0; i < itemsToRemove; i++) {
      const item = sorted[i];
      if (layer === 'working') {
        this.moveToLayer(item.id, 'short-term');
      } else if (layer === 'short-term') {
        this.moveToLayer(item.id, 'long-term');
      } else {
        map.delete(item.id);
      }
    }

    logger.debug(`[MemoryLayers] ${layer} 层容量超限，移除/降级 ${itemsToRemove} 项`);
  }

  private getLayerMap(layer: MemoryLayerType): Map<string, MemoryItem> {
    switch (layer) {
      case 'working':
        return this.workingMemory;
      case 'short-term':
        return this.shortTermMemory;
      case 'long-term':
        return this.longTermMemory;
      default:
        return this.shortTermMemory;
    }
  }

  private getLayerMaxItems(layer: MemoryLayerType): number {
    switch (layer) {
      case 'working':
        return this.config.workingMemory.maxItems;
      case 'short-term':
        return this.config.shortTermMemory.maxItems;
      case 'long-term':
        return this.config.longTermMemory.maxItems;
      default:
        return this.config.shortTermMemory.maxItems;
    }
  }

  private calculateRelevanceScore(
    item: MemoryItem,
    queryLower: string,
    queryKeywords: Set<string>
  ): number {
    const contentLower = item.content.toLowerCase();
    let score = 0;

    if (contentLower.includes(queryLower)) {
      score += 0.5;
    }

    let matchedKeywords = 0;
    for (const keyword of queryKeywords) {
      if (contentLower.includes(keyword)) {
        matchedKeywords++;
      }
    }
    if (queryKeywords.size > 0) {
      score += (matchedKeywords / queryKeywords.size) * 0.3;
    }

    score += item.importance * 0.2;

    return score;
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
