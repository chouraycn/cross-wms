/**
 * sleep/延迟工具
 *
 * 提供可被 AbortSignal 中断的延迟等待。
 *
 * 参考自 openclaw/src/agents/utils/sleep.ts。
 */

/**
 * 延迟指定毫秒后返回。非正数或非有限值立即返回。
 * @param ms 等待毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!Number.isFinite(ms) || ms <= 0) {
      resolve();
      return;
    }
    setTimeout(resolve, ms);
  });
}

/**
 * 延迟指定毫秒后返回，支持通过 AbortSignal 提前中断。
 * - 信号已中止时立即抛出 Error("Aborted")
 * - 等待期间信号中止时抛出 Error("Aborted") 并清除定时器
 * @param ms 等待毫秒数
 * @param signal 可选的中止信号
 */
export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    if (!Number.isFinite(ms) || ms <= 0) {
      resolve();
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
