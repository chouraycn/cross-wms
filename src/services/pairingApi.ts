/**
 * Pairing API — 前端调用后端 /api/pairing 端点
 *
 * 暴露的接口：
 * - generatePairingCode  生成 6 位配对码（含过期时间）
 * - fetchPairingSessions  获取配对会话列表
 * - fetchPairedDevices    获取已配对设备列表
 * - unpairDevice          取消配对（移除已配对设备）
 * - discoverDevices       扫描附近可配对设备
 *
 * 失败时抛 Error，前端组件可捕获并展示。
 */

import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ===================== 类型定义 =====================

/** 设备类型 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type DeviceType = 'mobile' | 'desktop' | 'tablet' | 'unknown' | (string & {});

/** 配对状态 */
export type PairingStatus =
  | 'idle'
  | 'discovering'
  | 'connecting'
  | 'authenticating'
  | 'exchanging-keys'
  | 'paired'
  | 'failed'
  | 'expired';

/** 配对方式 */
export type PairingMethod = 'qrcode' | 'manual-code' | 'network-discovery' | 'bluetooth';

/** 配对码信息 */
export interface PairingCodeInfo {
  code: string;
  createdAt: number;
  expiresAt: number;
  ttlMs: number;
}

/** 设备信息 */
export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  capabilities?: string[];
  publicKey?: string;
  metadata?: Record<string, unknown>;
}

/** 已配对设备 */
export interface PairedDevice {
  deviceId: string;
  deviceInfo: DeviceInfo;
  pairedAt: number;
  lastSeenAt: number;
  isActive: boolean;
  trustLevel: number;
  sharedSecret?: string;
  metadata?: Record<string, unknown>;
}

/** 配对会话 */
export interface PairingSession {
  sessionId: string;
  state: PairingStatus;
  localDevice: DeviceInfo;
  remoteDevice?: DeviceInfo;
  pairingMethod: PairingMethod;
  pairingCode?: PairingCodeInfo;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  sharedSecret?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** 已发现的附近设备 */
export interface DiscoveredDevice {
  deviceId: string;
  deviceName: string;
  address: string;
  transport: 'tcp' | 'udp' | 'bluetooth' | 'websocket';
  signalStrength?: number;
  lastSeen: number;
  serviceName?: string;
  txtRecord?: Record<string, string>;
}

// ===================== API 函数 =====================

/** 生成 6 位配对码 */
export async function generatePairingCode(): Promise<PairingCodeInfo> {
  const res = await request<{ code: string; createdAt: number; expiresAt: number; ttlMs: number }>(
    '/api/pairing/generate-code',
    { method: 'POST' },
  );
  return res;
}

/** 获取配对会话列表 */
export async function fetchPairingSessions(): Promise<PairingSession[]> {
  const res = await request<{ sessions: PairingSession[] }>('/api/pairing/sessions');
  return res.sessions;
}

/** 获取已配对设备列表 */
export async function fetchPairedDevices(): Promise<PairedDevice[]> {
  const res = await request<{ devices: PairedDevice[] }>('/api/pairing/devices');
  return res.devices;
}

/** 取消配对（移除已配对设备） */
export async function unpairDevice(deviceId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/api/pairing/devices/${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' },
  );
}

/** 扫描附近可配对设备 */
export async function discoverDevices(timeoutMs?: number): Promise<DiscoveredDevice[]> {
  const res = await request<{ devices: DiscoveredDevice[] }>(
    '/api/pairing/discover',
    { method: 'POST', body: JSON.stringify({ timeoutMs }) },
  );
  return res.devices;
}
