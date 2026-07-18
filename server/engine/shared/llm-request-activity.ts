// LLM 请求活动通知：以 AbortSignal 为键的 listener 注册与广播
const requestActivityListeners = new WeakMap<AbortSignal, Set<() => void>>();

/** 通知注册在该 signal 上的所有活动监听器 */
export function notifyLlmRequestActivity(signal: AbortSignal | undefined): void {
  if (!signal) {
    return;
  }
  for (const listener of requestActivityListeners.get(signal) ?? []) {
    listener();
  }
}

/** 注册一个 LLM 请求活动监听器，返回取消订阅函数 */
export function onLlmRequestActivity(signal: AbortSignal, listener: () => void): () => void {
  const listeners = requestActivityListeners.get(signal) ?? new Set<() => void>();
  listeners.add(listener);
  requestActivityListeners.set(signal, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      requestActivityListeners.delete(signal);
    }
  };
}
