// 移植自 openclaw/src/infra/heartbeat-events.ts
// 存储并广播心跳状态事件，供 UI 表面使用。
//
// 降级策略：
//  - 源文件依赖 ../shared/global-singleton.js 的 resolveGlobalSingleton 与
//    ../shared/listeners.js 的 notifyListeners/registerListener。
//  - cross-wms 已有 resolveGlobalSingleton（在 _openclaw-stubs.ts 中），
//    listeners 辅助函数此处内联实现。
import { resolveGlobalSingleton } from "../_openclaw-stubs.js";

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
  /** The channel this heartbeat was sent to. */
  channel?: string;
  /** Whether the message was silently suppressed (showOk: false). */
  silent?: boolean;
  /** Indicator type for UI status display. */
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
}

type HeartbeatEventState = {
  lastHeartbeat: HeartbeatEventPayload | null;
  listeners: Set<(evt: HeartbeatEventPayload) => void>;
};

const HEARTBEAT_EVENT_STATE_KEY = Symbol.for("openclaw.heartbeatEvents.state");

const state = resolveGlobalSingleton<HeartbeatEventState>(HEARTBEAT_EVENT_STATE_KEY, () => ({
  lastHeartbeat: null,
  listeners: new Set<(evt: HeartbeatEventPayload) => void>(),
}));

/** 通知所有监听器（内联实现，替代 openclaw 的 ../shared/listeners.js） */
function notifyListeners(
  listeners: Set<(evt: HeartbeatEventPayload) => void>,
  evt: HeartbeatEventPayload,
): void {
  for (const listener of listeners) {
    try {
      listener(evt);
    } catch {
      // 监听器错误不影响其他监听器
    }
  }
}

/** 注册监听器并返回取消注册函数（内联实现） */
function registerListener(
  listeners: Set<(evt: HeartbeatEventPayload) => void>,
  listener: (evt: HeartbeatEventPayload) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitHeartbeatEvent(evt: Omit<HeartbeatEventPayload, "ts">) {
  const enriched: HeartbeatEventPayload = { ts: Date.now(), ...evt };
  state.lastHeartbeat = enriched;
  notifyListeners(state.listeners, enriched);
}

export function onHeartbeatEvent(listener: (evt: HeartbeatEventPayload) => void): () => void {
  return registerListener(state.listeners, listener);
}

export function getLastHeartbeatEvent(): HeartbeatEventPayload | null {
  return state.lastHeartbeat;
}

export function resetHeartbeatEventsForTest(): void {
  state.lastHeartbeat = null;
  state.listeners.clear();
}
