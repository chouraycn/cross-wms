/**
 * 配置快照回滚（runtime-snapshot）
 *
 * 参考 openclaw/src/config/runtime-snapshot.ts 与 redact-snapshot.ts：
 * - 捕获当前运行时配置快照（captureConfigSnapshot）
 * - 恢复配置到指定快照（restoreConfigSnapshot）
 * - 对快照进行脱敏，便于返回给前端/日志（redactConfigSnapshot）
 *
 * 设计取舍：
 * - cross-wms 的配置以 CDFKnowConfig 单一对象为主，不需要 openclaw 那种
 *   sourceConfig/runtimeConfig 双轨机制
 * - 脱敏策略简化为按路径关键字匹配（apiKey/api_key/secret/password/token）
 * - 不引入 @openclaw/net-policy 等内部包，保持依赖最小
 */

import { createHash } from 'node:crypto';
import type { CDFKnowConfig } from './schema.js';

// ==================== 类型 ====================

export interface ConfigSnapshot {
  /** 快照内容（深拷贝） */
  config: CDFKnowConfig;
  /** 捕获时间戳 */
  capturedAt: number;
  /** 内容指纹（sha256，前 16 字符） */
  fingerprint: string;
  /** 修订号 */
  revision: number;
}

export type RedactedConfigSnapshot = Omit<ConfigSnapshot, 'config'> & {
  config: unknown;
};

// ==================== 内部状态 ====================

let currentSnapshot: ConfigSnapshot | null = null;
let revisionCounter = 0;

const REDACTED_SENTINEL = '__REDACTED__';

/** 命中以下子串（小写比较）的字段视为敏感字段，需要脱敏 */
const SENSITIVE_KEY_HINTS = [
  'apikey',
  'api_key',
  'secret',
  'password',
  'token',
  'credential',
  'privatekey',
  'private_key',
  'auth',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_HINTS.some((hint) => lower.includes(hint));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

function hashConfig(value: CDFKnowConfig): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = deepClone(v);
  }
  return result as unknown as T;
}

// ==================== 捕获与恢复 ====================

/**
 * 捕获当前配置快照。
 * 通常在配置变更前调用，以便失败时回滚。
 */
export function captureConfigSnapshot(config: CDFKnowConfig): ConfigSnapshot {
  revisionCounter += 1;
  const snapshot: ConfigSnapshot = {
    config: deepClone(config),
    capturedAt: Date.now(),
    fingerprint: hashConfig(config),
    revision: revisionCounter,
  };
  currentSnapshot = snapshot;
  return snapshot;
}

/**
 * 恢复到指定快照。返回恢复后的配置对象（深拷贝，避免外部修改污染快照）。
 * 注意：调用方负责把返回值写回 cachedConfig 与磁盘。
 */
export function restoreConfigSnapshot(snapshot: ConfigSnapshot): CDFKnowConfig {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.config) {
    throw new Error('Invalid snapshot: missing config');
  }
  // 恢复时再次捕获快照（用于审计），同时返回深拷贝
  const restored = deepClone(snapshot.config);
  currentSnapshot = {
    config: deepClone(restored),
    capturedAt: Date.now(),
    fingerprint: hashConfig(restored),
    revision: ++revisionCounter,
  };
  return restored;
}

/** 获取当前内存中的快照（不暴露内部对象，返回深拷贝） */
export function getCurrentConfigSnapshot(): ConfigSnapshot | null {
  if (!currentSnapshot) return null;
  return {
    config: deepClone(currentSnapshot.config),
    capturedAt: currentSnapshot.capturedAt,
    fingerprint: currentSnapshot.fingerprint,
    revision: currentSnapshot.revision,
  };
}

/** 重置快照状态（测试/重置场景使用） */
export function resetConfigSnapshotState(): void {
  currentSnapshot = null;
  revisionCounter = 0;
}

// ==================== 脱敏 ====================

function redactValue(value: unknown, keyHint: string): unknown {
  // 字符串敏感值直接替换为 sentinel
  if (typeof value === 'string') {
    if (isSensitiveKey(keyHint)) return REDACTED_SENTINEL;
    // 检测 ${VAR} 环境变量占位符（已是占位符的字符串视为安全）
    if (/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value.trim())) return value;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, keyHint));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = redactValue(v, k);
    }
    return result;
  }
  return value;
}

/**
 * 脱敏配置快照，移除/掩盖敏感字段值。
 * 返回的是新对象，不修改原快照。
 */
export function redactConfigSnapshot(snapshot: ConfigSnapshot): RedactedConfigSnapshot {
  return {
    config: redactValue(deepClone(snapshot.config), ''),
    capturedAt: snapshot.capturedAt,
    fingerprint: snapshot.fingerprint,
    revision: snapshot.revision,
  };
}

/** 脱敏任意配置对象（用于写入端点回执） */
export function redactConfigObject<T>(value: T): T {
  return redactValue(deepClone(value), '') as T;
}

export { REDACTED_SENTINEL };
