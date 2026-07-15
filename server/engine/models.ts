/**
 * Models Gateway Methods — 参考 OpenClaw gateway/server-methods/models.ts
 *
 * 实现 models.list/models.auth.status 等核心模型管理功能。
 */

import { logger } from '../logger.js';
import { resolveModelRuntimePolicy } from './modelRuntimePolicy.js';

export interface ModelInfo {
  modelId: string;
  name: string;
  provider: string;
  description?: string;
  capabilities?: string[];
  contextWindow?: number;
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
  metadata?: Record<string, unknown>;
}

export interface ModelListResult {
  models: ModelInfo[];
  total: number;
}

export interface ModelAuthStatusResult {
  modelId: string;
  authStatus: ModelInfo['authStatus'];
  provider: string;
  lastCheckedAt?: number;
}

export interface ModelResolveParams {
  modelId?: string;
  provider?: string;
  agentId?: string;
}

export interface ModelResolveResult {
  modelId: string;
  provider: string;
  source: 'agent' | 'model' | 'provider' | 'implicit';
}

const modelRegistry: Record<string, ModelInfo> = {
  'claude-3-5-sonnet': {
    modelId: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Anthropic 的最新模型，平衡性能和成本',
    capabilities: ['vision', 'json', 'tool_use'],
    contextWindow: 200_000,
    authStatus: 'authenticated',
  },
  'claude-3-opus': {
    modelId: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    description: 'Anthropic 的旗舰模型，最高推理能力',
    capabilities: ['vision', 'json', 'tool_use'],
    contextWindow: 200_000,
    authStatus: 'authenticated',
  },
  'gpt-4o': {
    modelId: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'OpenAI 的多模态模型',
    capabilities: ['vision', 'json', 'tool_use'],
    contextWindow: 128_000,
    authStatus: 'unauthenticated',
  },
  'gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'openai',
    description: 'GPT-4o 的轻量版本，更快更便宜',
    capabilities: ['vision', 'json', 'tool_use'],
    contextWindow: 128_000,
    authStatus: 'unauthenticated',
  },
  'deepseek-chat': {
    modelId: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    description: '深度求索聊天模型',
    capabilities: ['json', 'tool_use'],
    contextWindow: 128_000,
    authStatus: 'authenticated',
  },
  'gemini-1.5-flash': {
    modelId: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    description: 'Google 的快速多模态模型',
    capabilities: ['vision', 'json', 'tool_use'],
    contextWindow: 1_000_000,
    authStatus: 'pending',
  },
};

export async function modelList(): Promise<ModelListResult> {
  const models = Object.values(modelRegistry);

  logger.debug(`[Models] 获取模型列表: ${models.length} 个`);

  return {
    models,
    total: models.length,
  };
}

export async function modelAuthStatus(modelId: string): Promise<ModelAuthStatusResult | null> {
  const model = modelRegistry[modelId];
  if (!model) {
    return null;
  }

  return {
    modelId: model.modelId,
    authStatus: model.authStatus,
    provider: model.provider,
    lastCheckedAt: Date.now(),
  };
}

export async function modelResolve(params: ModelResolveParams): Promise<ModelResolveResult> {
  const result = resolveModelRuntimePolicy(params);

  return {
    modelId: result.modelId ?? 'claude-3-5-sonnet',
    provider: result.provider ?? 'anthropic',
    source: result.source,
  };
}

export function getModelById(modelId: string): ModelInfo | undefined {
  return modelRegistry[modelId];
}

export function getAllModels(): ModelInfo[] {
  return Object.values(modelRegistry);
}

export function updateModelAuthStatus(modelId: string, status: ModelInfo['authStatus']): void {
  const model = modelRegistry[modelId];
  if (model) {
    model.authStatus = status;
    logger.info(`[Models] 更新认证状态: ${modelId} → ${status}`);
  }
}