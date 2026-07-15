/**
 * 服务器通道 — 参考 OpenClaw gateway/server-channels.ts
 *
 * 启动、停止、重启和快照插件通道账户运行时。
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';

export type ChannelId = string;

export interface ChannelAccountSnapshot {
  accountId: string;
  channelId: ChannelId;
  connected: boolean;
  running: boolean;
  restartPending: boolean;
  reconnectAttempts: number;
  lastStartAt?: number;
  lastStopAt?: number;
  lastConnectedAt?: number;
  lastEventAt?: number;
  lastTransportActivityAt?: number;
  lastError?: string | null;
}

export interface ChannelRuntimeSnapshot {
  accountId: string;
  channelId: ChannelId;
  snapshot: ChannelAccountSnapshot;
}

export interface ChannelManager {
  startChannel(accountId: string, channelId: ChannelId): Promise<void>;
  stopChannel(accountId: string, channelId: ChannelId): Promise<void>;
  restartChannel(accountId: string, channelId: ChannelId): Promise<void>;
  snapshotChannel(accountId: string, channelId: ChannelId): ChannelAccountSnapshot | undefined;
  listChannels(): ChannelRuntimeSnapshot[];
  dispose(): void;
}

const CHANNEL_RESTART_POLICY = {
  initialMs: 5_000,
  maxMs: 5 * 60_000,
  factor: 2,
  jitter: 0.1,
};

const MAX_RESTART_ATTEMPTS = 10;
const CHANNEL_STOP_ABORT_TIMEOUT_MS = 5_000;

interface ChannelRuntimeEntry {
  accountId: string;
  channelId: ChannelId;
  abort?: AbortController;
  starting?: Promise<void>;
  snapshot: ChannelAccountSnapshot;
}

export function createChannelManager(): ChannelManager {
  const runtimes = new Map<string, ChannelRuntimeEntry>();

  function getKey(accountId: string, channelId: ChannelId): string {
    return `${accountId}:${channelId}`;
  }

  function computeBackoff(attempt: number): number {
    const ms = CHANNEL_RESTART_POLICY.initialMs * Math.pow(CHANNEL_RESTART_POLICY.factor, attempt);
    const jitter = ms * CHANNEL_RESTART_POLICY.jitter;
    return Math.min(ms + (Math.random() - 0.5) * jitter, CHANNEL_RESTART_POLICY.maxMs);
  }

  async function startChannel(accountId: string, channelId: ChannelId): Promise<void> {
    const key = getKey(accountId, channelId);
    let entry = runtimes.get(key);

    if (!entry) {
      entry = {
        accountId,
        channelId,
        snapshot: {
          accountId,
          channelId,
          connected: false,
          running: false,
          restartPending: false,
          reconnectAttempts: 0,
        },
      };
      runtimes.set(key, entry);
    }

    if (entry.starting) {
      await entry.starting;
      return;
    }

    const abort = new AbortController();
    entry.abort = abort;
    entry.snapshot.running = true;
    entry.snapshot.lastStartAt = Date.now();

    let attempt = 0;

    const startPromise = (async () => {
      while (attempt < MAX_RESTART_ATTEMPTS && !abort.signal.aborted) {
        try {
          logger.info(`[ChannelManager] 启动通道 ${channelId} (账户: ${accountId}, 尝试: ${attempt + 1})`);

          await publishEvent('channel:connected', {
            channelId,
            accountId,
            action: 'starting',
            attempt: attempt + 1,
          });

          entry!.snapshot.connected = true;
          entry!.snapshot.lastConnectedAt = Date.now();
          entry!.snapshot.lastEventAt = Date.now();
          entry!.snapshot.reconnectAttempts = 0;

          break;
        } catch (err) {
          attempt++;
          entry!.snapshot.connected = false;
          entry!.snapshot.reconnectAttempts = attempt;
          entry!.snapshot.lastError = err instanceof Error ? err.message : String(err);

          await publishEvent('system:error', {
            channelId,
            accountId,
            action: 'start_failed',
            attempt,
            error: entry!.snapshot.lastError,
          });

          if (attempt < MAX_RESTART_ATTEMPTS) {
            const backoffMs = computeBackoff(attempt);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
        }
      }
    })();

    entry.starting = startPromise;

    try {
      await startPromise;
    } finally {
      entry.starting = undefined;
    }
  }

  async function stopChannel(accountId: string, channelId: ChannelId): Promise<void> {
    const key = getKey(accountId, channelId);
    const entry = runtimes.get(key);

    if (!entry) return;

    logger.info(`[ChannelManager] 停止通道 ${channelId} (账户: ${accountId})`);

    entry.abort?.abort();

    await new Promise((resolve) => setTimeout(resolve, CHANNEL_STOP_ABORT_TIMEOUT_MS));

    entry.snapshot.running = false;
    entry.snapshot.connected = false;
    entry.snapshot.lastStopAt = Date.now();

    await publishEvent('channel:disconnected', {
      channelId,
      accountId,
      action: 'stopped',
    });
  }

  async function restartChannel(accountId: string, channelId: ChannelId): Promise<void> {
    logger.info(`[ChannelManager] 重启通道 ${channelId} (账户: ${accountId})`);

    await stopChannel(accountId, channelId);

    await new Promise((resolve) => setTimeout(resolve, 1_000));

    await startChannel(accountId, channelId);
  }

  function snapshotChannel(accountId: string, channelId: ChannelId): ChannelAccountSnapshot | undefined {
    const key = getKey(accountId, channelId);
    const entry = runtimes.get(key);
    return entry?.snapshot;
  }

  function listChannels(): ChannelRuntimeSnapshot[] {
    return Array.from(runtimes.values()).map((entry) => ({
      accountId: entry.accountId,
      channelId: entry.channelId,
      snapshot: entry.snapshot,
    }));
  }

  function dispose(): void {
    for (const entry of runtimes.values()) {
      entry.abort?.abort();
    }
    runtimes.clear();
  }

  return {
    startChannel,
    stopChannel,
    restartChannel,
    snapshotChannel,
    listChannels,
    dispose,
  };
}