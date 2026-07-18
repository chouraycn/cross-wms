import { z } from 'zod';
import { logger } from '../../logger.js';
import { getModel, type ModelInfo } from './model-scan.js';

export const ModelRuntimePolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultModel: z.string(),
  fallbackModels: z.array(z.string()).default([]),
  maxInputTokens: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  temperature: z.number().default(0.7),
  topP: z.number().default(1),
  presencePenalty: z.number().default(0),
  frequencyPenalty: z.number().default(0),
  enableStreaming: z.boolean().default(true),
  enableTools: z.boolean().default(true),
  autoFallback: z.boolean().default(true),
  rateLimitPerMinute: z.number().optional(),
  maxRetries: z.number().default(3),
  retryDelayMs: z.number().default(1000),
  timeoutMs: z.number().default(60000),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ModelRuntimePolicy = z.infer<typeof ModelRuntimePolicySchema>;

const policyStore = new Map<string, ModelRuntimePolicy>();

export function createModelRuntimePolicy(params: {
  id: string;
  name: string;
  defaultModel: string;
  fallbackModels?: string[];
  maxInputTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  enableStreaming?: boolean;
  enableTools?: boolean;
  autoFallback?: boolean;
  rateLimitPerMinute?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}): ModelRuntimePolicy {
  const policy: ModelRuntimePolicy = {
    id: params.id,
    name: params.name,
    defaultModel: params.defaultModel,
    fallbackModels: params.fallbackModels ?? [],
    maxInputTokens: params.maxInputTokens,
    maxOutputTokens: params.maxOutputTokens,
    temperature: params.temperature ?? 0.7,
    topP: params.topP ?? 1,
    presencePenalty: params.presencePenalty ?? 0,
    frequencyPenalty: params.frequencyPenalty ?? 0,
    enableStreaming: params.enableStreaming ?? true,
    enableTools: params.enableTools ?? true,
    autoFallback: params.autoFallback ?? true,
    rateLimitPerMinute: params.rateLimitPerMinute,
    maxRetries: params.maxRetries ?? 3,
    retryDelayMs: params.retryDelayMs ?? 1000,
    timeoutMs: params.timeoutMs ?? 60000,
    metadata: params.metadata ?? {},
  };

  const result = ModelRuntimePolicySchema.safeParse(policy);
  if (!result.success) {
    throw new Error(`Invalid model runtime policy: ${result.error.message}`);
  }

  policyStore.set(params.id, result.data);
  logger.debug(`[Agents:ModelRuntimePolicy] Created policy: ${params.id}`);
  return result.data;
}

export function getModelRuntimePolicy(policyId: string): ModelRuntimePolicy | undefined {
  return policyStore.get(policyId);
}

export function updateModelRuntimePolicy(policyId: string, updates: Partial<ModelRuntimePolicy>): ModelRuntimePolicy | undefined {
  const existing = policyStore.get(policyId);
  if (!existing) return undefined;

  const updated: ModelRuntimePolicy = {
    ...existing,
    ...updates,
    id: policyId,
  };

  policyStore.set(policyId, updated);
  logger.debug(`[Agents:ModelRuntimePolicy] Updated policy: ${policyId}`);
  return updated;
}

export function deleteModelRuntimePolicy(policyId: string): boolean {
  const existed = policyStore.has(policyId);
  if (existed) {
    policyStore.delete(policyId);
    logger.debug(`[Agents:ModelRuntimePolicy] Deleted policy: ${policyId}`);
  }
  return existed;
}

export function listModelRuntimePolicies(): ModelRuntimePolicy[] {
  return Array.from(policyStore.values());
}

export function resolveModelForPolicy(policyId: string, preferredModel?: string): {
  model: string;
  modelInfo?: ModelInfo;
  usedFallback: boolean;
} {
  const policy = policyStore.get(policyId);
  if (!policy) {
    throw new Error(`Model runtime policy not found: ${policyId}`);
  }

  const primaryModel = preferredModel ?? policy.defaultModel;
  const primaryInfo = getModel(primaryModel);

  if (primaryInfo && primaryInfo.enabled) {
    return {
      model: primaryModel,
      modelInfo: primaryInfo,
      usedFallback: false,
    };
  }

  if (!policy.autoFallback) {
    return {
      model: primaryModel,
      modelInfo: primaryInfo,
      usedFallback: false,
    };
  }

  for (const fallbackModel of policy.fallbackModels) {
    const fallbackInfo = getModel(fallbackModel);
    if (fallbackInfo && fallbackInfo.enabled) {
      logger.warn(`[Agents:ModelRuntimePolicy] Falling back from ${primaryModel} to ${fallbackModel}`);
      return {
        model: fallbackModel,
        modelInfo: fallbackInfo,
        usedFallback: true,
      };
    }
  }

  return {
    model: primaryModel,
    modelInfo: primaryInfo,
    usedFallback: false,
  };
}

export function getEffectiveMaxTokens(policyId: string, modelId: string): number | undefined {
  const policy = policyStore.get(policyId);
  const model = getModel(modelId);

  if (!policy && !model) return undefined;

  const policyMax = policy?.maxOutputTokens;
  const modelMax = model?.maxOutputTokens;

  if (policyMax && modelMax) {
    return Math.min(policyMax, modelMax);
  }

  return policyMax ?? modelMax;
}

export function clearModelRuntimePolicies(): void {
  policyStore.clear();
}

logger.debug('[Agents:ModelRuntimePolicy] Module loaded');
