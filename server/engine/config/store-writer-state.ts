// 移植自 openclaw/src/config/store-writer-state.ts

export type SessionStoreWriterQueue = unknown;
export function clearSessionStoreCacheForTest(...args: any[]): any {
  return undefined;
}
export function drainSessionStoreWriterQueuesForTest(...args: any[]): any {
  return undefined;
}
export function getSessionStoreWriterQueueSizeForTest(...args: any[]): any {
  return undefined;
}
export const WRITER_QUEUES: any = undefined as any;
