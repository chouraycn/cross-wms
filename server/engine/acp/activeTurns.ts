/**
 * Active Turns Registry
 * 活跃回合注册表 - 进程内追踪活跃的 ACP 回合
 */

import type { ActiveTurnState } from "./types.js";

const ACTIVE_TURNS_KEY = Symbol.for("crosswms.acp.activeTurns");

interface ActiveTurnsState {
  turnsBySession: Map<string, ActiveTurnState>;
}

function getActiveTurnsState(): ActiveTurnsState {
  const global = globalThis as typeof globalThis & Record<symbol, ActiveTurnsState | undefined>;
  if (!global[ACTIVE_TURNS_KEY]) {
    global[ACTIVE_TURNS_KEY] = {
      turnsBySession: new Map(),
    };
  }
  return global[ACTIVE_TURNS_KEY]!;
}

/**
 * 规范化会话键
 */
function normalizeActorKey(sessionKey: string): string {
  return sessionKey.toLowerCase().trim();
}

/**
 * 标记会话正在执行 ACP 回合
 */
export function markAcpTurnActive(sessionKey: string, state: ActiveTurnState): void {
  if (!sessionKey) {
    return;
  }
  getActiveTurnsState().turnsBySession.set(normalizeActorKey(sessionKey), state);
}

/**
 * 清除会话的活跃回合标记
 */
export function clearAcpTurnActive(sessionKey: string): ActiveTurnState | undefined {
  if (!sessionKey) {
    return undefined;
  }
  const state = getActiveTurnsState().turnsBySession.get(normalizeActorKey(sessionKey));
  getActiveTurnsState().turnsBySession.delete(normalizeActorKey(sessionKey));
  return state;
}

/**
 * 获取会话的活跃回合状态
 */
export function getAcpTurnActive(sessionKey: string): ActiveTurnState | undefined {
  if (!sessionKey) {
    return undefined;
  }
  return getActiveTurnsState().turnsBySession.get(normalizeActorKey(sessionKey));
}

/**
 * 检查进程当前是否拥有指定会话的活跃回合
 */
export function isAcpTurnActive(sessionKey: string): boolean {
  if (!sessionKey) {
    return false;
  }
  return getActiveTurnsState().turnsBySession.has(normalizeActorKey(sessionKey));
}

/**
 * 获取所有活跃回合的会话键
 */
export function getActiveTurnSessionKeys(): string[] {
  return Array.from(getActiveTurnsState().turnsBySession.keys());
}

/**
 * 获取活跃回合数量
 */
export function getActiveTurnCount(): number {
  return getActiveTurnsState().turnsBySession.size;
}

/**
 * 清除所有活跃回合状态（用于测试）
 */
export function resetActiveTurnsForTests(): void {
  getActiveTurnsState().turnsBySession.clear();
}
