// Leaf module holding a runtime hook registry, extracted to break the
// modelFailover.ts ↔ modelsStore.ts cycle (#1).
//
// modelFailover registers invalidateFailoverModelsCache and resetModelHealthById
// here at module load; modelsStore calls them via this registry instead of
// dynamically importing modelFailover. The remaining edge (modelFailover →
// modelsStore) is a one-way dynamic import, so the cycle is fully broken.
// modelFailover loads at startup (statically imported by aiClient/reactExecutor/routes),
// so hooks are registered before any modelsStore runtime call.

export interface ModelFailoverHooks {
  invalidateFailoverModelsCache: () => void;
  resetModelHealthById: (modelId: string) => void;
}

let registeredHooks: ModelFailoverHooks | null = null;

export function registerModelFailoverHooks(hooks: ModelFailoverHooks): void {
  registeredHooks = hooks;
}

function requireHooks(): ModelFailoverHooks {
  if (!registeredHooks) {
    throw new Error('modelFailover hooks not registered yet');
  }
  return registeredHooks;
}

export function invalidateFailoverModelsCache(): void {
  return requireHooks().invalidateFailoverModelsCache();
}

export function resetModelHealthById(modelId: string): void {
  return requireHooks().resetModelHealthById(modelId);
}
