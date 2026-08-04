/**
 * Gateway 自身 RPC 方法 — 身份与重启协调
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/system.ts (gateway.identity.get)
 * - 参考 openclaw/src/gateway/server-methods/restart.ts (gateway.restart.*)
 * - 精简版：内存态设备身份与重启预检/请求
 */

import { randomUUID } from 'node:crypto';
import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getWebSocketHub } from './webSocketHub.js';
import { logger } from '../logger.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 模块加载时生成稳定的设备身份（进程级，不持久化）
const DEVICE_ID = `dev_${randomUUID()}`;
const PUBLIC_KEY = `pk_${randomUUID().replace(/-/g, '')}`;

// 重启预检与请求状态
interface RestartPreflight {
  canRestart: boolean;
  activeConnections: number;
  pendingTasks: number;
  reason?: string;
}

interface RestartRequestState {
  requested: boolean;
  reason?: string;
  requestedAt?: number;
  skipDeferral: boolean;
}

const restartState: RestartRequestState = {
  requested: false,
  skipDeferral: false,
};

// 活动连接计数（由 webSocketHub 维护，此处提供默认值）
function estimateActiveConnections(): number {
  try {
    // 动态读取 webSocketHub 的连接数（若可用）
    return getWebSocketHub().getClientCount();
  } catch {
    return 0;
  }
}

// ========== Gateway Identity Get ==========

async function gatewayIdentityGet(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    ok: true,
    deviceId: DEVICE_ID,
    publicKey: PUBLIC_KEY,
    ts: Date.now(),
  };
}

// ========== Gateway Restart Preflight ==========

async function gatewayRestartPreflight(_params: unknown, _ctx: GatewayMethodContext): Promise<RestartPreflight & { ok: true }> {
  const activeConnections = estimateActiveConnections();
  // 简化：没有 workboard 模块的直接依赖，使用 0 作为默认值
  let pendingTasks = 0;
  try {
    const registry = getMethodRegistry();
    const statsResult = await registry.invoke('workboard.stats', {}, {
      requestId: `restart_preflight_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (statsResult.ok && statsResult.result && typeof statsResult.result === 'object') {
      const stats = statsResult.result as { pending?: number; queued?: number };
      pendingTasks = (typeof stats.pending === 'number' ? stats.pending : 0)
        + (typeof stats.queued === 'number' ? stats.queued : 0);
    }
  } catch {
    // ignore — 降级为 0
  }

  const canRestart = activeConnections === 0 && pendingTasks === 0 && !restartState.requested;
  const reason = restartState.requested
    ? 'restart already requested'
    : activeConnections > 0
      ? `${activeConnections} active connection(s)`
      : pendingTasks > 0
        ? `${pendingTasks} pending task(s)`
        : undefined;

  return {
    ok: true,
    canRestart,
    activeConnections,
    pendingTasks,
    reason,
  };
}

// ========== Gateway Restart Request ==========

async function gatewayRestartRequest(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { reason?: string; skipDeferral?: boolean };

  if (restartState.requested) {
    return {
      ok: false,
      error: {
        code: 'RESTART_ALREADY_REQUESTED',
        message: 'restart already requested',
      },
    };
  }

  const reason = typeof p.reason === 'string' && p.reason.trim()
    ? p.reason.trim().slice(0, 200)
    : 'gateway.restart.request';
  const skipDeferral = p.skipDeferral === true;

  restartState.requested = true;
  restartState.reason = reason;
  restartState.requestedAt = Date.now();
  restartState.skipDeferral = skipDeferral;

  logger.info(`[gateway] restart requested: reason=${reason} skipDeferral=${skipDeferral}`);

  // 广播关闭事件，通知客户端
  try {
    getWebSocketHub().broadcastEvent('shutdown', {
      reason,
      graceful: true,
    });
  } catch {
    // ignore broadcast errors
  }

  return {
    ok: true,
    requested: true,
    reason,
    skipDeferral,
    requestedAt: restartState.requestedAt,
    // 精简版不实际触发进程退出；返回 willRestart=true 表示意图
    willRestart: false,
  };
}

/**
 * 重置重启状态（仅供测试或外部协调器调用）
 */
export function _resetRestartState(): void {
  restartState.requested = false;
  restartState.reason = undefined;
  restartState.requestedAt = undefined;
  restartState.skipDeferral = false;
}

/**
 * 注册所有 Gateway 自身方法
 */
export function registerGatewayMethods(registry: GatewayMethodRegistry): void {
  registry.register('gateway.identity.get', gatewayIdentityGet);
  registry.register('gateway.restart.preflight', gatewayRestartPreflight);
  registry.register('gateway.restart.request', gatewayRestartRequest);
}
