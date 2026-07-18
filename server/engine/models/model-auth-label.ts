/**
 * 认证标签管理 — 管理多 API Key 的标签和轮询策略
 *
 * 支持为同一个提供商的多个 API Key 添加标签，
 * 便于识别和选择使用哪个 Key。
 */

import { logger } from '../../logger.js';

export interface ApiKeyLabel {
  id: string;
  label: string;
  providerId: string;
  keyIndex: number;
  enabled: boolean;
  createdAt: number;
  lastUsedAt?: number;
  usageCount: number;
  metadata?: Record<string, unknown>;
}

export interface KeyLabelManagerOptions {
  maxKeysPerProvider?: number;
}

type KeyRotationStrategy = 'round-robin' | 'random' | 'failover';

export class ApiKeyLabelManager {
  private labels = new Map<string, ApiKeyLabel>();
  private byProvider = new Map<string, ApiKeyLabel[]>();
  private roundRobinIndex = new Map<string, number>();
  private maxKeysPerProvider: number;

  constructor(options: KeyLabelManagerOptions = {}) {
    this.maxKeysPerProvider = options.maxKeysPerProvider ?? 10;
  }

  addLabel(label: Omit<ApiKeyLabel, 'id' | 'createdAt' | 'usageCount'> & { id?: string }): ApiKeyLabel {
    const providerLabels = this.byProvider.get(label.providerId) || [];

    if (providerLabels.length >= this.maxKeysPerProvider) {
      throw new Error(
        `Provider ${label.providerId} has reached the maximum of ${this.maxKeysPerProvider} API keys`,
      );
    }

    const newLabel: ApiKeyLabel = {
      id: label.id ?? this.generateLabelId(label.providerId),
      label: label.label,
      providerId: label.providerId,
      keyIndex: label.keyIndex,
      enabled: label.enabled ?? true,
      createdAt: Date.now(),
      usageCount: 0,
      metadata: label.metadata,
    };

    this.labels.set(newLabel.id, newLabel);

    providerLabels.push(newLabel);
    this.byProvider.set(label.providerId, providerLabels);

    logger.debug(`[ModelAuthLabel] 添加 API Key 标签: ${newLabel.id} (${label.providerId})`);
    return newLabel;
  }

  removeLabel(labelId: string): boolean {
    const label = this.labels.get(labelId);
    if (!label) return false;

    this.labels.delete(labelId);

    const providerLabels = this.byProvider.get(label.providerId);
    if (providerLabels) {
      const filtered = providerLabels.filter(l => l.id !== labelId);
      if (filtered.length > 0) {
        this.byProvider.set(label.providerId, filtered);
      } else {
        this.byProvider.delete(label.providerId);
      }
    }

    logger.debug(`[ModelAuthLabel] 移除 API Key 标签: ${labelId}`);
    return true;
  }

  getLabel(labelId: string): ApiKeyLabel | undefined {
    return this.labels.get(labelId);
  }

  getLabelsForProvider(providerId: string): ApiKeyLabel[] {
    return [...(this.byProvider.get(providerId) || [])];
  }

  getEnabledLabelsForProvider(providerId: string): ApiKeyLabel[] {
    return this.getLabelsForProvider(providerId).filter(l => l.enabled);
  }

  getAllLabels(): ApiKeyLabel[] {
    return Array.from(this.labels.values());
  }

  updateLabel(labelId: string, updates: Partial<Pick<ApiKeyLabel, 'label' | 'enabled' | 'metadata'>>): boolean {
    const label = this.labels.get(labelId);
    if (!label) return false;

    if (updates.label !== undefined) label.label = updates.label;
    if (updates.enabled !== undefined) label.enabled = updates.enabled;
    if (updates.metadata !== undefined) label.metadata = updates.metadata;

    logger.debug(`[ModelAuthLabel] 更新标签: ${labelId}`);
    return true;
  }

  recordUsage(labelId: string): void {
    const label = this.labels.get(labelId);
    if (label) {
      label.usageCount++;
      label.lastUsedAt = Date.now();
    }
  }

  selectKey(
    providerId: string,
    strategy: KeyRotationStrategy = 'round-robin',
  ): ApiKeyLabel | null {
    const enabledLabels = this.getEnabledLabelsForProvider(providerId);
    if (enabledLabels.length === 0) return null;

    if (enabledLabels.length === 1) {
      return enabledLabels[0];
    }

    switch (strategy) {
      case 'round-robin':
        return this.selectRoundRobin(providerId, enabledLabels);
      case 'random':
        return this.selectRandom(enabledLabels);
      case 'failover':
        return enabledLabels[0];
      default:
        return enabledLabels[0];
    }
  }

  private selectRoundRobin(providerId: string, labels: ApiKeyLabel[]): ApiKeyLabel {
    const currentIndex = this.roundRobinIndex.get(providerId) ?? -1;
    const nextIndex = (currentIndex + 1) % labels.length;
    this.roundRobinIndex.set(providerId, nextIndex);
    return labels[nextIndex];
  }

  private selectRandom(labels: ApiKeyLabel[]): ApiKeyLabel {
    const randomIndex = Math.floor(Math.random() * labels.length);
    return labels[randomIndex];
  }

  private generateLabelId(providerId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${providerId}-key-${timestamp}-${random}`;
  }

  clear(): void {
    this.labels.clear();
    this.byProvider.clear();
    this.roundRobinIndex.clear();
    logger.debug('[ModelAuthLabel] 已清空所有标签');
  }

  getProviderCount(): number {
    return this.byProvider.size;
  }

  getTotalKeyCount(): number {
    return this.labels.size;
  }
}

let globalLabelManager: ApiKeyLabelManager | null = null;

export function getApiKeyLabelManager(): ApiKeyLabelManager {
  if (!globalLabelManager) {
    globalLabelManager = new ApiKeyLabelManager();
  }
  return globalLabelManager;
}
