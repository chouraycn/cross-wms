// 移植自 openclaw/src/config/store-writer-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SessionStoreWriterQueue = unknown;
export function clearSessionStoreCacheForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: clearSessionStoreCacheForTest");
}
export function drainSessionStoreWriterQueuesForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: drainSessionStoreWriterQueuesForTest");
}
export function getSessionStoreWriterQueueSizeForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: getSessionStoreWriterQueueSizeForTest");
}
export const WRITER_QUEUES: unknown = undefined;
