/**
 * Subagent Announce Timeout — 公告超时
 *
 * 管理公告的超时策略。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent } from './subagent-registry.state.js';

export interface AnnounceTimeoutOptions {
  timeoutMs?: number;
  maxWaitMs?: number;
  onTimeout?: (instanceId: string, announcementId: string) => void;
}

export interface AnnounceTimeout {
  announcementId: string;
  instanceId: string;
  startedAt: number;
  timeoutMs: number;
  maxWaitMs: number;
  resolved: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const timeouts = new Map<string, AnnounceTimeout>();
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_WAIT_MS = 60000;

export function scheduleAnnounceTimeout(
  instanceId: string,
  announcementId: string,
  options: AnnounceTimeoutOptions = {},
): void {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    logger.warn(`[SubagentAnnounceTimeout] Instance not found: ${instanceId}`);
    return;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

  const timeout: AnnounceTimeout = {
    announcementId,
    instanceId,
    startedAt: Date.now(),
    timeoutMs,
    maxWaitMs,
    resolved: false,
  };

  timeout.timer = setTimeout(() => {
    if (!timeout.resolved) {
      logger.warn(`[SubagentAnnounceTimeout] Announcement ${announcementId} timed out`);
      options.onTimeout?.(instanceId, announcementId);
    }
    timeouts.delete(announcementId);
  }, timeoutMs);

  timeouts.set(announcementId, timeout);

  logger.debug(`[SubagentAnnounceTimeout] Scheduled timeout for ${announcementId} (${timeoutMs}ms)`);
}

export function resolveAnnounceTimeout(announcementId: string): boolean {
  const timeout = timeouts.get(announcementId);
  if (!timeout) return false;

  timeout.resolved = true;
  if (timeout.timer) {
    clearTimeout(timeout.timer);
  }
  timeouts.delete(announcementId);

  logger.debug(`[SubagentAnnounceTimeout] Resolved timeout for ${announcementId}`);

  return true;
}

export function cancelAnnounceTimeout(announcementId: string): boolean {
  const timeout = timeouts.get(announcementId);
  if (!timeout) return false;

  if (timeout.timer) {
    clearTimeout(timeout.timer);
  }
  timeouts.delete(announcementId);

  logger.debug(`[SubagentAnnounceTimeout] Cancelled timeout for ${announcementId}`);

  return true;
}

export function getAnnounceTimeout(announcementId: string): AnnounceTimeout | undefined {
  return timeouts.get(announcementId);
}

export function getRemainingTime(announcementId: string): number | null {
  const timeout = timeouts.get(announcementId);
  if (!timeout) return null;

  const elapsed = Date.now() - timeout.startedAt;
  return Math.max(0, timeout.timeoutMs - elapsed);
}

export function isAnnounceTimedOut(announcementId: string): boolean {
  const timeout = timeouts.get(announcementId);
  if (!timeout) return false;

  const elapsed = Date.now() - timeout.startedAt;
  return elapsed >= timeout.timeoutMs;
}

export function getTimeoutStats(): {
  active: number;
  resolved: number;
  timedOut: number;
  cancelled: number;
} {
  return {
    active: timeouts.size,
    resolved: 0,
    timedOut: 0,
    cancelled: 0,
  };
}

export function clearAllTimeouts(): void {
  for (const [announcementId, timeout] of timeouts) {
    if (timeout.timer) {
      clearTimeout(timeout.timer);
    }
  }
  timeouts.clear();
  logger.debug('[SubagentAnnounceTimeout] Cleared all timeouts');
}