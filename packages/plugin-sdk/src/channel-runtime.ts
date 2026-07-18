import EventEmitter from 'eventemitter3';
import type { Channel, ChannelConfig, ChannelState, ChannelSupports } from './types';

/**
 * ChannelRuntime 事件
 */
export interface ChannelRuntimeEvents {
  channel_created: [channel: Channel];
  channel_destroyed: [channelId: string];
  channel_state_changed: [channelId: string, state: ChannelState];
  channel_error: [channelId: string, error: Error];
}

/**
 * ChannelRuntime 类
 *
 * 负责频道生命周期管理，包括创建、销毁、状态查询等。
 * 支持 typing、pairing、reply、websocket 等能力。
 */
export class ChannelRuntime extends EventEmitter<ChannelRuntimeEvents> {
  private channels: Map<string, Channel> = new Map();
  private defaultSupports: ChannelSupports = {
    typing: false,
    pairing: false,
    reply: true,
    websocket: false,
  };

  /**
   * 创建频道
   * @param config 频道配置
   * @returns 频道实例
   */
  async createChannel(config: ChannelConfig): Promise<Channel> {
    const channelId = config.id;

    // 检查是否已存在
    if (this.channels.has(channelId)) {
      throw new Error(`Channel ${channelId} already exists`);
    }

    // 创建频道实例
    const channel: Channel = {
      id: channelId,
      type: config.type,
      state: 'creating',
      config,
      sendMessage: async (content: string, metadata?: Record<string, unknown>) => {
        await this.handleSendMessage(channelId, content, metadata);
      },
      getState: () => {
        const ch = this.channels.get(channelId);
        return ch?.state ?? 'destroyed';
      },
      destroy: async () => {
        await this.destroyChannel(channelId);
      },
    };

    // 存储频道
    this.channels.set(channelId, channel);

    // 模拟异步初始化
    await this.initializeChannel(channel);

    // 更新状态并触发事件
    channel.state = 'active';
    this.emit('channel_created', channel);
    this.emit('channel_state_changed', channelId, 'active');

    return channel;
  }

  /**
   * 销毁频道
   * @param channelId 频道 ID
   */
  async destroyChannel(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return;
    }

    // 更新状态
    const previousState = channel.state;
    channel.state = 'destroyed';
    this.channels.delete(channelId);

    // 触发事件
    this.emit('channel_state_changed', channelId, 'destroyed');
    this.emit('channel_destroyed', channelId);
  }

  /**
   * 获取频道状态
   * @param channelId 频道 ID
   * @returns 频道状态
   */
  getChannelState(channelId: string): ChannelState {
    const channel = this.channels.get(channelId);
    return channel?.state ?? 'destroyed';
  }

  /**
   * 获取频道
   * @param channelId 频道 ID
   * @returns 频道实例或 undefined
   */
  getChannel(channelId: string): Channel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * 列出所有频道
   * @returns 频道列表
   */
  listChannels(): Channel[] {
    return Array.from(this.channels.values());
  }

  /**
   * 获取频道支持的能力
   * @param channelId 频道 ID
   * @returns 支持的能力
   */
  getSupports(channelId: string): ChannelSupports {
    const channel = this.channels.get(channelId);
    if (!channel) {
      // 不存在的频道返回全 false
      return {
        typing: false,
        pairing: false,
        reply: false,
        websocket: false,
      };
    }
    return {
      ...this.defaultSupports,
      ...channel.config.supports,
    };
  }

  /**
   * 检查是否支持某能力
   * @param channelId 频道 ID
   * @param capability 能力名称
   * @returns 是否支持
   */
  supports(channelId: string, capability: keyof ChannelSupports): boolean {
    const supports = this.getSupports(channelId);
    return supports[capability] ?? false;
  }

  /**
   * 初始化频道（内部方法）
   */
  private async initializeChannel(channel: Channel): Promise<void> {
    // 模拟异步初始化逻辑
    // 实际实现中可能包含连接建立、认证等
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  /**
   * 处理发送消息（内部方法）
   */
  private async handleSendMessage(
    channelId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }
    if (channel.state !== 'active') {
      throw new Error(`Channel ${channelId} is not active`);
    }
    // 模拟消息发送逻辑
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  /**
   * 清理所有频道
   */
  async clear(): Promise<void> {
    const channelIds = Array.from(this.channels.keys());
    await Promise.all(channelIds.map((id) => this.destroyChannel(id)));
  }
}

/**
 * 默认 ChannelRuntime 实例
 */
export const channelRuntime = new ChannelRuntime();