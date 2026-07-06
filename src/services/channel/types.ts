/**
 * Channel (通道管理) 类型定义
 * 镜像后端 server/engine/channelSystem.ts 的类型
 */

/** 通道类型 */
export type ChannelType =
  | 'webhook'
  | 'feishu'
  | 'dingtalk'
  | 'wechat'
  | 'wechat_work'
  | 'email';

/** 通道状态 */
export type ChannelStatus = 'connected' | 'disconnected' | 'error' | 'unknown';

/** 通道配置 */
export interface ChannelConfig {
  name: string;
  type: ChannelType;
  enabled: boolean;
  credentials: Record<string, string>;
  settings?: Record<string, unknown>;
  description?: string;
}

/** 通道账户 */
export interface ChannelAccount {
  id: string;
  channelName: string;
  accountId: string;
  accountName: string;
  credentials: Record<string, string>;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

/** 通道详情（含状态和账户） */
export interface ChannelDetail extends ChannelConfig {
  status: ChannelStatus;
  accountCount: number;
  accounts?: ChannelAccount[];
}

/** 支持的通道类型描述 */
export interface ChannelTypeDescriptor {
  type: ChannelType;
  label: string;
  description: string;
  bidirectional: boolean;
}

/** 消息内容类型 */
export type ContentType = 'text' | 'markdown' | 'json';
