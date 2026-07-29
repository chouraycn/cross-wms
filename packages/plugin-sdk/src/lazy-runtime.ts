// 延迟运行时：延迟加载模块与方法绑定辅助。
// openclaw 原始实现为 barrel 重导出，依赖 ../shared/lazy-runtime.js。
// 此处提供最小可用类型与桩函数，待依赖子系统移植后接入。

/** 延迟加载的运行时模块。 */
export type LazyRuntimeModule<T = unknown> = {
  /** 获取模块（首次调用时加载）。 */
  get(): Promise<T>;
  /** 模块是否已加载。 */
  isLoaded(): boolean;
  /** 重置模块（下次 get 重新加载）。 */
  reset(): void;
};

/** 延迟加载的运行时方法。 */
export type LazyRuntimeMethod<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

/** 延迟加载的运行时方法绑定器。 */
export type LazyRuntimeMethodBinder = {
  bind<TArgs extends unknown[], TResult>(
    loader: () => Promise<(...args: TArgs) => TResult | Promise<TResult>>,
  ): LazyRuntimeMethod<TArgs, TResult>;
};

/** 延迟加载的命名导出。 */
export type LazyRuntimeNamedExport<T = unknown> = {
  /** 当前值（未加载时为 undefined）。 */
  value: T | undefined;
  /** 是否已加载。 */
  loaded: boolean;
  /** 加载值。 */
  load(): Promise<T>;
};

/** 延迟加载的运行时表面。 */
export type LazyRuntimeSurface = {
  /** 获取表面所有已注册的键。 */
  keys(): string[];
  /** 获取指定键的延迟模块。 */
  get<T = unknown>(key: string): LazyRuntimeModule<T> | undefined;
  /** 注册延迟模块。 */
  register<T>(key: string, loader: () => Promise<T>): LazyRuntimeModule<T>;
  /** 重置所有已注册模块。 */
  resetAll(): void;
};

/** 创建延迟加载的运行时模块。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createLazyRuntimeModule<T>(
  loader: () => Promise<T>,
): LazyRuntimeModule<T> {
  let cached: T | undefined;
  let loaded = false;
  let loadingPromise: Promise<T> | undefined;
  return {
    async get() {
      if (loaded) return cached as T;
      if (loadingPromise) return loadingPromise;
      loadingPromise = loader().then((value) => {
        cached = value;
        loaded = true;
        loadingPromise = undefined;
        return value;
      });
      return loadingPromise;
    },
    isLoaded() {
      return loaded;
    },
    reset() {
      cached = undefined;
      loaded = false;
      loadingPromise = undefined;
    },
  };
}

/** 创建延迟加载的运行时方法。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createLazyRuntimeMethod<TArgs extends unknown[], TResult>(
  loader: () => Promise<(...args: TArgs) => TResult | Promise<TResult>>,
): LazyRuntimeMethod<TArgs, TResult> {
  let cachedFn: ((...args: TArgs) => TResult | Promise<TResult>) | undefined;
  let loadingPromise:
    | Promise<(...args: TArgs) => TResult | Promise<TResult>>
    | undefined;
  return async (...args: TArgs) => {
    if (cachedFn) return cachedFn(...args);
    if (!loadingPromise) {
      loadingPromise = loader().then((fn) => {
        cachedFn = fn;
        loadingPromise = undefined;
        return fn;
      });
    }
    const fn = await loadingPromise;
    return fn(...args);
  };
}

/** 创建延迟加载的运行时方法绑定器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createLazyRuntimeMethodBinder(): LazyRuntimeMethodBinder {
  return {
    bind(loader) {
      return createLazyRuntimeMethod(loader);
    },
  };
}

/** 创建延迟加载的命名导出。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createLazyRuntimeNamedExport<T>(
  loader: () => Promise<T>,
): LazyRuntimeNamedExport<T> {
  let cached: T | undefined;
  let loaded = false;
  return {
    get value() {
      return cached;
    },
    get loaded() {
      return loaded;
    },
    async load() {
      if (!loaded) {
        cached = await loader();
        loaded = true;
      }
      return cached as T;
    },
  };
}

/** 创建延迟加载的运行时表面。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createLazyRuntimeSurface(): LazyRuntimeSurface {
  const modules = new Map<string, LazyRuntimeModule>();
  return {
    keys() {
      return [...modules.keys()];
    },
    get<T = unknown>(key: string): LazyRuntimeModule<T> | undefined {
      return modules.get(key) as LazyRuntimeModule<T> | undefined;
    },
    register(key, loader) {
      const module = createLazyRuntimeModule(loader);
      modules.set(key, module);
      return module;
    },
    resetAll() {
      for (const module of modules.values()) {
        module.reset();
      }
      modules.clear();
    },
  };
}
