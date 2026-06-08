/**
 * 持久化 Store 工厂函数
 *
 * @deprecated 此工厂基于 localStorage 实现，已不适用于 SQLite 持久化架构。
 * 各 Store 已直接改为 API + 内存缓存模式，不再使用此工厂。
 * 保留此文件仅为向后兼容，新 Store 不应使用此工厂。
 */

/** Store 实例接口 */
export interface PersistedStore<T> {
  /** 获取当前数据快照 */
  getData(): T;
  /** 设置数据并通知监听者 + 持久化 */
  setData(data: T): void;
  /** 更新数据（函数式）并通知监听者 + 持久化 */
  updateData(updater: (prev: T) => T): void;
  /** 订阅数据变更，返回取消订阅函数 */
  subscribe(listener: (data: T) => void): () => void;
}

/**
 * @deprecated 使用 API + 内存缓存模式代替
 *
 * 创建一个持久化 Store
 * @param storageKey localStorage 键名
 * @param defaultValue 默认值（首次创建时使用）
 * @param options 可选配置
 */
export function createPersistedStore<T>(
  storageKey: string,
  defaultValue: T,
  options?: {
    /** 自定义序列化（默认 JSON.stringify） */
    serialize?: (data: T) => string;
    /** 自定义反序列化（默认 JSON.parse） */
    deserialize?: (raw: string) => T;
  }
): PersistedStore<T> {
  const serialize = options?.serialize ?? ((data: T) => JSON.stringify(data));
  const deserialize = options?.deserialize ?? ((raw: string) => JSON.parse(raw) as T);

  // ====== 从 localStorage 加载 ======
  let data: T;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      data = deserialize(raw);
    } else {
      data = defaultValue;
    }
  } catch {
    data = defaultValue;
  }

  // ====== 监听器管理 ======
  type Listener = (data: T) => void;
  const listeners = new Set<Listener>();

  function notifyAll(): void {
    listeners.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[${storageKey}] listener error:`, e);
      }
    });
  }

  // ====== 持久化 ======
  function persist(): void {
    try {
      localStorage.setItem(storageKey, serialize(data));
    } catch (e) {
      console.error(`[${storageKey}] 保存失败:`, e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        window.dispatchEvent(new CustomEvent('cdf-know-clow-storage-warning', {
          detail: { key: storageKey },
        }));
      }
    }
  }

  // ====== 返回 Store 接口 ======
  return {
    getData(): T {
      return data;
    },
    setData(newData: T): void {
      data = newData;
      persist();
      notifyAll();
    },
    updateData(updater: (prev: T) => T): void {
      data = updater(data);
      persist();
      notifyAll();
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
