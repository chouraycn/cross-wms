/**
 * Update Gateway Methods — 自更新流程 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/update.ts
 * - 精简版：update.status / update.run 两个核心方法
 * - 状态来自内存；update.run 返回标记但不实际触发进程退出
 * - 由外部 supervisor（systemd/launchd/schtasks）负责实际重启
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getWebSocketHub } from './webSocketHub.js';
import { GATEWAY_EVENT_TYPES } from './gatewayEventTypes.js';
import { logger } from '../logger.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 当前版本号（从 package.json 读取，回退到 '1.0.0'）
const CURRENT_VERSION = readCurrentVersion();

function readCurrentVersion(): string {
  try {
    // 避免运行时引入 JSON 解析依赖：通过 require 读取 package.json
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../../package.json') as { version?: string };
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

// 更新检查状态
interface UpdateStatusState {
  /** 是否有可用更新 */
  updateAvailable: boolean;
  /** 最新版本号 */
  latestVersion?: string;
  /** 当前版本号 */
  currentVersion: string;
  /** 更新通道 */
  channel: string;
  /** 上次检查时间 */
  lastCheckedAt?: number;
  /** 发行说明 */
  releaseNotes?: string;
  /** 下载地址 */
  downloadUrl?: string;
  /** 是否强制更新 */
  mandatory?: boolean;
}

const updateStatus: UpdateStatusState = {
  updateAvailable: false,
  currentVersion: CURRENT_VERSION,
  channel: 'stable',
};

// 更新运行状态
interface UpdateRunState {
  running: boolean;
  startedAt?: number;
  completedAt?: number;
  ok?: boolean;
  error?: string;
  fromVersion?: string;
  toVersion?: string;
}

const updateRunState: UpdateRunState = {
  running: false,
};

// ========== Update Status ==========

async function updateStatusHandler(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { refresh?: boolean };

  // refresh=true 时模拟一次版本检查（精简版无远端 registry，直接返回当前状态）
  if (p.refresh) {
    updateStatus.lastCheckedAt = Date.now();
    // 精简版不实际访问远端；保持 updateAvailable=false
  }

  return {
    ok: true,
    ts: Date.now(),
    ...updateStatus,
    ...(updateStatus.lastCheckedAt ? { lastCheckedAt: updateStatus.lastCheckedAt } : {}),
    run: {
      running: updateRunState.running,
      ...(updateRunState.startedAt ? { startedAt: updateRunState.startedAt } : {}),
      ...(updateRunState.completedAt ? { completedAt: updateRunState.completedAt } : {}),
      ...(updateRunState.ok !== undefined ? { ok: updateRunState.ok } : {}),
      ...(updateRunState.error ? { error: updateRunState.error } : {}),
    },
  };
}

// ========== Update Run ==========

async function updateRun(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    channel?: string;
    skipRestart?: boolean;
    reason?: string;
  };

  if (updateRunState.running) {
    return {
      ok: false,
      error: {
        code: 'UPDATE_ALREADY_RUNNING',
        message: 'an update is already in progress',
      },
    };
  }

  const channel = typeof p.channel === 'string' && p.channel.trim()
    ? p.channel.trim()
    : updateStatus.channel;
  const skipRestart = p.skipRestart === true;
  const reason = typeof p.reason === 'string' && p.reason.trim()
    ? p.reason.trim().slice(0, 200)
    : 'update.run';

  const now = Date.now();
  updateRunState.running = true;
  updateRunState.startedAt = now;
  updateRunState.completedAt = undefined;
  updateRunState.ok = undefined;
  updateRunState.error = undefined;
  updateRunState.fromVersion = CURRENT_VERSION;
  updateRunState.toVersion = updateStatus.latestVersion ?? CURRENT_VERSION;

  logger.info(`[gateway] update.run started: channel=${channel} skipRestart=${skipRestart} reason=${reason}`);

  // 精简版：不实际执行 npm/git 更新；模拟一次"已是最新"的运行结果
  // 生产环境应在此处调用 server/infra/update-runner.ts 的 runGatewayUpdate
  await new Promise((resolve) => setImmediate(resolve));

  const completedAt = Date.now();
  updateRunState.running = false;
  updateRunState.completedAt = completedAt;
  updateRunState.ok = true;

  // 重置可用更新状态
  updateStatus.updateAvailable = false;
  updateStatus.lastCheckedAt = completedAt;

  // 广播 update.available 事件（通知客户端 update 已清零）
  try {
    getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.UPDATE_AVAILABLE, {
      version: updateRunState.toVersion ?? CURRENT_VERSION,
      currentVersion: CURRENT_VERSION,
      mandatory: false,
      ts: completedAt,
    });
  } catch {
    // ignore broadcast errors
  }

  // 若需要重启且未跳过，转发到 gateway.restart.request
  let restartRequested = false;
  if (!skipRestart) {
    try {
      const registry = getMethodRegistry();
      const restartResult = await registry.invoke('gateway.restart.request', {
        reason: `update.run: ${reason}`,
      }, {
        requestId: `update_run_restart_${completedAt}`,
        timestamp: completedAt,
      });
      restartRequested = restartResult.ok;
    } catch {
      // ignore — 重启请求失败不阻塞 update.run 的成功响应
    }
  }

  return {
    ok: true,
    completedAt,
    fromVersion: updateRunState.fromVersion,
    toVersion: updateRunState.toVersion,
    channel,
    restartRequested,
    willRestart: restartRequested,
  };
}

/**
 * 内部接口：由外部版本检查器调用，设置可用更新状态
 */
export function _setUpdateAvailable(input: {
  latestVersion: string;
  releaseNotes?: string;
  downloadUrl?: string;
  mandatory?: boolean;
}): void {
  updateStatus.updateAvailable = input.latestVersion !== CURRENT_VERSION;
  updateStatus.latestVersion = input.latestVersion;
  updateStatus.releaseNotes = input.releaseNotes;
  updateStatus.downloadUrl = input.downloadUrl;
  updateStatus.mandatory = input.mandatory;
  updateStatus.lastCheckedAt = Date.now();

  // 广播 update.available 事件
  try {
    getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.UPDATE_AVAILABLE, {
      version: input.latestVersion,
      currentVersion: CURRENT_VERSION,
      releaseNotes: input.releaseNotes,
      downloadUrl: input.downloadUrl,
      mandatory: input.mandatory ?? false,
      ts: updateStatus.lastCheckedAt,
    });
  } catch {
    // ignore broadcast errors
  }
}

/**
 * 注册所有 Update 域方法
 */
export function registerUpdateMethods(registry: GatewayMethodRegistry): void {
  registry.register('update.status', updateStatusHandler);
  registry.register('update.run', updateRun);
}
