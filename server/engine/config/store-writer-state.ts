// 移植自 openclaw/src/config/store-writer-state.ts

export type SessionStoreWriterQueue = unknown;
export function clearSessionStoreCacheForTest(...args: unknown[]): unknown {
  return undefined;
}
export function drainSessionStoreWriterQueuesForTest(...args: unknown[]): unknown {
  return undefined;
}
export function getSessionStoreWriterQueueSizeForTest(...args: unknown[]): unknown {
  return undefined;
}
export const WRITER_QUEUES: unknown = undefined;
