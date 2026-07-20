/**
 * 移植自 openclaw/src/agents/models-config-state.ts
 *
 * Process-wide models.json coordination state.
 * Uses Symbol.for to keep write locks and ready-cache shared across dynamic imports.
 */

export type ModelsJsonReadyResult = {
  agentDir: string;
  wrote: boolean;
};

export type ModelsJsonReadyState = {
  fingerprint: string;
  result: ModelsJsonReadyResult;
};

type ModelsJsonState = {
  writeLocks: Map<string, Promise<void>>;
  readyCache: Map<string, Promise<ModelsJsonReadyState>>;
};

const MODELS_JSON_STATE_KEY = Symbol.for("openclaw.modelsJsonState");

export const MODELS_JSON_STATE = (() => {
  const globalState = globalThis as typeof globalThis & {
    [MODELS_JSON_STATE_KEY]?: ModelsJsonState;
  };
  if (!globalState[MODELS_JSON_STATE_KEY]) {
    globalState[MODELS_JSON_STATE_KEY] = {
      writeLocks: new Map<string, Promise<void>>(),
      readyCache: new Map<string, Promise<ModelsJsonReadyState>>(),
    };
  }
  return globalState[MODELS_JSON_STATE_KEY];
})();

/** Clear models.json write/ready caches for tests. */
export function resetModelsJsonReadyCacheForTest(): void {
  MODELS_JSON_STATE.writeLocks.clear();
  MODELS_JSON_STATE.readyCache.clear();
}
