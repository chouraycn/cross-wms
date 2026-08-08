export function createLazyFacadeValue<TFacade extends object, K extends keyof TFacade>(
  loadFacadeModule: () => TFacade,
  key: K,
): TFacade[K] {
  return ((...args: any[]) => {
    const value = loadFacadeModule()[key];
    if (typeof value !== "function") {
      return value;
    }
    return (value as (...innerArgs: any[]) => unknown)(...args);
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

export function createLazyFacadeObjectValue<T extends object, K extends keyof T>(
  loader: () => T,
  key: K,
): T[K] {
  return createLazyFacadeValue(loader, key);
}

export function createLazyFacadeArrayValue<T extends object, K extends keyof T>(
  loader: () => T,
  key: K,
): T[K] {
  return createLazyFacadeValue(loader, key);
}

export function loadBundledPluginPublicSurfaceModuleSync<T extends object>(
  _params: { dirName: string; artifactBasename: string; env?: NodeJS.ProcessEnv },
): T {
  return {} as T;
}

export function canLoadActivatedBundledPluginPublicSurface(_params: {
  dirName: string;
  artifactBasename: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  return false;
}

export function loadActivatedBundledPluginPublicSurfaceModuleSync<T extends object>(params: {
  dirName: string;
  artifactBasename: string;
  env?: NodeJS.ProcessEnv;
}): T {
  return loadBundledPluginPublicSurfaceModuleSync<T>(params);
}

export function tryLoadActivatedBundledPluginPublicSurfaceModuleSync<T extends object>(params: {
  dirName: string;
  artifactBasename: string;
  env?: NodeJS.ProcessEnv;
}): T | null {
  if (!canLoadActivatedBundledPluginPublicSurface(params)) {
    return null;
  }
  return loadBundledPluginPublicSurfaceModuleSync<T>(params);
}

export function listImportedBundledPluginFacadeIds(): string[] {
  return [];
}

export function resetFacadeRuntimeStateForTest(): void {}

export const testing = {
  setFacadeActivationCheckRuntimeForTest: () => {},
  loadModuleAtLocationSync: () => ({}),
  resolveRegistryPluginModuleLocationFromRegistry: () => null,
  resolveFacadeModuleLocation: () => null,
  evaluateBundledPluginPublicSurfaceAccess: () => ({ allowed: false }),
  throwForBundledPluginPublicSurfaceAccess: () => {
    throw new Error("not implemented");
  },
  resolveActivatedBundledPluginPublicSurfaceAccessOrThrow: () => ({ allowed: false }),
  resolveBundledPluginPublicSurfaceAccess: () => ({ allowed: false }),
  resolveTrackedFacadePluginId: () => "",
};
export { testing as __testing };
