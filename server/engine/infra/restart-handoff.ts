// 移植自 openclaw/src/infra/restart-handoff.ts（降级实现）
// 重启交接信息。
import type { RestartAttempt } from "./restart.types.js";

export type RestartHandoff = {
  reason?: string;
  sessionKey?: string;
  timestampMs: number;
  attempt?: RestartAttempt;
};

export type RestartHandoffState = {
  pending: boolean;
  handoff?: RestartHandoff;
};

/**
 * 序列化重启交接信息。
 */
export function serializeRestartHandoff(handoff: RestartHandoff): string {
  return JSON.stringify(handoff);
}

/** 反序列化重启交接信息 */
export function deserializeRestartHandoff(raw: string): RestartHandoff | null {
  try {
    const parsed = JSON.parse(raw) as RestartHandoff;
    if (typeof parsed.timestampMs !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 创建重启交接状态 */
export function createRestartHandoffState(): RestartHandoffState {
  return { pending: false };
}

/** 标记重启交接为 pending */
export function markRestartHandoffPending(state: RestartHandoffState, handoff: RestartHandoff): void {
  state.pending = true;
  state.handoff = handoff;
}

/** 清除重启交接状态 */
export function clearRestartHandoff(state: RestartHandoffState): void {
  state.pending = false;
  state.handoff = undefined;
}

export type { RestartAttempt };
