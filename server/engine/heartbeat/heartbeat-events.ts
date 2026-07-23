/**
 * 心跳状态事件系统
 *
 * 为 UI 界面存储和广播心跳状态事件。
 */

export type HeartbeatIndicatorType = "ok" | "alert" | "error";

export type HeartbeatEventPayload = {
  ts: number;
  status: "sent" | "ok-empty" | "ok-token" | "skipped" | "failed";
  to?: string;
  accountId?: string;
  preview?: string;
  durationMs?: number;
  hasMedia?: boolean;
  reason?: string;
  channel?: string;
  silent?: boolean;
  indicatorType?: HeartbeatIndicatorType;
};

export function resolveIndicatorType(
  status: HeartbeatEventPayload["status"],
): HeartbeatIndicatorType | undefined {
  switch (status) {
    case "ok-empty":
    case "ok-token":
      return "ok";
    case "sent":
      return "alert";
    case "failed":
      return "error";
    case "skipped":
      return undefined;
  }
  throw new Error("不支持的心跳状态");
}

type HeartbeatEventState = {
  lastHeartbeat: HeartbeatEventPayload | null;
  listeners: Set<(evt: HeartbeatEventPayload) => void>;
};

const HEARTBEAT_EVENT_STATE_KEY = Symbol.for("cross-wms.heartbeatEvents.state");

const state = (() => {
  const globalScope = globalThis as Record<symbol, HeartbeatEventState>;
  if (!globalScope[HEARTBEAT_EVENT_STATE_KEY]) {
    globalScope[HEARTBEAT_EVENT_STATE_KEY] = {
      lastHeartbeat: null,
      listeners: new Set<(evt: HeartbeatEventPayload) => void>(),
    };
  }
  return globalScope[HEARTBEAT_EVENT_STATE_KEY];
})();

export function emitHeartbeatEvent(evt: Omit<HeartbeatEventPayload, "ts">) {
  const enriched: HeartbeatEventPayload = { ts: Date.now(), ...evt };
  state.lastHeartbeat = enriched;
  for (const listener of state.listeners) {
    try {
      listener(enriched);
    } catch {
      // 忽略监听器异常
    }
  }
}

export function onHeartbeatEvent(listener: (evt: HeartbeatEventPayload) => void): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function getLastHeartbeatEvent(): HeartbeatEventPayload | null {
  return state.lastHeartbeat;
}

export function resetHeartbeatEventsForTest(): void {
  state.lastHeartbeat = null;
  state.listeners.clear();
}