// 移植自 openclaw/src/infra/system-events.ts（降级实现）
// 系统事件定义。
export type SystemEventKind =
  | "restart-requested"
  | "restart-completed"
  | "restart-failed"
  | "shutdown-requested"
  | "shutdown-completed"
  | "config-reloaded"
  | "health-check";

export type SystemEvent = {
  kind: SystemEventKind;
  timestampMs: number;
  reason?: string;
  detail?: Record<string, unknown>;
};

export type SystemEventListener = (event: SystemEvent) => void;

const listeners = new Set<SystemEventListener>();

/** 发出系统事件 */
export function emitSystemEvent(event: Omit<SystemEvent, "timestampMs">): void {
  const fullEvent: SystemEvent = {
    ...event,
    timestampMs: Date.now(),
  };
  for (const listener of listeners) {
    try {
      listener(fullEvent);
    } catch {
      // 忽略监听器错误
    }
  }
}

/** 注册系统事件监听器 */
export function onSystemEvent(listener: SystemEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 创建系统事件 */
export function createSystemEvent(kind: SystemEventKind, detail?: Record<string, unknown>): SystemEvent {
  return {
    kind,
    timestampMs: Date.now(),
    detail,
  };
}
