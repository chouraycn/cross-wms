/**
 * Channel 能力提供者 — 通道消息收发能力
 *
 * 插件可注册自定义通道（如自定义聊天平台）。
 * 与 server/channels/ 集成。
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError, PluginChannelError } from './plugin-errors.js';

/** 通道消息 */
export interface ChannelCapabilityMessage {
  /** 通道 ID */
  channelId: string;
  /** 发送者 */
  from: string;
  /** 接收者 */
  to: string;
  /** 文本内容 */
  text?: string;
  /** 附件 */
  attachments?: Array<{
    kind: 'image' | 'video' | 'audio' | 'file';
    url?: string;
    data?: string;
    mimeType?: string;
  }>;
  /** 线程 ID */
  threadId?: string;
  /** 时间戳 */
  timestamp: number;
}

/** 通道发送选项 */
export interface ChannelSendOptions {
  /** 消息 */
  message: ChannelCapabilityMessage;
}

/** 通道发送结果 */
export interface ChannelSendResult {
  ok: boolean;
  /** 消息 ID（通道返回） */
  messageId?: string;
  /** 错误信息 */
  error?: string;
}

/** 通道能力提供者接口 */
export type ChannelCapabilityProvider = CapabilityProvider<ChannelSendOptions, ChannelSendResult> & {
  /** 接收消息（订阅模式） */
  subscribe?(handler: (message: ChannelCapabilityMessage) => void): () => void;
  /** 取消订阅 */
  unsubscribe?(): void;
  /** 通道是否已连接 */
  isConnected?(): boolean;
  /** 连接通道 */
  connect?(): Promise<void>;
  /** 断开通道 */
  disconnect?(): Promise<void>;
};

// ===================== 注册与调用 =====================

/** 注册 Channel 能力提供者 */
export function registerChannelProvider(
  pluginId: string,
  provider: ChannelCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 Channel 能力提供者 */
export function unregisterChannelProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('channel', providerId);
}

/** 发送通道消息 */
export async function sendChannelMessage(
  providerId: string,
  message: ChannelCapabilityMessage,
): Promise<ChannelSendResult> {
  const entry = capabilityProviderRegistry.find<ChannelSendOptions, ChannelSendResult>('channel', providerId);
  if (!entry) {
    throw new PluginChannelError(`未找到通道提供者: ${providerId}`, providerId);
  }

  try {
    return await entry.provider.invoke({ message });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 订阅通道消息 */
export function subscribeToChannel(
  providerId: string,
  handler: (message: ChannelCapabilityMessage) => void,
): () => void {
  const entry = capabilityProviderRegistry.find<ChannelSendOptions, ChannelSendResult>('channel', providerId);
  if (!entry) {
    throw new PluginChannelError(`未找到通道提供者: ${providerId}`, providerId);
  }

  const provider = entry.provider as ChannelCapabilityProvider;
  if (!provider.subscribe) {
    throw new PluginCapabilityError(
      `通道提供者 ${providerId} 不支持订阅`,
      `channel:${providerId}`,
    );
  }

  return provider.subscribe(handler);
}

/** 连接通道 */
export async function connectChannel(providerId: string): Promise<void> {
  const entry = capabilityProviderRegistry.find<ChannelSendOptions, ChannelSendResult>('channel', providerId);
  if (!entry) {
    throw new PluginChannelError(`未找到通道提供者: ${providerId}`, providerId);
  }

  const provider = entry.provider as ChannelCapabilityProvider;
  if (provider.connect) {
    await provider.connect();
  }
}

/** 断开通道 */
export async function disconnectChannel(providerId: string): Promise<void> {
  const entry = capabilityProviderRegistry.find<ChannelSendOptions, ChannelSendResult>('channel', providerId);
  if (!entry) {
    throw new PluginChannelError(`未找到通道提供者: ${providerId}`, providerId);
  }

  const provider = entry.provider as ChannelCapabilityProvider;
  if (provider.disconnect) {
    await provider.disconnect();
  }
}

/** 列出所有 Channel 提供者 */
export function listChannelProviders() {
  return capabilityProviderRegistry.list('channel');
}

/** 创建 Channel 能力提供者 */
export function createChannelProvider(
  id: string,
  sendFn: (options: ChannelSendOptions) => Promise<ChannelSendResult>,
  options: {
    displayName?: string;
    description?: string;
    subscribe?: (handler: (message: ChannelCapabilityMessage) => void) => () => void;
    connect?: () => Promise<void>;
    disconnect?: () => Promise<void>;
    isConnected?: () => boolean;
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): ChannelCapabilityProvider {
  const provider: ChannelCapabilityProvider = {
    kind: 'channel',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: sendFn,
    ...(options.subscribe ? { subscribe: options.subscribe } : {}),
    ...(options.connect ? { connect: options.connect } : {}),
    ...(options.disconnect ? { disconnect: options.disconnect } : {}),
    ...(options.isConnected ? { isConnected: options.isConnected } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}
