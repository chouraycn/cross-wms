// 心跳运行时：心跳事件与可见性辅助，不含广泛的 infra-runtime barrel。
// openclaw 原始实现为 barrel 重导出，依赖 ../infra/heartbeat-events.js、
// ../infra/heartbeat-visibility.js、../infra/heartbeat-wake.js。
// 此处提供最小可用类型与桩函数，待依赖子系统移植后接入。

/** 心跳事件种类。 */
export type HeartbeatEventKind =
  | "pulse"
  | "alive"
  | "dead"
  | "wake"
  | "sleep";

/** 心跳事件。 */
export type HeartbeatEvent = {
  kind: HeartbeatEventKind;
  /** 心跳来源标识。 */
  source: string;
  /** 事件时间戳。 */
  timestamp: number;
  /** 附带数据。 */
  data?: Record<string, unknown>;
};

/** 心跳可见性模式。 */
export type HeartbeatVisibilityMode = "visible" | "hidden" | "auto";

/** 心跳可见性策略。 */
export type HeartbeatVisibilityPolicy = {
  mode: HeartbeatVisibilityMode;
  /** 允许的事件种类。 */
  allowedKinds?: HeartbeatEventKind[];
  /** 屏蔽的事件种类。 */
  blockedKinds?: HeartbeatEventKind[];
};

/** 心跳监听器。 */
export type HeartbeatListener = (event: HeartbeatEvent) => void;

/** 心跳配置。 */
export type HeartbeatConfig = {
  /** 心跳间隔（毫秒）。 */
  intervalMs?: number;
  /** 超时阈值（毫秒）。 */
  timeoutMs?: number;
  /** 可见性策略。 */
  visibility?: HeartbeatVisibilityPolicy;
};

/** 心跳运行时。 */
export type HeartbeatRuntime = {
  start(): void;
  stop(): void;
  isAlive(): boolean;
  getLastPulse(): number | undefined;
  addListener(listener: HeartbeatListener): () => void;
};

/** 创建心跳运行时。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createHeartbeatRuntime(_config?: HeartbeatConfig): HeartbeatRuntime {
  const listeners = new Set<HeartbeatListener>();
  let alive = false;
  let lastPulse: number | undefined;
  return {
    start() {
      alive = true;
      lastPulse = Date.now();
    },
    stop() {
      alive = false;
    },
    isAlive() {
      return alive;
    },
    getLastPulse() {
      return lastPulse;
    },
    addListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** 解析心跳可见性策略。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveHeartbeatVisibilityPolicy(
  _config?: unknown,
): HeartbeatVisibilityPolicy {
  return { mode: "auto" };
}

/** 判断心跳事件是否可见。 */
// TODO: 依赖模块未移植，暂用本地桩
export function isHeartbeatEventVisible(
  event: HeartbeatEvent,
  policy: HeartbeatVisibilityPolicy,
): boolean {
  if (policy.mode === "hidden") return false;
  if (policy.mode === "visible") return true;
  if (policy.blockedKinds?.includes(event.kind)) return false;
  if (policy.allowedKinds && !policy.allowedKinds.includes(event.kind)) return false;
  return true;
}

/** 发送心跳脉冲。 */
// TODO: 依赖模块未移植，暂用本地桩
export function emitHeartbeatPulse(
  _runtime: HeartbeatRuntime,
  _source: string,
  _data?: Record<string, unknown>,
): void {
  // 待 infra/heartbeat-events.js 移植后接入
}

/** 请求心跳唤醒。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function requestHeartbeat(_params: {
  source: string;
  reason?: string;
}): Promise<void> {
  // 待 infra/heartbeat-wake.js 移植后接入
}
