/**
 * 选择显示 — 模型选择的显示和格式化
 *
 * 提供模型显示名称、描述、分组等 UI 相关的辅助功能。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId, normalizeModelId } from './model-selection-normalize.js';

export interface ModelDisplayInfo {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  description?: string;
  capabilities: string[];
  contextWindow?: number;
  isRecommended?: boolean;
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
  displayLabel: string;
  displayGroup: string;
  sortPriority: number;
}

export interface DisplayGroup {
  id: string;
  label: string;
  models: ModelDisplayInfo[];
  sortOrder: number;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  mistral: 'Mistral',
  cohere: 'Cohere',
  fireworks: 'Fireworks AI',
  deepinfra: 'DeepInfra',
  cerebras: 'Cerebras',
  nvidia: 'NVIDIA NIM',
  ollama: 'Ollama',
  litellm: 'LiteLLM',
  openrouter: 'OpenRouter',
  qwen: '阿里通义千问',
  zhipu: '智谱 AI',
  moonshot: 'Moonshot (Kimi)',
  minimax: 'MiniMax',
  tencent: '腾讯混元',
  volcengine: '字节豆包',
  xai: 'xAI',
  perplexity: 'Perplexity',
  together: 'Together',
  novita: 'Novita',
  siliconflow: '硅基流动',
};

const PROVIDER_CATEGORIES: Record<string, string> = {
  anthropic: 'international',
  openai: 'international',
  google: 'international',
  deepseek: 'international',
  groq: 'international',
  mistral: 'international',
  cohere: 'international',
  fireworks: 'international',
  deepinfra: 'international',
  cerebras: 'international',
  nvidia: 'international',
  openrouter: 'international',
  perplexity: 'international',
  together: 'international',
  qwen: 'chinese',
  zhipu: 'chinese',
  moonshot: 'chinese',
  minimax: 'chinese',
  tencent: 'chinese',
  volcengine: 'chinese',
  xai: 'international',
  novita: 'chinese',
  siliconflow: 'chinese',
  ollama: 'local',
  litellm: 'local',
};

const CATEGORY_LABELS: Record<string, string> = {
  recommended: '推荐',
  international: '国际',
  chinese: '国内',
  local: '本地',
  other: '其他',
};

const CATEGORY_SORT_ORDER: Record<string, number> = {
  recommended: 0,
  international: 1,
  chinese: 2,
  local: 3,
  other: 99,
};

export function getProviderDisplayName(providerId: string): string {
  const normalized = normalizeProviderId(providerId);
  return PROVIDER_DISPLAY_NAMES[normalized] || providerId;
}

export function getProviderCategory(providerId: string): string {
  const normalized = normalizeProviderId(providerId);
  return PROVIDER_CATEGORIES[normalized] || 'other';
}

export function formatModelDisplayName(model: {
  name: string;
  provider: string;
  id?: string;
}): string {
  return `${model.name} (${getProviderDisplayName(model.provider)})`;
}

export function formatModelDisplayLabel(model: {
  name: string;
  provider: string;
  isRecommended?: boolean;
}): string {
  let label = model.name;
  if (model.isRecommended) {
    label = `⭐ ${label}`;
  }
  return label;
}

export function buildDisplayGroups(
  models: Array<{
    id: string;
    name: string;
    provider: string;
    description?: string;
    capabilities?: string[];
    contextWindow?: number;
    isRecommended?: boolean;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
  }>,
  options: {
    groupBy?: 'provider' | 'category' | 'none';
    showUnauthenticated?: boolean;
    sortBy?: 'name' | 'recommended' | 'context';
  } = {},
): DisplayGroup[] {
  const groupBy = options.groupBy ?? 'category';
  const showUnauthenticated = options.showUnauthenticated ?? true;
  const sortBy = options.sortBy ?? 'recommended';

  const displayModels: ModelDisplayInfo[] = models
    .filter(m => showUnauthenticated || m.authStatus === 'authenticated')
    .map(m => buildModelDisplayInfo(m));

  const sorted = sortModels(displayModels, sortBy);

  if (groupBy === 'none') {
    return [{
      id: 'all',
      label: '全部模型',
      models: sorted,
      sortOrder: 0,
    }];
  }

  if (groupBy === 'provider') {
    return groupByProvider(sorted);
  }

  return groupByCategory(sorted);
}

function buildModelDisplayInfo(model: {
  id: string;
  name: string;
  provider: string;
  description?: string;
  capabilities?: string[];
  contextWindow?: number;
  isRecommended?: boolean;
  authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
}): ModelDisplayInfo {
  const category = getProviderCategory(model.provider);
  const sortPriority = model.isRecommended
    ? 0
    : CATEGORY_SORT_ORDER[category] ?? 99;

  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    providerName: getProviderDisplayName(model.provider),
    description: model.description,
    capabilities: model.capabilities ?? [],
    contextWindow: model.contextWindow,
    isRecommended: model.isRecommended ?? false,
    authStatus: model.authStatus ?? 'pending',
    displayLabel: formatModelDisplayLabel(model),
    displayGroup: category,
    sortPriority,
  };
}

function sortModels(
  models: ModelDisplayInfo[],
  sortBy: string,
): ModelDisplayInfo[] {
  return [...models].sort((a, b) => {
    if (sortBy === 'recommended') {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
    }

    if (sortBy === 'context') {
      const ctxA = a.contextWindow ?? 0;
      const ctxB = b.contextWindow ?? 0;
      if (ctxA !== ctxB) return ctxB - ctxA;
    }

    const priorityDiff = a.sortPriority - b.sortPriority;
    if (priorityDiff !== 0) return priorityDiff;

    return a.name.localeCompare(b.name);
  });
}

function groupByProvider(models: ModelDisplayInfo[]): DisplayGroup[] {
  const groups = new Map<string, ModelDisplayInfo[]>();

  for (const model of models) {
    if (!groups.has(model.provider)) {
      groups.set(model.provider, []);
    }
    groups.get(model.provider)!.push(model);
  }

  const result: DisplayGroup[] = [];
  for (const [providerId, providerModels] of groups) {
    result.push({
      id: providerId,
      label: getProviderDisplayName(providerId),
      models: providerModels,
      sortOrder: CATEGORY_SORT_ORDER[getProviderCategory(providerId)] ?? 99,
    });
  }

  result.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });

  return result;
}

function groupByCategory(models: ModelDisplayInfo[]): DisplayGroup[] {
  const groups = new Map<string, ModelDisplayInfo[]>();
  const recommended: ModelDisplayInfo[] = [];

  for (const model of models) {
    if (model.isRecommended) {
      recommended.push(model);
    }
    const category = model.displayGroup;
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(model);
  }

  const result: DisplayGroup[] = [];

  if (recommended.length > 0) {
    result.push({
      id: 'recommended',
      label: CATEGORY_LABELS.recommended,
      models: recommended,
      sortOrder: CATEGORY_SORT_ORDER.recommended,
    });
  }

  for (const [categoryId, categoryModels] of groups) {
    if (categoryId === 'recommended') continue;
    result.push({
      id: categoryId,
      label: CATEGORY_LABELS[categoryId] || categoryId,
      models: categoryModels,
      sortOrder: CATEGORY_SORT_ORDER[categoryId] ?? 99,
    });
  }

  result.sort((a, b) => a.sortOrder - b.sortOrder);
  return result;
}

export function searchDisplayModels(
  models: ModelDisplayInfo[],
  query: string,
): ModelDisplayInfo[] {
  if (!query || !query.trim()) return models;

  const queryLower = query.toLowerCase().trim();

  return models.filter(m =>
    m.name.toLowerCase().includes(queryLower) ||
    m.id.toLowerCase().includes(queryLower) ||
    m.providerName.toLowerCase().includes(queryLower) ||
    m.provider.toLowerCase().includes(queryLower) ||
    m.description?.toLowerCase().includes(queryLower) ||
    m.capabilities.some(cap => cap.toLowerCase().includes(queryLower)),
  );
}

export function formatContextWindow(size?: number): string {
  if (!size) return '-';
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)}M`;
  if (size >= 1_000) return `${(size / 1_000).toFixed(0)}K`;
  return size.toString();
}
