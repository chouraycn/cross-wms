// 惰性运行时辅助：通过稳定加载器暴露动态导入
export function createLazyRuntimeSurface<TModule, TSurface>(
  importer: () => Promise<TModule>,
  select: (module: TModule) => TSurface,
): () => Promise<TSurface> {
  let cached: Promise<TSurface> | null = null;
  return () => {
    cached ??= importer().then(select);
    return cached;
  };
}

/** 把原始动态导入模块缓存到稳定加载器后面 */
export function createLazyRuntimeModule<TModule>(
  importer: () => Promise<TModule>,
): () => Promise<TModule> {
  return createLazyRuntimeSurface(importer, (module) => module);
}

/** 缓存单个具名运行时导出，避免每个调用方重复自定义选择闭包 */
export function createLazyRuntimeNamedExport<TModule, const TKey extends keyof TModule>(
  importer: () => Promise<TModule>,
  key: TKey,
): () => Promise<TModule[TKey]> {
  return createLazyRuntimeSurface(importer, (module) => module[key]);
}

export function createLazyRuntimeMethod<TSurface, TArgs extends unknown[], TResult>(
  load: () => Promise<TSurface>,
  select: (surface: TSurface) => (...args: TArgs) => TResult,
): (...args: TArgs) => Promise<Awaited<TResult>> {
  const invoke = async (...args: TArgs): Promise<Awaited<TResult>> => {
    const method = select(await load());
    return await method(...args);
  };
  return invoke;
}

export function createLazyRuntimeMethodBinder<TSurface>(load: () => Promise<TSurface>) {
  return function <TArgs extends unknown[], TResult>(
    select: (surface: TSurface) => (...args: TArgs) => TResult,
  ): (...args: TArgs) => Promise<Awaited<TResult>> {
    return createLazyRuntimeMethod(load, select);
  };
}
