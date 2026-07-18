/**
 * 频道运行时管理器。
 *
 * 负责注册、注销、查询频道实例，以及向所有频道广播消息。
 */

import type { Channel, ChannelMessage, ChannelId } from "./types.js";
import { logger } from "../logger.js";

/**
 * 频道管理器。
 */
export class ChannelManager {
  /** 已注册的频道实例映射。 */
  channels = new Map<ChannelId, Channel>();

  /**
   * 注册频道实例。
   */
  register(channel: Channel): void {
    if (this.channels.has(channel.id)) {
      logger.warn(`[ChannelManager] Channel already registered, overwriting: ${channel.id}`);
    }
    this.channels.set(channel.id, channel);
    logger.info(`[ChannelManager] Registered channel: ${channel.id}`);
  }

  /**
   * 注销频道实例。
   */
  unregister(channelId: ChannelId): void {
    const had = this.channels.delete(channelId);
    if (had) {
      logger.info(`[ChannelManager] Unregistered channel: ${channelId}`);
    }
  }

  /**
   * 获取指定频道实例。
   */
  get(channelId: ChannelId): Channel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * 列出所有已注册频道。
   */
  list(): Channel[] {
    return Array.from(this.channels.values());
  }

  /**
   * 向所有已注册频道广播消息。
   * 单个频道发送失败不会影响其他频道。
   */
  async broadcast(message: ChannelMessage): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.channels.values()).map(async (channel) => {
        try {
          await channel.send(message);
        } catch (err) {
          logger.error(`[ChannelManager] Broadcast failed for channel ${channel.id}:`, err);
          throw err;
        }
      }),
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn(`[ChannelManager] Broadcast completed with ${failures.length} failures out of ${results.length} channels`);
    } else {
      logger.debug(`[ChannelManager] Broadcast completed to ${results.length} channels`);
    }
  }

  /**
   * 启动所有已注册频道。
   */
  async startAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      if (channel.start) {
        try {
          await channel.start();
          channel.status = "ready";
        } catch (err) {
          channel.status = "error";
          logger.error(`[ChannelManager] Failed to start channel ${channel.id}:`, err);
        }
      }
    }
  }

  /**
   * 停止所有已注册频道。
   */
  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      if (channel.stop) {
        try {
          await channel.stop();
          channel.status = "closed";
        } catch (err) {
          logger.error(`[ChannelManager] Failed to stop channel ${channel.id}:`, err);
        }
      }
    }
  }
}
