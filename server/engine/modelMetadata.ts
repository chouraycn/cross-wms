/**
 * 模型元数据管理 — 对齐 OpenClaw model-catalog-core
 *
 * 提供模型能力检测、定价信息、上下文窗口限制等元数据管理
 */

import { logger } from '../logger.js';

/** 模型上下文窗口限制 */
export interface ModelContextLimits {
  maxTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  contextWindow?: number;
}

/** 模型定价信息 */
export interface ModelPricing {
  inputTokensPrice: number;
  outputTokensPrice: number;
  unit: string;
}

/** 模型能力标志 */
export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  systemMessage: boolean;
  jsonMode: boolean;
  functionCalling: boolean;
  parallelToolCalls: boolean;
  promptCache: boolean;
  thinkingBudget: boolean;
}

/** 模型元数据 */
export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  apiType: string;
  limits: ModelContextLimits;
  pricing?: ModelPricing;
  capabilities: ModelCapabilities;
  description?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

/** 模型元数据存储 */
class ModelMetadataStore {
  private models = new Map<string, ModelMetadata>();
  private byProvider = new Map<string, ModelMetadata[]>();

  register(model: ModelMetadata): void {
    this.models.set(model.id, model);
    
    const existing = this.byProvider.get(model.provider) || [];
    existing.push(model);
    this.byProvider.set(model.provider, existing);

    logger.info(`[ModelMetadata] Registered model: ${model.id} (${model.name})`);
  }

  get(id: string): ModelMetadata | undefined {
    return this.models.get(id);
  }

  getByProvider(provider: string): ModelMetadata[] {
    return this.byProvider.get(provider) || [];
  }

  getAll(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  unregister(id: string): boolean {
    const model = this.models.get(id);
    if (!model) return false;

    this.models.delete(id);
    
    const existing = this.byProvider.get(model.provider);
    if (existing) {
      this.byProvider.set(model.provider, existing.filter(m => m.id !== id));
    }

    logger.info(`[ModelMetadata] Unregistered model: ${id}`);
    return true;
  }

  getCapabilities(id: string): ModelCapabilities | null {
    const model = this.models.get(id);
    return model?.capabilities || null;
  }

  getLimits(id: string): ModelContextLimits | null {
    const model = this.models.get(id);
    return model?.limits || null;
  }

  supportsStreaming(id: string): boolean {
    const caps = this.getCapabilities(id);
    return caps?.streaming ?? false;
  }

  supportsTools(id: string): boolean {
    const caps = this.getCapabilities(id);
    return caps?.tools ?? false;
  }

  supportsVision(id: string): boolean {
    const caps = this.getCapabilities(id);
    return caps?.vision ?? false;
  }

  estimateCost(id: string, inputTokens: number, outputTokens: number): number | null {
    const model = this.models.get(id);
    if (!model?.pricing) return null;

    return (inputTokens * model.pricing.inputTokensPrice + 
            outputTokens * model.pricing.outputTokensPrice);
  }
}

/** 全局模型元数据存储实例 */
const globalModelMetadataStore = new ModelMetadataStore();

export function getModelMetadataStore(): ModelMetadataStore {
  return globalModelMetadataStore;
}