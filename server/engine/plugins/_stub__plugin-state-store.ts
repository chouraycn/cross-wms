// Stub file for plugin-state-store.js

export type OpenKeyedStoreOptions = {
  env?: NodeJS.ProcessEnv;
};

export interface PluginStateKeyedStore<T = unknown> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createPluginStateKeyedStore<T>(_options: OpenKeyedStoreOptions): PluginStateKeyedStore<T> {
  const store = new Map<string, T>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: T) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
  };
}