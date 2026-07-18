/**
 * Devices Gateway Methods — 设备管理 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/devices.ts
 * - 精简版：只实现 list / pair / unpair / getStatus 四个核心方法
 * - 内存存储（生产环境应使用数据库）
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

export interface DeviceRecord {
  deviceId: string;
  name: string;
  role: string;
  status: 'paired' | 'unpaired' | 'offline';
  pairedAt: number;
  lastSeenAt?: number;
  metadata?: Record<string, unknown>;
}

// 内存存储（生产环境应使用数据库）
const devices = new Map<string, DeviceRecord>();

// ========== Devices List ==========

async function devicesList(params: unknown, _ctx: GatewayMethodContext) {
  const { status, role } = params as {
    status?: DeviceRecord['status'];
    role?: string;
  };

  let list = Array.from(devices.values());

  if (status) {
    list = list.filter((d) => d.status === status);
  }

  if (role) {
    list = list.filter((d) => d.role === role);
  }

  list.sort((a, b) => b.pairedAt - a.pairedAt);

  return {
    ok: true,
    devices: list,
    total: list.length,
  };
}

// ========== Devices Pair ==========

async function devicesPair(params: unknown, _ctx: GatewayMethodContext) {
  const {
    deviceId,
    name,
    role = 'operator',
    metadata,
  } = params as {
    deviceId: string;
    name: string;
    role?: string;
    metadata?: Record<string, unknown>;
  };

  if (!deviceId) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'deviceId is required' } };
  }

  if (!name) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'name is required' } };
  }

  if (devices.has(deviceId)) {
    return {
      ok: false,
      error: { code: 'ALREADY_PAIRED', message: `Device ${deviceId} already paired` },
    };
  }

  const now = Date.now();
  const device: DeviceRecord = {
    deviceId,
    name,
    role,
    status: 'paired',
    pairedAt: now,
    lastSeenAt: now,
    metadata,
  };

  devices.set(deviceId, device);

  return {
    ok: true,
    device,
  };
}

// ========== Devices Unpair ==========

async function devicesUnpair(params: unknown, _ctx: GatewayMethodContext) {
  const { deviceId } = params as { deviceId: string };

  if (!deviceId) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'deviceId is required' } };
  }

  const deleted = devices.delete(deviceId);

  return {
    ok: true,
    deleted,
  };
}

// ========== Devices Get Status ==========

async function devicesGetStatus(params: unknown, _ctx: GatewayMethodContext) {
  const { deviceId } = params as { deviceId: string };

  if (!deviceId) {
    return { ok: false, error: { code: 'MISSING_PARAMS', message: 'deviceId is required' } };
  }

  const device = devices.get(deviceId);
  if (!device) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `Device ${deviceId} not found` },
    };
  }

  return {
    ok: true,
    device,
  };
}

/**
 * 注册所有设备管理方法
 */
export function registerDevicesMethods(registry: GatewayMethodRegistry): void {
  registry.register('devices.list', devicesList);
  registry.register('devices.pair', devicesPair);
  registry.register('devices.unpair', devicesUnpair);
  registry.register('devices.getStatus', devicesGetStatus);
}
