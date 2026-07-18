import { z } from 'zod';
import { logger } from '../../logger.js';

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  type: z.enum(['text', 'vision', 'audio', 'embedding', 'multimodal']),
  contextWindow: z.number(),
  maxOutputTokens: z.number(),
  supportsStreaming: z.boolean().default(true),
  supportsTools: z.boolean().default(true),
  supportsVision: z.boolean().default(false),
  inputCostPer1k: z.number().default(0),
  outputCostPer1k: z.number().default(0),
  speedTier: z.enum(['fast', 'normal', 'slow']).default('normal'),
  qualityTier: z.enum(['economy', 'standard', 'premium']).default('standard'),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

const modelStore = new Map<string, ModelInfo>();
const providerIndex = new Map<string, Set<string>>();
const typeIndex = new Map<string, Set<string>>();

export function registerModel(model: Omit<ModelInfo, 'tags' | 'metadata'> & { tags?: string[]; metadata?: Record<string, unknown> }): void {
  const fullModel: ModelInfo = {
    ...model,
    tags: model.tags ?? [],
    metadata: model.metadata ?? {},
  };

  const result = ModelInfoSchema.safeParse(fullModel);
  if (!result.success) {
    throw new Error(`Invalid model info: ${result.error.message}`);
  }

  modelStore.set(model.id, result.data);

  if (!providerIndex.has(model.provider)) {
    providerIndex.set(model.provider, new Set());
  }
  providerIndex.get(model.provider)!.add(model.id);

  if (!typeIndex.has(model.type)) {
    typeIndex.set(model.type, new Set());
  }
  typeIndex.get(model.type)!.add(model.id);

  logger.debug(`[Agents:ModelScan] Registered model: ${model.id}`);
}

export function unregisterModel(modelId: string): boolean {
  const model = modelStore.get(modelId);
  if (!model) return false;

  modelStore.delete(modelId);

  const providerSet = providerIndex.get(model.provider);
  if (providerSet) {
    providerSet.delete(modelId);
    if (providerSet.size === 0) {
      providerIndex.delete(model.provider);
    }
  }

  const typeSet = typeIndex.get(model.type);
  if (typeSet) {
    typeSet.delete(modelId);
    if (typeSet.size === 0) {
      typeIndex.delete(model.type);
    }
  }

  logger.debug(`[Agents:ModelScan] Unregistered model: ${modelId}`);
  return true;
}

export function getModel(modelId: string): ModelInfo | undefined {
  return modelStore.get(modelId);
}

export function listModels(options?: {
  provider?: string;
  type?: ModelInfo['type'];
  enabledOnly?: boolean;
}): ModelInfo[] {
  let models = Array.from(modelStore.values());

  if (options?.enabledOnly) {
    models = models.filter(m => m.enabled);
  }

  if (options?.provider) {
    models = models.filter(m => m.provider === options.provider);
  }

  if (options?.type) {
    models = models.filter(m => m.type === options.type);
  }

  return models;
}

export function listProviders(): string[] {
  return Array.from(providerIndex.keys());
}

export function getModelsByProvider(provider: string): ModelInfo[] {
  return listModels({ provider });
}

export function getModelsByType(type: ModelInfo['type']): ModelInfo[] {
  return listModels({ type });
}

export function modelExists(modelId: string): boolean {
  return modelStore.has(modelId);
}

export function findBestModel(options: {
  type?: ModelInfo['type'];
  minContextWindow?: number;
  needsTools?: boolean;
  needsVision?: boolean;
  needsStreaming?: boolean;
  preferredSpeedTier?: ModelInfo['speedTier'];
  preferredQualityTier?: ModelInfo['qualityTier'];
}): ModelInfo | null {
  let candidates = listModels({ enabledOnly: true });

  if (options.type) {
    candidates = candidates.filter(m => m.type === options.type);
  }

  if (options.minContextWindow) {
    candidates = candidates.filter(m => m.contextWindow >= options.minContextWindow!);
  }

  if (options.needsTools) {
    candidates = candidates.filter(m => m.supportsTools);
  }

  if (options.needsVision) {
    candidates = candidates.filter(m => m.supportsVision);
  }

  if (options.needsStreaming) {
    candidates = candidates.filter(m => m.supportsStreaming);
  }

  if (candidates.length === 0) return null;

  if (options.preferredSpeedTier) {
    const tierOrder = ['fast', 'normal', 'slow'];
    candidates.sort((a, b) => {
      const aTier = tierOrder.indexOf(a.speedTier);
      const bTier = tierOrder.indexOf(b.speedTier);
      return aTier - bTier;
    });
  }

  if (options.preferredQualityTier) {
    const tierOrder = ['premium', 'standard', 'economy'];
    candidates.sort((a, b) => {
      const aTier = tierOrder.indexOf(a.qualityTier);
      const bTier = tierOrder.indexOf(b.qualityTier);
      return aTier - bTier;
    });
  }

  return candidates[0] ?? null;
}

export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getModel(modelId);
  if (!model) return 0;

  const inputCost = (inputTokens / 1000) * model.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * model.outputCostPer1k;
  
  return inputCost + outputCost;
}

export function clearModels(): void {
  modelStore.clear();
  providerIndex.clear();
  typeIndex.clear();
}

export function registerModels(models: ModelInfo[]): void {
  for (const model of models) {
    registerModel(model);
  }
}

logger.debug('[Agents:ModelScan] Module loaded');
