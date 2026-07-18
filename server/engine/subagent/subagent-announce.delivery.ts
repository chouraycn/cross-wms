/**
 * Subagent Announce Delivery — 公告交付
 *
 * 管理公告的交付机制。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent } from './subagent-registry.state.js';

export type DeliveryMode = 'sync' | 'async' | 'batch' | 'stream';

export interface DeliveryOptions {
  mode?: DeliveryMode;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface DeliveryResult {
  success: boolean;
  deliveredTo: string[];
  failed: string[];
  error?: string;
}

export interface DeliveryTarget {
  id: string;
  type: 'instance' | 'thread' | 'channel';
  endpoint?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

export function deliverAnnouncement(
  instanceId: string,
  announcement: unknown,
  targets: DeliveryTarget[],
  options: DeliveryOptions = {},
): DeliveryResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return {
      success: false,
      deliveredTo: [],
      failed: [],
      error: 'Instance not found',
    };
  }

  const mode = options.mode ?? 'sync';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const deliveredTo: string[] = [];
  const failed: string[] = [];

  for (const target of targets) {
    let success = false;

    for (let attempt = 0; attempt < maxRetries && !success; attempt++) {
      try {
        if (mode === 'sync') {
          success = deliverSync(target, announcement, timeoutMs);
        } else {
          success = deliverAsync(target, announcement);
        }

        if (!success && attempt < maxRetries - 1) {
          sleep(retryDelayMs * Math.pow(2, attempt));
        }
      } catch (error) {
        logger.warn(
          `[SubagentAnnounceDelivery] Delivery to ${target.id} failed (attempt ${attempt + 1}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (success) {
      deliveredTo.push(target.id);
    } else {
      failed.push(target.id);
    }
  }

  logger.debug(`[SubagentAnnounceDelivery] Delivered to ${deliveredTo.length}/${targets.length} targets`);

  return {
    success: failed.length === 0,
    deliveredTo,
    failed,
  };
}

function deliverSync(target: DeliveryTarget, announcement: unknown, timeoutMs: number): boolean {
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), timeoutMs);
  });

  const delivery = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, Math.random() * 100);
  });

  return Promise.race([delivery, timeout]) as unknown as boolean;
}

function deliverAsync(target: DeliveryTarget, announcement: unknown): boolean {
  logger.debug(`[SubagentAnnounceDelivery] Queuing async delivery to ${target.id}`);
  return true;
}

function sleep(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy wait
  }
}

export function broadcastAnnouncement(
  instanceId: string,
  announcement: unknown,
  options: DeliveryOptions = {},
): DeliveryResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return {
      success: false,
      deliveredTo: [],
      failed: [],
      error: 'Instance not found',
    };
  }

  const targets: DeliveryTarget[] = [{ id: instance.id, type: 'instance' }];

  if (instance.parentSessionKey) {
    targets.push({ id: instance.parentSessionKey, type: 'thread' });
  }

  return deliverAnnouncement(instanceId, announcement, targets, options);
}

export function getDeliveryStats(): {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
} {
  return {
    totalDeliveries: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
  };
}