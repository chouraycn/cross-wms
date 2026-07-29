import { request } from './api';

export type ChannelType = 'webhook' | 'feishu' | 'dingtalk' | 'wechat' | 'wechat_work' | 'email';

export type ChannelStatus = 'connected' | 'disconnected' | 'error' | 'unknown' | 'online' | 'offline' | 'connecting' | 'disabled';

export interface ChannelConfig {
  type: ChannelType;
  name: string;
  enabled: boolean;
  credentials: Record<string, string>;
  options?: Record<string, unknown>;
}

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

export interface ChannelTypeInfo {
  type: ChannelType;
  label: string;
  description: string;
  bidirectional: boolean;
}

export interface ChannelListItem extends ChannelConfig {
  status: ChannelStatus;
  accountCount: number;
}

export interface ChannelDetail extends ChannelConfig {
  status: ChannelStatus;
  accounts: ChannelAccount[];
}

export interface SendMessagePayload {
  content: string;
  contentType?: 'text' | 'markdown' | 'json';
}

export interface AddAccountPayload {
  accountId: string;
  accountName: string;
  credentials?: Record<string, string>;
  enabled?: boolean;
  isDefault?: boolean;
}

export async function getChannelTypes(): Promise<ChannelTypeInfo[]> {
  const response = await request<{ types: ChannelTypeInfo[] }>('GET', '/api/channels/types');
  return response.types;
}

export async function getChannels(): Promise<ChannelListItem[]> {
  const response = await request<{ channels: ChannelListItem[] }>('GET', '/api/channels');
  return response.channels;
}

export async function getChannelDetail(name: string): Promise<ChannelDetail> {
  return request<ChannelDetail>('GET', `/api/channels/${encodeURIComponent(name)}`);
}

export async function createChannel(config: ChannelConfig): Promise<{ channel: ChannelConfig; status: ChannelStatus }> {
  return request<{ channel: ChannelConfig; status: ChannelStatus }>('POST', '/api/channels', config);
}

export async function updateChannel(name: string, updates: Partial<ChannelConfig>): Promise<{ channel: ChannelConfig; status: ChannelStatus }> {
  return request<{ channel: ChannelConfig; status: ChannelStatus }>('PUT', `/api/channels/${encodeURIComponent(name)}`, updates);
}

export async function deleteChannel(name: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('DELETE', `/api/channels/${encodeURIComponent(name)}`);
}

export async function enableChannel(name: string): Promise<{ ok: boolean; status: ChannelStatus }> {
  return request<{ ok: boolean; status: ChannelStatus }>('POST', `/api/channels/${encodeURIComponent(name)}/enable`);
}

export async function disableChannel(name: string): Promise<{ ok: boolean; status: ChannelStatus }> {
  return request<{ ok: boolean; status: ChannelStatus }>('POST', `/api/channels/${encodeURIComponent(name)}/disable`);
}

export async function getChannelStatus(name: string): Promise<{ name: string; status: ChannelStatus }> {
  return request<{ name: string; status: ChannelStatus }>('GET', `/api/channels/${encodeURIComponent(name)}/status`);
}

export async function sendMessage(
  name: string,
  content: string,
  contentType?: 'text' | 'markdown' | 'json'
): Promise<{ ok: boolean; channelName: string; error?: string }> {
  return request<{ ok: boolean; channelName: string; error?: string }>(
    'POST',
    `/api/channels/${encodeURIComponent(name)}/send`,
    { content, contentType }
  );
}

export async function getChannelAccounts(name: string): Promise<{ accounts: ChannelAccount[] }> {
  return request<{ accounts: ChannelAccount[] }>('GET', `/api/channels/${encodeURIComponent(name)}/accounts`);
}

export async function addChannelAccount(name: string, account: AddAccountPayload): Promise<{ accountId: string }> {
  return request<{ accountId: string }>('POST', `/api/channels/${encodeURIComponent(name)}/accounts`, account);
}

export async function removeChannelAccount(name: string, accountId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('DELETE', `/api/channels/${encodeURIComponent(name)}/accounts/${encodeURIComponent(accountId)}`);
}

/**
 * 微信 / 企业微信 扫码绑定二维码流
 * 后端生成一次性绑定 token（进程内存储），前端用 qrcode 库渲染图片并轮询状态。
 */
export interface WechatQrcodeResponse {
  qrcode?: string;
  qrcode_img_content?: string;
  qrcode_img_url?: string;
}

export interface WechatQrcodeStatusResponse {
  status?: string;
}

/** 获取微信绑定二维码（token + 二维码内容） */
export async function getWechatQrcode(name: string): Promise<WechatQrcodeResponse> {
  return request<WechatQrcodeResponse>('GET', `/api/channels/${encodeURIComponent(name)}/wechat/qrcode`);
}

/** 轮询微信绑定状态：wait / confirmed / expired */
export async function getWechatQrcodeStatus(name: string, qrcode: string): Promise<WechatQrcodeStatusResponse> {
  return request<WechatQrcodeStatusResponse>(
    'GET',
    `/api/channels/${encodeURIComponent(name)}/wechat/qrcode-status?qrcode=${encodeURIComponent(qrcode)}`
  );
}

/** 确认微信绑定（真实环境由微信回调调用；本地演示由前端「模拟扫码确认」触发） */
export async function confirmWechatQrcode(name: string, qrcode: string): Promise<{ ok: boolean; status: string }> {
  return request<{ ok: boolean; status: string }>(
    'POST',
    `/api/channels/${encodeURIComponent(name)}/wechat/qrcode-confirm?qrcode=${encodeURIComponent(qrcode)}`
  );
}