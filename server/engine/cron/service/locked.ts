/**
 * Cron Locked - 操作锁定机制
 *
 * 进程内 cron 操作序列化工具，按存储路径隔离锁。
 * 同时保留状态本地的操作顺序，确保存储写入和定时器保持有序。
 */

import type { CronServiceState } from "./ops.js";

/** 按存储路径缓存的锁 Promise 映射 */
const storeLocks = new Map<string, Promise<void>>();

/**
 * 将 Promise 链解析为 void，无论成功或失败
 * 用于保持锁链的连续性，即使前一个操作失败
 */
const resolveChain = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    () => undefined,
  );

/**
 * 序列化 cron 操作
 *
 * 同时维护两层序列化：
 * 1. 按 storePath 的进程全局锁（防止同一存储文件的并发写入）
 * 2. 状态本地的 op 链（保持单个服务实例的操作顺序）
 *
 * @param state cron 服务状态
 * @param fn 要执行的异步操作
 * @returns 操作结果
 */
export async function locked<T>(state: CronServiceState, fn: () => Promise<T>): Promise<T> {
  const storePath = state.store.getStorePath();
  const storeOp = storeLocks.get(storePath) ?? Promise.resolve();
  const next = Promise.all([resolveChain(state.op), resolveChain(storeOp)]).then(fn);

  // 存储锁是进程本地的；失败后保持链存活，
  // 这样该存储的下一个操作仍会等待失败的操作完成。
  const keepAlive = resolveChain(next);
  state.op = keepAlive;
  storeLocks.set(storePath, keepAlive);

  return (await next) as T;
}
