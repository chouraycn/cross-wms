/**
 * 频道配对存储。
 *
 * 管理频道之间的双向配对关系，使用内存 Map 存储。
 */

import type { ChannelId } from "./types.js";

/**
 * 内存中的频道配对存储。
 */
export class PairingStore {
  private pairs = new Map<ChannelId, ChannelId>();

  /**
   * 建立两个频道之间的配对关系。
   * 配对是双向的：查询任意一方都能得到另一方。
   */
  pair(channelA: ChannelId, channelB: ChannelId): void {
    if (channelA === channelB) {
      throw new Error("Cannot pair a channel with itself");
    }

    // 如果 channelA 已有配对，先解除旧配对
    const existingA = this.pairs.get(channelA);
    if (existingA && existingA !== channelB) {
      this.pairs.delete(existingA);
    }

    // 如果 channelB 已有配对，先解除旧配对
    const existingB = this.pairs.get(channelB);
    if (existingB && existingB !== channelA) {
      this.pairs.delete(existingB);
    }

    this.pairs.set(channelA, channelB);
    this.pairs.set(channelB, channelA);
  }

  /**
   * 解除指定频道的配对关系。
   */
  unpair(channelId: ChannelId): void {
    const paired = this.pairs.get(channelId);
    if (paired) {
      this.pairs.delete(paired);
    }
    this.pairs.delete(channelId);
  }

  /**
   * 获取与指定频道配对的另一个频道。
   * 如果没有配对则返回 null。
   */
  getPairedChannel(channelId: ChannelId): ChannelId | null {
    return this.pairs.get(channelId) ?? null;
  }

  /**
   * 检查指定频道是否已配对。
   */
  isPaired(channelId: ChannelId): boolean {
    return this.pairs.has(channelId);
  }

  /**
   * 清除所有配对关系。
   */
  clear(): void {
    this.pairs.clear();
  }
}
