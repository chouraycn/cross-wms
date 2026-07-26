export function createLazyFacadeValue<TFacade extends object, K extends keyof TFacade>(
  loadFacadeModule: () => TFacade,
  key: K,
): TFacade[K] {
  return ((...args: unknown[]) => {
    const value = loadFacadeModule()[key];
    if (typeof value !== "function") {
      return value;
    }
    return (value as (...innerArgs: unknown[]) => unknown)(...args);
  }) as TFacade[K];
}

export function createLazyFacadeObject<T extends object>(loader: () => T): T {
  const cache: Partial<T> = {};
  return new Proxy({} as T, {
    get(_target, prop) {
      const key = prop as keyof T;
      if (!(key in cache)) {
        cache[key] = createLazyFacadeValue(loader, key);
      }
      return cache[key];
    },
  });
}
