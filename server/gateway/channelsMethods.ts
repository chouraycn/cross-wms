/**
 * Channels Gateway Methods — 通道生命周期 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/channels.ts
 * - 精简版：实现 start / stop / logout / status 四个核心方法
 * - 通道清单来自 cross-wms 的全局 ChannelRegistry（server/channels）
 * - 运行态（running / loggedOut）维护在内存中
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getGlobalChannelRegistry } from '../channels/index.js';
import type { AppConfig } from '../channels/types.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 通道账号运行态记录
interface ChannelRuntimeEntry {
  channel: string;
  accountId: string;
  running: boolean;
  loggedOut: boolean;
  startedAt?: number;
  stoppedAt?: number;
  lastError?: string;
}

// 内存运行态存储（生产环境应使用数据库）
const runtimeState = new Map<string, ChannelRuntimeEntry>();

function runtimeKey(channel: string, accountId: string): string {
  return `${channel}:${accountId}`;
}

function resolveAccountId(params: { accountId?: unknown }, fallback: string): string {
  const raw = params.accountId;
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

// ========== Channels Status ==========

async function channelsStatus(params: unknown, _ctx: GatewayMethodContext) {
  const { channel, probe = false } = params as {
    channel?: string;
    probe?: boolean;
  };

  const registry = getGlobalChannelRegistry();
  const plugins = channel ? registry.listAll().filter((p) => p.id === channel) : registry.listAll();

  if (channel && plugins.length === 0) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `unknown channel: ${channel}` },
    };
  }

  // 使用空配置列出账号（cross-wms 通道默认不依赖外部配置即可列出元数据）
  const emptyConfig = { channels: {} } as unknown as AppConfig;

  const channels: Record<string, unknown> = {};
  const channelAccounts: Record<string, unknown[]> = {};
  const channelDefaultAccountId: Record<string, string> = {};

  for (const plugin of plugins) {
    const accountIds = plugin.config.listAccountIds(emptyConfig);
    const defaultAccountId = accountIds[0] ?? 'default';
    channelDefaultAccountId[plugin.id] = defaultAccountId;

    const accounts = accountIds.map((accountId) => {
      const entry = runtimeState.get(runtimeKey(plugin.id, accountId));
      return {
        accountId,
        running: entry?.running ?? false,
        loggedOut: entry?.loggedOut ?? false,
        configured: accountIds.length > 0,
        startedAt: entry?.startedAt ?? null,
        stoppedAt: entry?.stoppedAt ?? null,
        lastError: entry?.lastError ?? null,
        ...(probe && entry?.lastError ? { probed: true } : {}),
      };
    });

    channelAccounts[plugin.id] = accounts;
    channels[plugin.id] = {
      configured: accountIds.length > 0,
      running: accounts.some((a) => a.running),
      ...(accounts[0]?.lastError ? { lastError: accounts[0].lastError } : {}),
    };
  }

  return {
    ok: true,
    ts: Date.now(),
    channels,
    channelAccounts,
    channelDefaultAccountId,
  };
}

// ========== Channels Start ==========

async function channelsStart(params: unknown, _ctx: GatewayMethodContext) {
  const { channel, accountId } = params as { channel?: string; accountId?: string };

  if (!channel) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'channel is required' } };
  }

  const registry = getGlobalChannelRegistry();
  const plugin = registry.listAll().find((p) => p.id === channel);
  if (!plugin) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: `unknown channel: ${channel}` } };
  }

  const emptyConfig = { channels: {} } as unknown as AppConfig;
  const accountIds = plugin.config.listAccountIds(emptyConfig);
  const resolvedAccountId = resolveAccountId({ accountId }, accountIds[0] ?? 'default');
  const key = runtimeKey(channel, resolvedAccountId);

  const now = Date.now();
  const entry: ChannelRuntimeEntry = {
    channel,
    accountId: resolvedAccountId,
    running: true,
    loggedOut: false,
    startedAt: now,
  };
  runtimeState.set(key, entry);

  return {
    ok: true,
    channel,
    accountId: resolvedAccountId,
    started: true,
  };
}

// ========== Channels Stop ==========

async function channelsStop(params: unknown, _ctx: GatewayMethodContext) {
  const { channel, accountId } = params as { channel?: string; accountId?: string };

  if (!channel) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'channel is required' } };
  }

  const registry = getGlobalChannelRegistry();
  const plugin = registry.listAll().find((p) => p.id === channel);
  if (!plugin) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: `unknown channel ${channel}` } };
  }

  const emptyConfig = { channels: {} } as unknown as AppConfig;
  const accountIds = plugin.config.listAccountIds(emptyConfig);
  const resolvedAccountId = resolveAccountId({ accountId }, accountIds[0] ?? 'default');
  const key = runtimeKey(channel, resolvedAccountId);

  const entry = runtimeState.get(key);
  const now = Date.now();
  if (entry) {
    entry.running = false;
    entry.stoppedAt = now;
  } else {
    runtimeState.set(key, {
      channel,
      accountId: resolvedAccountId,
      running: false,
      loggedOut: false,
      stoppedAt: now,
    });
  }

  return {
    ok: true,
    channel,
    accountId: resolvedAccountId,
    stopped: true,
  };
}

// ========== Channels Logout ==========

async function channelsLogout(params: unknown, _ctx: GatewayMethodContext) {
  const { channel, accountId } = params as { channel?: string; accountId?: string };

  if (!channel) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'channel is required' } };
  }

  const registry = getGlobalChannelRegistry();
  const plugin = registry.listAll().find((p) => p.id === channel);
  if (!plugin) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: `unknown channel ${channel}` } };
  }

  const emptyConfig = { channels: {} } as unknown as AppConfig;
  const accountIds = plugin.config.listAccountIds(emptyConfig);
  const resolvedAccountId = resolveAccountId({ accountId }, accountIds[0] ?? 'default');
  const key = runtimeKey(channel, resolvedAccountId);

  // 先停止运行态再清除认证
  const entry = runtimeState.get(key);
  if (entry) {
    entry.running = false;
    entry.loggedOut = true;
    entry.stoppedAt = Date.now();
  } else {
    runtimeState.set(key, {
      channel,
      accountId: resolvedAccountId,
      running: false,
      loggedOut: true,
      stoppedAt: Date.now(),
    });
  }

  return {
    ok: true,
    channel,
    accountId: resolvedAccountId,
    cleared: true,
    loggedOut: true,
  };
}

/**
 * 注册所有通道方法
 */
export function registerChannelsMethods(registry: GatewayMethodRegistry): void {
  registry.register('channels.status', channelsStatus);
  registry.register('channels.start', channelsStart);
  registry.register('channels.stop', channelsStop);
  registry.register('channels.logout', channelsLogout);
}
