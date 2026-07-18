/**
 * 按 key 串行异步队列 — 在保持无关键并发的同时按 key 序列化异步任务
 *
 * 实现：每个 key 维护一个 Promise tail，新任务附加到 tail 末尾；
 * 不同 key 之间可并行执行。
 *
 * 参考 openclaw/src/plugin-sdk/keyed-async-queue.ts
 */

/** 任务入队/出队触发的可选生命周期钩子。 */
export type KeyedAsyncQueueHooks = {
  onEnqueue?: () => void;
  onSettle?: () => void;
};

/**
 * 按 key 串行化异步任务，无关键之间可并发。
 *
 * 调用方需提供自己的 tails Map（便于跨多个调用点共享同一队列）。
 */
export function enqueueKeyedTask<T>(params: {
  tails: Map<string, Promise<void>>;
  key: string;
  task: () => Promise<T>;
  hooks?: KeyedAsyncQueueHooks;
}): Promise<T> {
  params.hooks?.onEnqueue?.();
  const previous = params.tails.get(params.key) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(params.task)
    .finally(() => {
      params.hooks?.onSettle?.();
    });
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  params.tails.set(params.key, tail);
  const cleanup = () => {
    if (params.tails.get(params.key) === tail) {
      params.tails.delete(params.key);
    }
  };
  tail.then(cleanup, cleanup);
  return current;
}

/**
 * 轻量级 per-key 异步队列封装，便于插件运行时串行化任务。
 *
 * 内部维护一个 Map<string, Promise<void>>，键在 settle 后会被清理。
 */
export class KeyedAsyncQueue {
  private readonly tails = new Map<string, Promise<void>>();

  /** 仅供测试访问内部 tail map。 */
  getTailMapForTesting(): Map<string, Promise<void>> {
    return this.tails;
  }

  enqueue<T>(key: string, task: () => Promise<T>, hooks?: KeyedAsyncQueueHooks): Promise<T> {
    return enqueueKeyedTask({
      tails: this.tails,
      key,
      task,
      ...(hooks ? { hooks } : {}),
    });
  }
}
