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