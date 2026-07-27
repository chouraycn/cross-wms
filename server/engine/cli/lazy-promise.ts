// Lazy promise loader for deferred module initialization.
// 移植自 openclaw/src/shared/lazy-promise.ts

export function createLazyImportLoader<T>(loadFn: () => Promise<T>): {
  load: () => Promise<T>;
  getLoaded: () => T | undefined;
} {
  let promise: Promise<T> | null = null;
  let loaded: T | undefined = undefined;
  return {
    load: async (): Promise<T> => {
      if (promise === null) {
        promise = loadFn().then((mod) => {
          loaded = mod;
          return mod;
        });
      }
      return await promise;
    },
    getLoaded: () => loaded,
  };
}
