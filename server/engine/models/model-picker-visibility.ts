/**
 * 选择器可见性 — 模型选择器的可见性管理
 *
 * 管理模型选择器的显示/隐藏状态，支持根据上下文
 * 动态决定哪些模型应该显示。
 */

import { logger } from '../../logger.js';
import {
  filterVisibleModels,
  isModelVisible,
  isProviderVisible,
  createVisibilityPolicy,
  mergeVisibilityPolicies,
  type VisibilityPolicyConfig,
  type VisibilityContext,
  type VisibilityPolicy,
} from './model-visibility-policy.js';
import { normalizeProviderId } from './model-selection-normalize.js';

export interface PickerVisibilityState {
  isVisible: boolean;
  visibleModelCount: number;
  visibleProviderCount: number;
  lastUpdatedAt: number;
}

export interface PickerVisibilityOptions {
  defaultPolicy?: VisibilityPolicy;
  minModelsToShow?: number;
  showEmptyState?: boolean;
}

export class ModelPickerVisibilityManager {
  private basePolicy: VisibilityPolicyConfig;
  private context: VisibilityContext = {};
  private userOverrides: Partial<VisibilityPolicyConfig> = {};
  private minModelsToShow: number;
  private showEmptyState: boolean;
  private state: PickerVisibilityState = {
    isVisible: true,
    visibleModelCount: 0,
    visibleProviderCount: 0,
    lastUpdatedAt: 0,
  };

  constructor(options: PickerVisibilityOptions = {}) {
    this.basePolicy = createVisibilityPolicy(options.defaultPolicy ?? 'all');
    this.minModelsToShow = options.minModelsToShow ?? 0;
    this.showEmptyState = options.showEmptyState ?? true;
  }

  setContext(context: VisibilityContext): void {
    this.context = context;
    this.updateState();
  }

  setBasePolicy(policy: VisibilityPolicyConfig): void {
    this.basePolicy = policy;
    this.updateState();
  }

  setUserOverrides(overrides: Partial<VisibilityPolicyConfig>): void {
    this.userOverrides = overrides;
    this.updateState();
  }

  updateUserOverrides(overrides: Partial<VisibilityPolicyConfig>): void {
    this.userOverrides = { ...this.userOverrides, ...overrides };
    this.updateState();
  }

  getEffectivePolicy(): VisibilityPolicyConfig {
    return mergeVisibilityPolicies(this.basePolicy, this.userOverrides);
  }

  isModelVisibleInPicker<T extends {
    id: string;
    provider: string;
    enabled?: boolean;
    isRecommended?: boolean;
    isDeprecated?: boolean;
    isBeta?: boolean;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
    capabilities?: string[];
    hidden?: boolean;
  }>(model: T): boolean {
    const policy = this.getEffectivePolicy();
    return isModelVisible(model, policy, this.context);
  }

  filterModelsForPicker<T extends {
    id: string;
    provider: string;
    enabled?: boolean;
    isRecommended?: boolean;
    isDeprecated?: boolean;
    isBeta?: boolean;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
    capabilities?: string[];
    hidden?: boolean;
  }>(models: T[]): T[] {
    const policy = this.getEffectivePolicy();
    const filtered = filterVisibleModels(models, policy, this.context);
    this.state.visibleModelCount = filtered.length;
    this.state.visibleProviderCount = this.countVisibleProviders(filtered);
    this.state.lastUpdatedAt = Date.now();
    return filtered;
  }

  isPickerVisible(models: { id: string; provider: string }[]): boolean {
    const visible = this.filterModelsForPicker(models);

    if (visible.length >= this.minModelsToShow) {
      this.state.isVisible = true;
      return true;
    }

    this.state.isVisible = this.showEmptyState;
    return this.showEmptyState;
  }

  getState(): PickerVisibilityState {
    return { ...this.state };
  }

  hideProvider(providerId: string): void {
    const normalized = normalizeProviderId(providerId);
    const current = this.userOverrides.hiddenProviders ?? [];
    if (!current.includes(normalized)) {
      this.userOverrides.hiddenProviders = [...current, normalized];
      this.updateState();
    }
  }

  showProvider(providerId: string): void {
    const normalized = normalizeProviderId(providerId);
    const current = this.userOverrides.hiddenProviders ?? [];
    if (current.includes(normalized)) {
      this.userOverrides.hiddenProviders = current.filter(p => p !== normalized);
      this.updateState();
    }
  }

  hideModel(modelId: string): void {
    const current = this.userOverrides.hiddenModels ?? [];
    if (!current.includes(modelId)) {
      this.userOverrides.hiddenModels = [...current, modelId];
      this.updateState();
    }
  }

  showModel(modelId: string): void {
    const current = this.userOverrides.hiddenModels ?? [];
    if (current.includes(modelId)) {
      this.userOverrides.hiddenModels = current.filter(m => m !== modelId);
      this.updateState();
    }
  }

  reset(): void {
    this.userOverrides = {};
    this.updateState();
    logger.debug('[PickerVisibility] 已重置可见性设置');
  }

  private countVisibleProviders(models: { provider: string }[]): number {
    const providers = new Set(models.map(m => normalizeProviderId(m.provider)));
    return providers.size;
  }

  private updateState(): void {
    this.state.lastUpdatedAt = Date.now();
  }
}

let globalPickerVisibilityManager: ModelPickerVisibilityManager | null = null;

export function getModelPickerVisibilityManager(): ModelPickerVisibilityManager {
  if (!globalPickerVisibilityManager) {
    globalPickerVisibilityManager = new ModelPickerVisibilityManager();
  }
  return globalPickerVisibilityManager;
}
