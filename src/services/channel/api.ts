/**
 * Channel (通道管理) API 调用
 */

import { API_BASE } from '../../constants/api';
import type {
  ChannelConfig,
  ChannelDetail,
  ChannelTypeDescriptor,
  ChannelAccount,
  ContentType,
} from './types';

/** 列出支持的通道类型 */
export async function fetchChannelTypes(): Promise<ChannelTypeDescriptor[]> {
  const res = await fetch(`${API_BASE}/channels/types`);
  if (!res.ok) throw new Error(`Failed to fetch channel types: ${res.status}`);
  const data = await res.json();
  return data.types;
}

/** 列出所有通道 */
export async function fetchChannels(): Promise<ChannelDetail[]> {
  const res = await fetch(`${API_BASE}/channels`);
  if (!res.ok) throw new Error(`Failed to fetch channels: ${res.status}`);
  const data = await res.json();
  return data.channels;
}

/** 获取单个通道详情 */
export async function fetchChannel(name: string): Promise<ChannelDetail> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to fetch channel: ${res.status}`);
  return res.json();
}

/** 添加新通道 */
export async function createChannel(config: ChannelConfig): Promise<ChannelDetail> {
  const res = await fetch(`${API_BASE}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create channel: ${res.status}`);
  }
  return res.json();
}

/** 更新通道配置 */
export async function updateChannel(
  name: string,
  updates: Partial<ChannelConfig>,
): Promise<ChannelDetail> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update channel: ${res.status}`);
  }
  return res.json();
}

/** 删除通道 */
export async function deleteChannel(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete channel: ${res.status}`);
  }
}

/** 启用通道 */
export async function enableChannel(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}/enable`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to enable channel: ${res.status}`);
}

/** 禁用通道 */
export async function disableChannel(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}/disable`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to disable channel: ${res.status}`);
}

/** 发送消息到通道 */
export async function sendChannelMessage(
  name: string,
  content: string,
  contentType?: ContentType,
): Promise<void> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, contentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to send message: ${res.status}`);
  }
}

/** 列出通道账户 */
export async function fetchChannelAccounts(name: string): Promise<ChannelAccount[]> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}/accounts`);
  if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
  const data = await res.json();
  return data.accounts;
}

/** 添加通道账户 */
export async function addChannelAccount(
  name: string,
  account: Partial<ChannelAccount>,
): Promise<{ accountId: string }> {
  const res = await fetch(`${API_BASE}/channels/${encodeURIComponent(name)}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  });
  if (!res.ok) throw new Error(`Failed to add account: ${res.status}`);
  return res.json();
}

/** 删除通道账户 */
export async function deleteChannelAccount(
  name: string,
  accountId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/channels/${encodeURIComponent(name)}/accounts/${encodeURIComponent(accountId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to delete account: ${res.status}`);
}
