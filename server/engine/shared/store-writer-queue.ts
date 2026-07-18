// 按 store 路径的 FIFO 队列，串行化同一进程内的文件写入
/** 待处理的独占 store 写入及其调用方的 promise 钩子 */
export type StoreWriterTask = {
  /** 同一 store 路径上较早任务完成后再运行的写操作 */
  fn: () => Promise<unknown>;
  /** 用写入结果 resolve 调用方的 promise */
  resolve: (value: unknown) => void;
  /** 用写入失败或测试清理错误 reject 调用方的 promise */
  reject: (reason: unknown) => void;
};

/** 按 store 路径的 FIFO 队列 */
export type StoreWriterQueue = {
  /** true 表示一个 drain 循环拥有此队列 */
  running: boolean;
  /** 等待当前 drain 完成的写入 */
  pending: StoreWriterTask[];
  /** 活跃 drain promise，在当前批次结算前被等待者复用 */
  drainPromise: Promise<void> | null;
};

/** 按规范化 store 路径键的 writer 队列 */
type StoreWriterQueues = Map<string, StoreWriterQueue>;

function getOrCreateStoreWriterQueue(
  queues: StoreWriterQueues,
  storePath: string,
): StoreWriterQueue {
  const existing = queues.get(storePath);
  if (existing) {
    return existing;
  }
  const created: StoreWriterQueue = { running: false, pending: [], drainPromise: null };
  queues.set(storePath, created);
  return created;
}

async function drainStoreWriterQueue(queues: StoreWriterQueues, storePath: string): Promise<void> {
  const queue = queues.get(storePath);
  if (!queue) {
    return;
  }
  if (queue.drainPromise) {
    await queue.drainPromise;
    return;
  }
  queue.running = true;
  queue.drainPromise = (async () => {
    try {
      while (queue.pending.length > 0) {
        const task = queue.pending.shift();
        if (!task) {
          continue;
        }
        let result: unknown;
        let failed: unknown;
        let hasFailure = false;
        try {
          result = await task.fn();
        } catch (err) {
          hasFailure = true;
          failed = err;
        }
        if (hasFailure) {
          task.reject(failed);
          continue;
        }
        task.resolve(result);
      }
    } finally {
      queue.running = false;
      queue.drainPromise = null;
      if (queue.pending.length === 0) {
        queues.delete(storePath);
      } else {
        // drain 完成后晚到的入队在新的 microtask 中运行，使当前 drainPromise 可以先结算
        queueMicrotask(() => {
          void drainStoreWriterQueue(queues, storePath);
        });
      }
    }
  })();
  await queue.drainPromise;
}

/** 在同一 store 路径上较早写入完成后再运行一次写入 */
export async function runQueuedStoreWrite<T>(params: {
  queues: StoreWriterQueues;
  storePath: string;
  label: string;
  fn: () => Promise<T>;
}): Promise<T> {
  if (!params.storePath || typeof params.storePath !== "string") {
    throw new Error(
      `${params.label}: storePath must be a non-empty string, got ${JSON.stringify(
        params.storePath,
      )}`,
    );
  }
  const queue = getOrCreateStoreWriterQueue(params.queues, params.storePath);
  return await new Promise<T>((resolve, reject) => {
    const task: StoreWriterTask = {
      fn: async () => await params.fn(),
      resolve: (value) => resolve(value as T),
      reject,
    };
    queue.pending.push(task);
    void drainStoreWriterQueue(params.queues, params.storePath);
  });
}

/** 拒绝所有待处理排队写入并清空队列状态（用于测试清理） */
export function clearStoreWriterQueuesForTest(queues: StoreWriterQueues, message: string): void {
  for (const queue of queues.values()) {
    for (const task of queue.pending) {
      task.reject(new Error(message));
    }
  }
  queues.clear();
}

/** 等待活跃 drain 完成同时拒绝仍然待处理的测试写入 */
export async function drainStoreWriterQueuesForTest(
  queues: StoreWriterQueues,
  message: string,
): Promise<void> {
  while (queues.size > 0) {
    const activeQueues = [...queues.values()];
    for (const queue of activeQueues) {
      for (const task of queue.pending) {
        task.reject(new Error(message));
      }
      queue.pending.length = 0;
    }
    const activeDrains = activeQueues.flatMap((queue) =>
      queue.drainPromise ? [queue.drainPromise] : [],
    );
    if (activeDrains.length === 0) {
      queues.clear();
      return;
    }
    await Promise.allSettled(activeDrains);
  }
}
