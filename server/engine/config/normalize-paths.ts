// 移植自 openclaw/src/config/normalize-paths.ts
// 将路径类配置值规范化为用户规范路径。
//
// 降级说明：源文件依赖 ../utils.js 的 isPlainObject 与 resolveUserPath。
// 此处内联等价实现。
import path from 'node:path';
import os from 'node:os';
import type { OpenClawConfig } from './types/openclaw.js';

/** 内联降级实现：判断是否为普通对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 内联降级实现：将 ~ 开头路径解析为绝对路径。 */
function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('~')) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  return path.resolve(trimmed);
}

const PATH_VALUE_RE = /^~(?=$|[\\/])/;

const PATH_KEY_RE = /(dir|path|paths|file|root|workspace)$/i;
const PATH_LIST_KEYS = new Set(['paths', 'pathPrepend']);

function normalizeStringValue(key: string | undefined, value: string): string {
  if (!PATH_VALUE_RE.test(value.trim())) {
    return value;
  }
  if (!key) {
    return value;
  }
  if (PATH_KEY_RE.test(key) || PATH_LIST_KEYS.has(key)) {
    return resolveUserPath(value);
  }
  return value;
}

function normalizeAny(key: string | undefined, value: unknown): unknown {
  if (typeof value === 'string') {
    return normalizeStringValue(key, value);
  }

  if (Array.isArray(value)) {
    const normalizeChildren = Boolean(key && PATH_LIST_KEYS.has(key));
    return value.map((entry) => {
      if (typeof entry === 'string') {
        return normalizeChildren ? normalizeStringValue(key, entry) : entry;
      }
      if (Array.isArray(entry)) {
        return normalizeAny(undefined, entry);
      }
      if (isPlainObject(entry)) {
        return normalizeAny(undefined, entry);
      }
      return entry;
    });
  }

  if (!isPlainObject(value)) {
    return value;
  }

  for (const [childKey, childValue] of Object.entries(value)) {
    const next = normalizeAny(childKey, childValue);
    if (next !== childValue) {
      value[childKey] = next;
    }
  }

  return value;
}

/**
 * 规范化 path-ish 配置字段中的 "~" 路径。
 *
 * 目标：在配置文件 + env 覆盖之间一致地接受 `~/...`，同时保持表面积小且可预测。
 */
export function normalizeConfigPaths(cfg: OpenClawConfig): OpenClawConfig {
  if (!cfg || typeof cfg !== 'object') {
    return cfg;
  }
  normalizeAny(undefined, cfg);
  return cfg;
}
