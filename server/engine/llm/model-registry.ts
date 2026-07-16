import type { Api, Model } from './types.js';
import { logger } from '../../logger.js';

export type ModelRegistryEntry = Model;

export interface ModelRegistry {
  register(model: Model): void;
  get(provider: string, id: string): Model | undefined;
  list(): Model[];
  find(predicate: (model: Model) => boolean): Model | undefined;
  findByProvider(provider: string): Model[];
  clear(): void;
}

const registry = new Map<string, ModelRegistryEntry>();

function makeKey(provider: string, id: string): string {
  return `${provider}/${id}`;
}

export function registerModel<TApi extends Api>(model: Model<TApi>): void {
  const key = makeKey(model.provider, model.id);
  registry.set(key, model as Model);
  logger.debug(`[LLM] Registered model: ${key}`);
}

export function getModel(provider: string, id: string): Model | undefined {
  return registry.get(makeKey(provider, id));
}

export function listRegisteredModels(): Model[] {
  return Array.from(registry.values());
}

export function findModel(predicate: (model: Model) => boolean): Model | undefined {
  for (const model of registry.values()) {
    if (predicate(model)) return model;
  }
  return undefined;
}

export function findModelsByProvider(provider: string): Model[] {
  return Array.from(registry.values()).filter(m => m.provider === provider);
}

export function clearModelRegistry(): void {
  registry.clear();
}
