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
const configStore: Record<string, unknown> = {};

/**
 * 判断值是否为普通对象（非数组、非 null）
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 深度合并：将 patch 合并到 target，返回新对象
 * - 同名且均为对象时递归合并
 * - 否则 patch 覆盖 target
 */
function deepMerge(target: unknown, patch: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return patch;
  }
  const result: Record<string, unknown> = { ...target };
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
function readPath(root: unknown, segments: string[]): { found: boolean; value: unknown } {
  let current: unknown = root;
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
function writePath(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let current = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!isPlainObject(current[seg])) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function parsePath(path: string): string[] | null {
  const segments = path.split('.').map((s) => s.trim()).filter(Boolean);
  return segments.length > 0 ? segments : null;
}

// ========== Config Set ==========

async function configSet(params: unknown, _ctx: GatewayMethodContext) {
  const { path, value } = params as { path: string; value: unknown };

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

async function configPatch(params: unknown, _ctx: GatewayMethodContext) {
  const { path, patch } = params as { path: string; patch: unknown };

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

// ========== Config Get ==========

async function configGet(params: unknown, _ctx: GatewayMethodContext) {
  const { path } = (params || {}) as { path?: string };

  // 不传 path：返回整份配置快照
  if (!path) {
    return {
      ok: true,
      config: configStore,
      exists: Object.keys(configStore).length > 0,
    };
  }

  const segments = parsePath(path);
  if (!segments) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'invalid path' } };
  }

  const result = readPath(configStore, segments);
  return {
    ok: true,
    path,
    exists: result.found,
    value: result.found ? result.value : null,
  };
}

// ========== Config Apply ==========

async function configApply(params: unknown, _ctx: GatewayMethodContext) {
  const { raw, config } = (params || {}) as { raw?: string; config?: unknown };

  // 接受 raw（JSON5/JSON 字符串）或直接 config 对象
  let nextConfig: unknown;
  if (typeof raw === 'string') {
    try {
      // 使用 JSON.parse 解析（生产环境应使用 JSON5）
      nextConfig = JSON.parse(raw);
    } catch {
      return { ok: false, error: { code: 'INVALID_REQUEST', message: 'invalid raw config JSON' } };
    }
  } else if (config !== undefined) {
    nextConfig = config;
  } else {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'raw or config is required' } };
  }

  if (!isPlainObject(nextConfig)) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'config must be an object' } };
  }

  // 全量替换内存配置存储
  const before = { ...configStore };
  for (const key of Object.keys(configStore)) {
    delete configStore[key];
  }
  Object.assign(configStore, nextConfig as Record<string, unknown>);

  return {
    ok: true,
    before,
    after: { ...configStore },
    restart: false, // 精简版不触发重启
  };
}

// ========== Config Schema ==========

// 内置配置 schema（精简版，覆盖核心配置域）
const BUILTIN_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    gateway: {
      type: 'object',
      description: 'Gateway 网关配置',
      properties: {
        port: { type: 'number', description: '监听端口' },
        host: { type: 'string', description: '监听地址' },
        controlUi: {
          type: 'object',
          properties: {
            basePath: { type: 'string', description: '控制台基础路径' },
          },
        },
      },
    },
    models: {
      type: 'object',
      description: '模型配置',
      properties: {
        default: { type: 'string', description: '默认模型 ID' },
        providers: { type: 'object', description: '模型提供者映射' },
      },
    },
    agents: {
      type: 'object',
      description: 'Agent 配置',
    },
    channels: {
      type: 'object',
      description: '通道配置',
    },
  },
};

async function configSchema(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    ok: true,
    schema: BUILTIN_CONFIG_SCHEMA,
    uiHints: {},
    version: 1,
  };
}

// ========== Config Schema Lookup ==========

async function configSchemaLookup(params: unknown, _ctx: GatewayMethodContext) {
  const { path } = (params || {}) as { path?: string };

  if (!path || typeof path !== 'string') {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'path is required' } };
  }

  const segments = parsePath(path);
  if (!segments) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'invalid path' } };
  }

  // 沿 schema properties 路径查找
  let current: unknown = BUILTIN_CONFIG_SCHEMA;
  for (const seg of segments) {
    if (isPlainObject(current) && 'properties' in current) {
      const props = (current as { properties: Record<string, unknown> }).properties;
      if (isPlainObject(props) && seg in props) {
        current = props[seg];
      } else {
        return { ok: false, error: { code: 'NOT_FOUND', message: `config schema path not found: ${path}` } };
      }
    } else if (isPlainObject(current) && seg in current) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return { ok: false, error: { code: 'NOT_FOUND', message: `config schema path not found: ${path}` } };
    }
  }

  return {
    ok: true,
    path,
    schema: current,
  };
}

// ========== Config Open File ==========

async function configOpenFile(_params: unknown, _ctx: GatewayMethodContext) {
  // 精简版使用内存配置，无实际文件路径；返回合理的默认值
  const configPath = process.env.OPENCLAW_CONFIG_PATH || 'openclaw.json';

  // 尝试调用系统打开命令（macOS: open, Linux: xdg-open）
  const { execFile } = await import('node:child_process');
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? null : 'xdg-open';

  if (!command) {
    return { ok: false, path: configPath, error: 'unsupported platform for config.openFile' };
  }

  return await new Promise((resolve) => {
    execFile(command, [configPath], (error) => {
      if (error) {
        resolve({
          ok: false,
          path: configPath,
          error: `Failed to open config file: ${error.message}`,
        });
        return;
      }
      resolve({ ok: true, path: configPath });
    });
  });
}

/**
 * 注册所有配置方法
 */
export function registerConfigMethods(registry: GatewayMethodRegistry): void {
  registry.register('config.set', configSet);
  registry.register('config.patch', configPatch);
  registry.register('config.get', configGet);
  registry.register('config.apply', configApply);
  registry.register('config.schema', configSchema);
  registry.register('config.schema.lookup', configSchemaLookup);
  registry.register('config.openFile', configOpenFile);
}

/**
 * 读取配置存储（供其他模块查询）
 */
export function getConfigValue(path: string): unknown {
  const segments = parsePath(path);
  if (!segments) return undefined;
  const result = readPath(configStore, segments);
  return result.found ? result.value : undefined;
}
