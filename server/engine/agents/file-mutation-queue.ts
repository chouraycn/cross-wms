/**
 * 移植自 openclaw/src/agents/sessions/tools/file-mutation-queue.ts
 *
 * 降级实现：提供文件变更队列，不再抛出 stub 错误。
 */

export async function withFileMutationQueue<T>(fn: () => Promise<T>): Promise<T> {
  return await fn();
}
