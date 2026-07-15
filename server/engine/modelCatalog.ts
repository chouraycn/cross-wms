/**
 * 模型目录与发现 — 参考 OpenClaw agents/model-catalog.ts
 *
 * 管理可用的 AI 模型目录和发现功能。
 */

import { logger } from '../logger.js';
import { getModelById, getAllModels } from './models.js';

export type ModelCapability = 'vision' | 'audio' | 'json' | 'tool_use' | 'function_calling' | 'code' | 'multimodal';

export type ModelType = 'chat' | 'completion' | 'embedding' | 'vision' | 'tts' | 'speech';

export interface ThinkingLevel {
  id: string;
  label: string;
  description?: string;
}

export interface ThinkingProfile {
  name?: string;
  description?: string;
  levels?: ThinkingLevel[];
  defaultLevel?: string;
}

export interface ModelPricing {
  inputPerMillion?: number;
  outputPerMillion?: number;
  isFree?: boolean;
  note?: string;
}

export interface ModelInfo {
  modelId?: string;
  id: string;
  name: string;
  provider: string;
  description?: string;
  capabilities?: string[];
  contextWindow?: number;
  maxTokens?: number;
  authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
  supportsTools?: boolean;
  supportsVision?: boolean;
  thinkingProfile?: ThinkingProfile;
  reasoning?: boolean;
  apiType?: string;
  baseModel?: string;
  input?: string[];
  supportsStreaming?: boolean;
  supportsFunctionCall?: boolean;
  pricing?: ModelPricing;
  isRecommended?: boolean;
  aliases?: string[];
}

export interface ProviderAuth {
  methodId: string;
  label: string;
  hint: string;
  envVar: string;
  flagName: string;
  optionKey: string;
  promptMessage: string;
  defaultModel?: string;
}

export interface ModelCatalogIndex {
  version?: number;
  providers: ProviderInfo[] | Record<string, ProviderInfo>;
  models?: ModelInfo[];
  updatedAt?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description?: string;
  website?: string;
  models: ModelInfo[];
  categories?: string[];
  baseUrl?: string;
  authType?: string;
  auth?: ProviderAuth[];
  docsPath?: string;
  label?: string;
  envVars?: string[];
  allowCustomBaseUrl?: boolean;
  isLocal?: boolean;
  supportedApiTypes?: string[];
  icon?: string;
}

export interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  type: ModelType;
  description?: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens?: number;
  inputCost?: number;
  outputCost?: number;
  available: boolean;
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
  metadata?: Record<string, unknown>;
}

export interface ModelSearchParams {
  query?: string;
  provider?: string;
  type?: ModelType;
  capability?: ModelCapability;
  availableOnly?: boolean;
}

export interface ModelSearchResult {
  models: ModelCatalogEntry[];
  total: number;
}

export function getModelCatalogEntry(modelId: string): ModelCatalogEntry | undefined {
  const model = getModelById(modelId);
  if (!model) {
    return undefined;
  }

  return convertToCatalogEntry(model);
}

export function listModelCatalog(): ModelCatalogEntry[] {
  return getAllModels().map(convertToCatalogEntry);
}

export function searchModelCatalog(params: ModelSearchParams): ModelSearchResult {
  let models = listModelCatalog();

  if (params.query) {
    const queryLower = params.query.toLowerCase();
    models = models.filter(
      (m) =>
        m.id.toLowerCase().includes(queryLower) ||
        m.name.toLowerCase().includes(queryLower) ||
        m.description?.toLowerCase().includes(queryLower),
    );
  }

  if (params.provider) {
    models = models.filter((m) => m.provider === params.provider);
  }

  if (params.type) {
    models = models.filter((m) => m.type === params.type);
  }

  if (params.capability !== undefined) {
    const cap = params.capability as ModelCapability;
    models = models.filter((m) => m.capabilities.includes(cap));
  }

  if (params.availableOnly) {
    models = models.filter((m) => m.available);
  }

  logger.debug(`[ModelCatalog] 搜索结果: ${models.length} 个模型`);

  return {
    models,
    total: models.length,
  };
}

export function findBestModel(params: {
  capability?: ModelCapability;
  contextWindow?: number;
  provider?: string;
}): ModelCatalogEntry | undefined {
  let models = listModelCatalog().filter((m) => m.available);

  if (params.capability !== undefined) {
    const cap = params.capability;
    models = models.filter((m) => m.capabilities.includes(cap));
  }

  if (params.provider) {
    models = models.filter((m) => m.provider === params.provider);
  }

  if (params.contextWindow !== undefined) {
    const minContext = params.contextWindow;
    models = models.filter((m) => m.contextWindow >= minContext);
  }

  if (models.length === 0) {
    return undefined;
  }

  return models.reduce((best, current) => {
    if (params.contextWindow !== undefined) {
      const minContext = params.contextWindow;
      return current.contextWindow >= minContext &&
        current.contextWindow < best.contextWindow
        ? current
        : best;
    }
    return best;
  });
}

export function updateModelAvailability(modelId: string, available: boolean): void {
  const model = getModelById(modelId);
  if (model) {
    (model as unknown as Record<string, unknown>).available = available;
    logger.info(`[ModelCatalog] 更新模型可用性: ${modelId} → ${available}`);
  }
}

function convertToCatalogEntry(model: {
  modelId?: string;
  id?: string;
  name: string;
  provider: string;
  description?: string;
  capabilities?: string[];
  contextWindow?: number;
  authStatus?: string;
}): ModelCatalogEntry {
  return {
    id: model.modelId ?? model.id ?? 'unknown',
    name: model.name,
    provider: model.provider,
    type: 'chat',
    description: model.description,
    capabilities: (model.capabilities as ModelCapability[]) ?? ['json', 'tool_use'],
    contextWindow: model.contextWindow ?? 128_000,
    available: model.authStatus === 'authenticated',
    authStatus: (model.authStatus as ModelCatalogEntry['authStatus']) ?? 'pending',
  };
}

export function getProviders(): string[] {
  const providerSet = new Set<string>();
  for (const model of getAllModels()) {
    providerSet.add(model.provider);
  }
  return Array.from(providerSet);
}

export function getModelTypes(): ModelType[] {
  return ['chat', 'completion', 'embedding', 'vision', 'tts', 'speech'];
}

export function getCapabilities(): ModelCapability[] {
  return ['vision', 'audio', 'json', 'tool_use', 'function_calling', 'code', 'multimodal'];
}