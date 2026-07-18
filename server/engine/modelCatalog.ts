/**
 * 模型目录与发现 — 已迁移到 model-catalog/ 目录
 *
 * 本文件保持向后兼容，所有功能委托给新的 model-catalog 模块。
 * 新代码请直接从 './model-catalog/index.js' 导入。
 */

import { logger } from '../logger.js';
import {
  modelCatalog,
  type ModelCapability as NewModelCapability,
  type ModelType as NewModelType,
} from './model-catalog/index.js';

export type ModelCapability = NewModelCapability;
export type ModelType = NewModelType;

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
  const model = modelCatalog.getModel(modelId);
  if (!model) {
    return undefined;
  }
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    type: model.type,
    description: model.description,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    available: model.available,
    authStatus: model.authStatus,
    metadata: model.metadata,
  };
}

export function listModelCatalog(): ModelCatalogEntry[] {
  return modelCatalog.listModels().map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    type: model.type,
    description: model.description,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    available: model.available,
    authStatus: model.authStatus,
    metadata: model.metadata,
  }));
}

export function searchModelCatalog(params: ModelSearchParams): ModelSearchResult {
  const result = modelCatalog.search(params);
  return {
    models: result.models.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      type: model.type,
      description: model.description,
      capabilities: model.capabilities,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens,
      available: model.available,
      authStatus: model.authStatus,
      metadata: model.metadata,
    })),
    total: result.total,
  };
}

export function findBestModel(params: {
  capability?: ModelCapability;
  contextWindow?: number;
  provider?: string;
}): ModelCatalogEntry | undefined {
  const model = modelCatalog.findBestModel(params);
  if (!model) {
    return undefined;
  }
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    type: model.type,
    description: model.description,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    available: model.available,
    authStatus: model.authStatus,
    metadata: model.metadata,
  };
}

export function updateModelAvailability(modelId: string, available: boolean): void {
  const model = modelCatalog.getModel(modelId);
  if (model) {
    modelCatalog.updateModelAuthStatus(
      model.provider,
      modelId,
      available ? 'authenticated' : 'unauthenticated',
    );
    logger.info(`[ModelCatalog] 更新模型可用性: ${modelId} → ${available}`);
  }
}

export function getProviders(): string[] {
  return modelCatalog.listProviders();
}

export function getModelTypes(): ModelType[] {
  return modelCatalog.getModelTypes();
}

export function getCapabilities(): ModelCapability[] {
  return modelCatalog.getCapabilities();
}

export { modelCatalog as default };
export { ModelCatalog } from './model-catalog/index.js';
