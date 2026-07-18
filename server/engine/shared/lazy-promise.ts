// 惰性 Promise 缓存，用于动态导入与运行时资源去重加载
/** 惰性加载器接口 */
export type LazyPromiseLoader<T> = {
  /** 解析缓存值，需要时创建一个加载 promise */
  load(): Promise<T>;
  /** 丢弃缓存的 promise，下次 load 时重新开始 */
  clear(): void;
};

/** 控制惰性 promise 缓存行为的选项 */
type LazyPromiseLoaderOptions = {
  /** 保留 rejected promise 而不是允许下一个调用方重试 */
  cacheRejections?: boolean;
};

/**
 * 创建一个小的 promise 缓存，去重并发 load 并可手动清空。
 * 默认拒绝会被驱逐，便于瞬时动态导入/运行时失败可以恢复。
 */
export function createLazyPromiseLoader<T>(
  load: () => T | Promise<T>,
  options: LazyPromiseLoaderOptions = {},
): LazyPromiseLoader<T> {
  let promise: Promise<T> | undefined;

  const createPromise = (): Promise<T> => {
    const loaded = Promise.resolve().then(load);
    if (options.cacheRejections !== true) {
      void loaded.catch(() => {
        // 失败的惰性加载通常是瞬时导入/运行时问题；驱逐该 rejected promise 以便下次调用可重试
        if (promise === loaded) {
          promise = undefined;
        }
      });
    }
    return loaded;
  };

  return {
    async load(): Promise<T> {
      promise ??= createPromise();
      return await promise;
    },
    clear(): void {
      promise = undefined;
    },
  };
}

/** 动态导入形态加载器的便捷包装 */
export function createLazyImportLoader<T>(
  load: () => Promise<T>,
  options?: LazyPromiseLoaderOptions,
): LazyPromiseLoader<T> {
  return createLazyPromiseLoader(load, options);
}
