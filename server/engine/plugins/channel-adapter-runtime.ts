/**
 * Channel Adapter Runtime — 通道适配器运行时
 *
 * 管理 channel capability provider 的生命周期与消息适配。
 * 与 ./bundled-channel-runtime.ts 互补：
 * - bundled-channel-runtime.ts 关注内置通道的发现与元数据
 * - 本文件关注运行时通道适配器的注册、启动、停止与状态管理
 *
 * 与 ./channel-capability.ts 的关系：
 * - channel-capability.ts 提供能力注册接口（供插件注册）
 * - 本文件在注册基础上提供运行时管理（连接/断开/路由）
 */

import { logger } from '../../logger.js';
import {
  CHANNEL_STATE_IDLE,
  CHANNEL_STATE_CONNECTING,
  CHANNEL_STATE_CONNECTED,
  CHANNEL_STATE_DISCONNECTING,
  CHANNEL_STATE_DISCONNECTED,
  CHANNEL_STATE_ERROR,
} from './plugin-constants.js';
import type { ChannelCapabilityMessage, ChannelCapabilityProvider } from './channel-capability.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginChannelError } from './plugin-errors.js';

/** 通道适配器状态 */
export type ChannelAdapterState =
  | typeof CHANNEL_STATE_IDLE
  | typeof CHANNEL_STATE_CONNECTING
  | typeof CHANNEL_STATE_CONNECTED
  | typeof CHANNEL_STATE_DISCONNECTING
  | typeof CHANNEL_STATE_DISCONNECTED
  | typeof CHANNEL_STATE_ERROR;

/** 通道适配器运行时项 */
export interface ChannelAdapterRuntimeEntry {
  /** 提供者 ID */
  providerId: string;
  /** 插件 ID */
  pluginId: string;
  /** 通道提供者 */
  provider: ChannelCapabilityProvider;
  /** 当前状态 */
  state: ChannelAdapterState;
  /** 注册时间 */
  registeredAt: number;
  /** 最后连接时间 */
  connectedAt?: number;
  /** 最后断开时间 */
  disconnectedAt?: number;
  /** 最后错误 */
  lastError?: string;
  /** 消息计数 */
  messageCount: number;
}

/** 通道适配器运行时配置 */
export interface ChannelAdapterRuntimeConfig {
  /** 是否自动连接 */
  autoConnect?: boolean;
  /** 连接超时（毫秒） */
  connectTimeoutMs?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔（毫秒） */
  retryIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<ChannelAdapterRuntimeConfig> = {
  autoConnect: false,
  connectTimeoutMs: 10_000,
  maxRetries: 3,
  retryIntervalMs: 5_000,
};

// ===================== 通道适配器注册表 =====================

class ChannelAdapterRuntimeRegistry {
  private adapters = new Map<string, ChannelAdapterRuntimeEntry>();
  private config: Required<ChannelAdapterRuntimeConfig> = { ...DEFAULT_CONFIG };

  /** 配置运行时 */
  configure(config: Partial<ChannelAdapterRuntimeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 注册通道适配器 */
  register(providerId: string, pluginId: string, provider: ChannelCapabilityProvider): ChannelAdapterRuntimeEntry {
    const existing = this.adapters.get(providerId);
    const entry: ChannelAdapterRuntimeEntry = {
      providerId,
      pluginId,
      provider,
      state: CHANNEL_STATE_IDLE,
      registeredAt: existing?.registeredAt ?? Date.now(),
      messageCount: existing?.messageCount ?? 0,
    };
    this.adapters.set(providerId, entry);
    logger.debug(`[ChannelAdapterRuntime] 注册通道适配器: ${providerId} (plugin=${pluginId})`);

    if (this.config.autoConnect) {
      this.connect(providerId).catch((err) => {
        logger.warn(`[ChannelAdapterRuntime] 自动连接 ${providerId} 失败: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return entry;
  }

  /** 注销通道适配器 */
  async unregister(providerId: string): Promise<boolean> {
    const entry = this.adapters.get(providerId);
    if (!entry) return false;
    if (entry.state === CHANNEL_STATE_CONNECTED) {
      await this.disconnect(providerId).catch(() => {});
    }
    this.adapters.delete(providerId);
    logger.debug(`[ChannelAdapterRuntime] 注销通道适配器: ${providerId}`);
    return true;
  }

  /** 连接通道 */
  async connect(providerId: string): Promise<void> {
    const entry = this.adapters.get(providerId);
    if (!entry) {
      throw new PluginChannelError(`未找到通道适配器: ${providerId}`, providerId);
    }
    if (entry.state === CHANNEL_STATE_CONNECTED || entry.state === CHANNEL_STATE_CONNECTING) {
      return;
    }

    entry.state = CHANNEL_STATE_CONNECTING;
    logger.info(`[ChannelAdapterRuntime] 连接通道: ${providerId}`);

    try {
      if (entry.provider.connect) {
        await withTimeout(entry.provider.connect(), this.config.connectTimeoutMs, providerId);
      }
      entry.state = CHANNEL_STATE_CONNECTED;
      entry.connectedAt = Date.now();
      entry.lastError = undefined;
      logger.info(`[ChannelAdapterRuntime] 通道已连接: ${providerId}`);
    } catch (err) {
      entry.state = CHANNEL_STATE_ERROR;
      entry.lastError = err instanceof Error ? err.message : String(err);
      logger.error(`[ChannelAdapterRuntime] 连接通道失败: ${providerId} - ${entry.lastError}`);
      throw new PluginChannelError(`连接通道失败: ${entry.lastError}`, providerId);
    }
  }

  /** 断开通道 */
  async disconnect(providerId: string): Promise<void> {
    const entry = this.adapters.get(providerId);
    if (!entry) {
      throw new PluginChannelError(`未找到通道适配器: ${providerId}`, providerId);
    }
    if (entry.state === CHANNEL_STATE_DISCONNECTED || entry.state === CHANNEL_STATE_IDLE) {
      return;
    }

    entry.state = CHANNEL_STATE_DISCONNECTING;
    logger.info(`[ChannelAdapterRuntime] 断开通道: ${providerId}`);

    try {
      if (entry.provider.disconnect) {
        await entry.provider.disconnect();
      }
      entry.state = CHANNEL_STATE_DISCONNECTED;
      entry.disconnectedAt = Date.now();
      logger.info(`[ChannelAdapterRuntime] 通道已断开: ${providerId}`);
    } catch (err) {
      entry.state = CHANNEL_STATE_ERROR;
      entry.lastError = err instanceof Error ? err.message : String(err);
      logger.error(`[ChannelAdapterRuntime] 断开通道失败: ${providerId} - ${entry.lastError}`);
    }
  }

  /** 发送消息 */
  async sendMessage(providerId: string, message: ChannelCapabilityMessage): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const entry = this.adapters.get(providerId);
    if (!entry) {
      throw new PluginChannelError(`未找到通道适配器: ${providerId}`, providerId);
    }
    if (entry.state !== CHANNEL_STATE_CONNECTED) {
      return { ok: false, error: `通道未连接 (state=${entry.state})` };
    }

    try {
      const result = await entry.provider.invoke({ message });
      if (result.ok) {
        entry.messageCount++;
      }
      return result;
    } catch (err) {
      entry.lastError = err instanceof Error ? err.message : String(err);
      return { ok: false, error: entry.lastError };
    }
  }

  /** 获取适配器状态 */
  getState(providerId: string): ChannelAdapterState | undefined {
    return this.adapters.get(providerId)?.state;
  }

  /** 获取适配器项 */
  getEntry(providerId: string): ChannelAdapterRuntimeEntry | undefined {
    return this.adapters.get(providerId);
  }

  /** 列出所有适配器 */
  list(): ChannelAdapterRuntimeEntry[] {
    return Array.from(this.adapters.values());
  }

  /** 列出已连接的适配器 */
  listConnected(): ChannelAdapterRuntimeEntry[] {
    return this.list().filter((e) => e.state === CHANNEL_STATE_CONNECTED);
  }

  /** 连接所有适配器 */
  async connectAll(): Promise<Array<{ providerId: string; ok: boolean; error?: string }>> {
    const results: Array<{ providerId: string; ok: boolean; error?: string }> = [];
    for (const entry of this.adapters.values()) {
      try {
        await this.connect(entry.providerId);
        results.push({ providerId: entry.providerId, ok: true });
      } catch (err) {
        results.push({
          providerId: entry.providerId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  /** 断开所有适配器 */
  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const entry of this.adapters.values()) {
      if (entry.state === CHANNEL_STATE_CONNECTED || entry.state === CHANNEL_STATE_CONNECTING) {
        promises.push(this.disconnect(entry.providerId));
      }
    }
    await Promise.allSettled(promises);
  }

  /** 清空所有适配器 */
  async clear(): Promise<void> {
    await this.disconnectAll();
    this.adapters.clear();
  }
}

/** 全局通道适配器运行时 */
const channelAdapterRuntime = new ChannelAdapterRuntimeRegistry();

/** 获取通道适配器运行时 */
export function getChannelAdapterRuntime(): ChannelAdapterRuntimeRegistry {
  return channelAdapterRuntime;
}

/** 从 capability registry 同步已注册的通道提供者到适配器运行时 */
export function syncChannelAdaptersFromRegistry(): number {
  const entries = capabilityProviderRegistry.list('channel');
  let count = 0;
  for (const entry of entries) {
    const provider = entry.provider as ChannelCapabilityProvider;
    if (!channelAdapterRuntime.getEntry(provider.id)) {
      channelAdapterRuntime.register(provider.id, entry.pluginId, provider);
      count++;
    }
  }
  return count;
}

// ===================== 工具函数 =====================

/** 带超时的 Promise */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PluginChannelError(`通道连接超时: ${providerId} (${timeoutMs}ms)`, providerId));
    }, timeoutMs);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
