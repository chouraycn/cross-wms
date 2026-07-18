/**
 * 会话生命周期事件
 *
 * 当会话创建或链接时向观察者广播生命周期事件
 */

import type { SessionLifecycleEvent } from './types.js';
import { logger } from '../../logger.js';

export type { SessionLifecycleEvent } from './types.js';

type SessionLifecycleListener = (event: SessionLifecycleEvent) => void;

const SESSION_LIFECYCLE_LISTENERS = new Set<SessionLifecycleListener>();

export function onSessionLifecycleEvent(listener: SessionLifecycleListener): () => void {
  SESSION_LIFECYCLE_LISTENERS.add(listener);
  logger.debug('[SessionLifecycle] 注册生命周期监听器');
  return () => {
    SESSION_LIFECYCLE_LISTENERS.delete(listener);
    logger.debug('[SessionLifecycle] 移除生命周期监听器');
  };
}

export function emitSessionLifecycleEvent(event: SessionLifecycleEvent): void {
  logger.debug(
    `[SessionLifecycle] 发射生命周期事件: ${event.reason}`,
    { sessionKey: event.sessionKey, parentSessionKey: event.parentSessionKey },
  );
  for (const listener of SESSION_LIFECYCLE_LISTENERS) {
    try {
      listener(event);
    } catch (err) {
      logger.warn('[SessionLifecycle] 监听器执行失败:', err);
    }
  }
}

export function getListenerCount(): number {
  return SESSION_LIFECYCLE_LISTENERS.size;
}

export function clearAllListeners(): void {
  SESSION_LIFECYCLE_LISTENERS.clear();
  logger.debug('[SessionLifecycle] 已清除所有生命周期监听器');
}
