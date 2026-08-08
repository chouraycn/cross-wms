/**
 * Config Gateway Methods — 配置管理 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/config.ts
 * - 精简版：实现 set / patch 两个核心方法
 * - 内存配置存储（生产环境应使用 server/config 的持久化配置）
 * - set 覆盖整个配置项；patch 对配置项做深度合并
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 内存配置存储
const configStore: Record<string, any> = {};

/**
 * 判断值是否为普通对象（非数组、非 null）
 */
function isPlainObject(value: any): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 深度合并：将 patch 合并到 target，返回新对象
 * - 同名且均为对象时递归合并
 * - 否则 patch 覆盖 target
 */
function deepMerge(target: any, patch: any): any {
  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return patch;
  }
  const result: Record<string, any> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (key in result) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 按点分隔路径读取配置项
 * 例如 path "gateway.controlUi.basePath" 返回 configStore.gateway.controlUi.basePath
 */
function readPath(root: any, segments: string[]): { found: boolean; value: any } {
  let current: any = root;
  for (const seg of segments) {
    if (isPlainObject(current) && seg in current) {
      current = current[seg];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: current };
}

/**
 * 按点分隔路径写入配置项（创建中间对象）
 */
function writePath(root: Record<string, any>, segments: string[], value: any): void {
  let current = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!isPlainObject(current[seg])) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, any>;
  }
  current[segments[segments.length - 1]] = value;
}

function parsePath(path: string): string[] | null {
  const segments = path.split('.').map((s) => s.trim()).filter(Boolean);
  return segments.length > 0 ? segments : null;
}

// ========== Config Set ==========

async function configSet(params: any, _ctx: GatewayMethodContext) {
  const { path, value } = params as { path: string; value: any };

  if (!path) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'path is required' } };
  }

  const segments = parsePath(path);
  if (!segments) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'invalid path' } };
  }

  const before = readPath(configStore, segments);
  writePath(configStore, segments, value);

  return {
    ok: true,
    path,
    before: before.found ? before.value : null,
    after: value,
  };
}

// ========== Config Patch ==========

async function configPatch(params: any, _ctx: GatewayMethodContext) {
  const { path, patch } = params as { path: string; patch: any };

  if (!path) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'path is required' } };
  }

  const segments = parsePath(path);
  if (!segments) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'invalid path' } };
  }

  const before = readPath(configStore, segments);
  const beforeValue = before.found ? before.value : {};
  const merged = deepMerge(beforeValue, patch);
  writePath(configStore, segments, merged);

  return {
    ok: true,
    path,
    before: before.found ? beforeValue : null,
    after: merged,
  };
}

/**
 * 注册所有配置方法
 */
export function registerConfigMethods(registry: GatewayMethodRegistry): void {
  registry.register('config.set', configSet);
  registry.register('config.patch', configPatch);
}

/**
 * 读取配置存储（供其他模块查询）
 */
export function getConfigValue(path: string): any {
  const segments = parsePath(path);
  if (!segments) return undefined;
  const result = readPath(configStore, segments);
  return result.found ? result.value : undefined;
}
