// 监听器通知与注册工具，隔离单个监听器异常以免影响其他监听器
/** 通知所有已注册监听器，单次抛错不会中断其他监听器 */
export function notifyListeners<T>(
  listeners: Iterable<(event: T) => void>,
  event: T,
  onError?: (error: unknown) => void,
): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      onError?.(error);
    }
  }
}

/** 将监听器加入 Set，返回幂等的取消订阅函数 */
export function registerListener<T>(
  listeners: Set<(event: T) => void>,
  listener: (event: T) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
