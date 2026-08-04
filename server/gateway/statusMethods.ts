/**
 * Status Gateway Methods — 系统状态、心跳与唤醒 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/system.ts (last-heartbeat / set-heartbeats / wake)
 * - 参考 openclaw/src/gateway/server-methods/health.ts (status)
 * - 精简版：聚合 health.get + diagnostics.health + 心跳管理
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getWebSocketHub } from './webSocketHub.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

const serverStartedAt = Date.now();

// 心跳运行时状态（内存级）
interface HeartbeatRuntimeState {
  enabled: boolean;
  lastBeatAt?: number;
  lastSeq: number;
  totalBeats: number;
}

const heartbeatState: HeartbeatRuntimeState = {
  enabled: true,
  lastSeq: 0,
  totalBeats: 0,
};

/** 内部接口：心跳 runner 推送一次心跳事件时更新状态（避免与 heartbeat.ts 模块耦合） */
export function _recordHeartbeatBeat(): void {
  heartbeatState.lastBeatAt = Date.now();
  heartbeatState.lastSeq += 1;
  heartbeatState.totalBeats += 1;
}

// ========== Status ==========

/**
 * status — 综合系统状态快照
 * 聚合 health.get + diagnostics.health + 心跳状态 + 连接数
 */
async function status(_params: unknown, _ctx: GatewayMethodContext) {
  const registry = getMethodRegistry();
  const now = Date.now();

  // 并行获取 health 与 diagnostics.health
  const ctx: GatewayMethodContext = {
    requestId: `status_${now}`,
    timestamp: now,
  };

  const [healthResult, diagResult] = await Promise.all([
    registry.invoke('health.get', {}, ctx),
    registry.invoke('diagnostics.health', {}, ctx),
  ]);

  const health = healthResult.ok && healthResult.result && typeof healthResult.result === 'object'
    ? healthResult.result as Record<string, unknown>
    : {};
  const diagnostics = diagResult.ok && diagResult.result && typeof diagResult.result === 'object'
    ? diagResult.result as Record<string, unknown>
    : {};

  let clientCount = 0;
  try {
    clientCount = getWebSocketHub().getClientCount();
  } catch {
    // ignore
  }

  return {
    ok: true,
    ts: now,
    uptimeMs: now - serverStartedAt,
    status: (diagnostics.status as string) ?? (health.status as string) ?? 'healthy',
    version: (health.version as string) ?? '1.0.0',
    clients: clientCount,
    heartbeat: {
      enabled: heartbeatState.enabled,
      lastBeatAt: heartbeatState.lastBeatAt ?? null,
      lastSeq: heartbeatState.lastSeq,
      totalBeats: heartbeatState.totalBeats,
    },
    memory: diagnostics.memory ?? null,
    services: health.services ?? null,
  };
}

// ========== Last Heartbeat ==========

async function lastHeartbeat(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    ok: true,
    enabled: heartbeatState.enabled,
    lastBeatAt: heartbeatState.lastBeatAt ?? null,
    lastSeq: heartbeatState.lastSeq,
    totalBeats: heartbeatState.totalBeats,
    uptimeMs: Date.now() - serverStartedAt,
  };
}

// ========== Set Heartbeats ==========

async function setHeartbeats(params: unknown, _ctx: GatewayMethodContext) {
  const { enabled } = (params || {}) as { enabled?: boolean };

  if (typeof enabled !== 'boolean') {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'enabled (boolean) is required',
      },
    };
  }

  const previous = heartbeatState.enabled;
  heartbeatState.enabled = enabled;

  return {
    ok: true,
    enabled,
    previous,
    ts: Date.now(),
  };
}

// ========== Wake ==========

/**
 * wake — 唤醒网关（向所有连接的客户端广播 presence 事件）
 * 参考 openclaw nodes-wake-state.ts：唤醒即触发一次 presence 广播
 */
async function wake(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { reason?: string; clientId?: string };
  const reason = typeof p.reason === 'string' && p.reason.trim()
    ? p.reason.trim().slice(0, 200)
    : 'wake';

  let recipients = 0;
  try {
    recipients = getWebSocketHub().broadcastEvent('presence', {
      status: 'online',
      reason,
      ts: Date.now(),
    });
  } catch {
    // ignore broadcast errors
  }

  // 同时刷新心跳时间戳
  _recordHeartbeatBeat();

  return {
    ok: true,
    reason,
    recipients,
    ts: Date.now(),
  };
}

/**
 * 注册所有 Status 域方法
 */
export function registerStatusMethods(registry: GatewayMethodRegistry): void {
  registry.register('status', status);
  registry.register('last-heartbeat', lastHeartbeat);
  registry.register('set-heartbeats', setHeartbeats);
  registry.register('wake', wake);
}
