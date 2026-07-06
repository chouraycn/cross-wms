/**
 * Talk (语音对话) API 调用
 */

import { API_BASE } from '../../constants/api';
import type { TalkConfigResponse, TalkDefaults, TalkConfig } from './types';

/** 读取 Talk 配置 */
export async function fetchTalkConfig(): Promise<TalkConfigResponse> {
  const res = await fetch(`${API_BASE}/talk/config`);
  if (!res.ok) throw new Error(`Failed to fetch talk config: ${res.status}`);
  return res.json();
}

/** 更新 Talk 配置（部分更新） */
export async function updateTalkConfig(config: Partial<TalkConfig>): Promise<TalkConfigResponse> {
  const res = await fetch(`${API_BASE}/talk/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to update talk config: ${res.status}`);
  return res.json();
}

/** 重置 Talk 配置为默认值 */
export async function resetTalkConfig(): Promise<TalkConfigResponse> {
  const res = await fetch(`${API_BASE}/talk/config/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to reset talk config: ${res.status}`);
  return res.json();
}

/** 读取平台默认值 */
export async function fetchTalkDefaults(): Promise<TalkDefaults> {
  const res = await fetch(`${API_BASE}/talk/defaults`);
  if (!res.ok) throw new Error(`Failed to fetch talk defaults: ${res.status}`);
  return res.json();
}
