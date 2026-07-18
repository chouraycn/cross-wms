// 为配对节点持久化设备授权记录。
// 降级实现：openclaw 中从 ../config/paths.js 导入 resolveStateDir，
// 从 ../shared/device-auth-store.js 导入 device-auth 存储辅助，
// cross-wms 在 _runtime-stubs 和 _device-shared-stubs 中提供降级实现。
import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "./_runtime-stubs.js";
import {
  clearDeviceAuthTokenFromStore,
  coerceDeviceAuthStore,
  type DeviceAuthEntry,
  type DeviceAuthStore,
  loadDeviceAuthTokenFromStore,
  storeDeviceAuthTokenInStore,
} from "./_device-shared-stubs.js";
import { privateFileStoreSync } from "./private-file-store.js";

export type { DeviceAuthEntry, DeviceAuthStore } from "./_device-shared-stubs.js";

const DEVICE_AUTH_FILE = "device-auth.json";

type StoreCacheEntry = { store: DeviceAuthStore | null; mtimeMs: number; size: number };
const storeReadCache = new Map<string, StoreCacheEntry>();

function storeCacheHit(
  cached: StoreCacheEntry | undefined,
  stat: { mtimeMs: number; size: number },
): boolean {
  return cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size;
}

function resolveDeviceAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "identity", DEVICE_AUTH_FILE);
}

function readStore(filePath: string): DeviceAuthStore | null {
  try {
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(filePath);
    } catch {
      const cached = storeReadCache.get(filePath);
      if (cached?.mtimeMs === -1 && cached.size === -1) {
        return cached.store;
      }
      storeReadCache.set(filePath, { store: null, mtimeMs: -1, size: -1 });
      return null;
    }
    const cached = storeReadCache.get(filePath);
    if (cached !== undefined && storeCacheHit(cached, stat)) {
      // device-auth 在 gateway 重连期间读取；按文件元数据缓存以避免重复读取
      return cached.store;
    }
    const parsed = privateFileStoreSync(path.dirname(filePath)).readJsonIfExists(
      path.basename(filePath),
    );
    const store = coerceDeviceAuthStore(parsed);
    storeReadCache.set(filePath, { store, mtimeMs: stat.mtimeMs, size: stat.size });
    return store;
  } catch {
    return null;
  }
}

function writeStore(filePath: string, store: DeviceAuthStore): void {
  privateFileStoreSync(path.dirname(filePath)).writeJson(path.basename(filePath), store, {
    trailingNewline: true,
  });
  try {
    const stat = fs.statSync(filePath);
    storeReadCache.set(filePath, { store, mtimeMs: stat.mtimeMs, size: stat.size });
  } catch {
    storeReadCache.delete(filePath);
  }
}

/** 从配置的 OpenClaw 状态目录加载缓存的 device-auth token */
export function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  env?: NodeJS.ProcessEnv;
}): DeviceAuthEntry | null {
  const filePath = resolveDeviceAuthPath(params.env);
  return loadDeviceAuthTokenFromStore({
    adapter: { readStore: () => readStore(filePath), writeStore: (_store) => {} },
    deviceId: params.deviceId,
    role: params.role,
  });
}

/** 在私有状态目录中持久化或替换一个 device-auth 角色 token */
export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
  env?: NodeJS.ProcessEnv;
}): DeviceAuthEntry {
  const filePath = resolveDeviceAuthPath(params.env);
  return storeDeviceAuthTokenInStore({
    adapter: {
      readStore: () => readStore(filePath),
      writeStore: (store) => writeStore(filePath, store),
    },
    deviceId: params.deviceId,
    role: params.role,
    token: params.token,
    scopes: params.scopes,
  });
}

/** 从私有状态目录中移除当前 gateway 设备的一个角色 token */
export function clearDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const filePath = resolveDeviceAuthPath(params.env);
  clearDeviceAuthTokenFromStore({
    adapter: {
      readStore: () => readStore(filePath),
      writeStore: (store) => writeStore(filePath, store),
    },
    deviceId: params.deviceId,
    role: params.role,
  });
}
