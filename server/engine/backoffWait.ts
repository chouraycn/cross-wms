/**
 * [二] BackoffCoordinator 退避等待工具
 *
 * 按协调器建议的时长停顿，支持 AbortSignal 取消（取消时立即 resolve，
 * 不再等到定时器，避免对已失败模型/Key 做瞬时重放放大故障面）。
 * ms<=0 或 signal 已取消时立即 resolve，绝不挂起。
 */
export function waitForBackoff(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
