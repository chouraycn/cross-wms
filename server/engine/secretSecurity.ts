/**
 * 密钥安全模块
 *
 * 包含两部分：
 * A. 恒定时间字符串比较 — 防止时序攻击
 * B. SecretInput 双模式 — 支持明文（plaintext）与引用（ref）两种密钥输入模式
 */

import { logger } from '../logger.js';
import type { SecretRef } from './secretsTypes.js';

// ===================== A. 恒定时间比较 =====================

/**
 * 恒定时间字符串比较 — 防止时序攻击
 *
 * 无论两个字符串是否相等，比较时间都相同。
 * 即使长度不同也做完整比较以避免长度泄露。
 *
 * @param a - 字符串 A
 * @param b - 字符串 B
 * @returns 是否相等
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const aBytes = Buffer.from(a, 'utf8');
  const bBytes = Buffer.from(b, 'utf8');

  if (aBytes.length !== bBytes.length) {
    // 即使长度不同也做完整比较以避免长度泄露
    const maxLen = Math.max(aBytes.length, bBytes.length);
    let result = 0;
    for (let i = 0; i < maxLen; i++) {
      const aByte = i < aBytes.length ? aBytes[i] : 0;
      const bByte = i < bBytes.length ? bBytes[i] : 0;
      result |= aByte ^ bByte;
    }
    return false; // 长度不同一定不相等
  }

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

// ===================== B. SecretInput 双模式 =====================

/** 密钥字符串解析模式 */
export type SecretInputStringResolutionMode = 'plaintext' | 'ref';

/** 密钥字符串解析 */
export interface SecretInputStringResolution {
  /** 解析模式 */
  mode: SecretInputStringResolutionMode;
  /** 明文模式时的值 */
  value?: string;
  /** 引用模式时的引用 */
  ref?: SecretRef;
}

/** 密钥输入（支持明文与引用双模式） */
export interface SecretInput {
  /** 密钥类型 */
  type?: 'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other';
  /** 字符串解析 */
  resolution: SecretInputStringResolution;
}

/**
 * 检测是否配置了密钥。
 *
 * 满足以下任一条件即为已配置：
 * - 明文模式且 value 非空
 * - 引用模式且 ref 存在
 */
export function hasConfiguredSecretInput(
  input: SecretInput | undefined | null,
): boolean {
  if (!input || !input.resolution) return false;
  const { mode, value, ref } = input.resolution;
  if (mode === 'plaintext') {
    return typeof value === 'string' && value.length > 0;
  }
  if (mode === 'ref') {
    return !!ref && !!ref.key;
  }
  return false;
}

/**
 * 检测是否是明文密钥。
 */
export function hasConfiguredPlaintextSecretValue(
  input: SecretInput | undefined | null,
): boolean {
  if (!input || !input.resolution) return false;
  const { mode, value } = input.resolution;
  return mode === 'plaintext' && typeof value === 'string' && value.length > 0;
}

/**
 * 检测是否是 SecretRef（引用模式）。
 */
export function isSecretRef(
  input: SecretInput | undefined | null,
): boolean {
  if (!input || !input.resolution) return false;
  return input.resolution.mode === 'ref' && !!input.resolution.ref;
}

/**
 * 强制转换字符串为 SecretInput（字符串视为明文）。
 * 如果输入已经是 SecretInput 则原样返回。
 *
 * @param value - 字符串、SecretInput 或 undefined
 * @returns SecretInput 或 undefined
 */
export function coerceSecretRef(
  value: string | SecretInput | undefined,
): SecretInput | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    return {
      resolution: {
        mode: 'plaintext',
        value,
      },
    };
  }
  return value;
}

/**
 * 规范化 SecretInput。
 * - 字符串视为明文模式
 * - SecretInput 原样规范化（去除空白字段）
 *
 * @param input - SecretInput、字符串或 undefined
 * @returns 规范化后的 SecretInput 或 undefined
 */
export function normalizeSecretInput(
  input: SecretInput | string | undefined,
): SecretInput | undefined {
  if (input === undefined) return undefined;

  // 字符串 → 明文模式
  if (typeof input === 'string') {
    const trimmed = normalizeResolvedSecretInputString(input);
    if (trimmed.length === 0) return undefined;
    return {
      resolution: {
        mode: 'plaintext',
        value: trimmed,
      },
    };
  }

  // 已经是 SecretInput — 规范化
  if (!input.resolution) {
    logger.warn('[secretSecurity] normalizeSecretInput: resolution 缺失');
    return undefined;
  }

  const { mode, value, ref } = input.resolution;

  if (mode === 'plaintext') {
    const normalized = normalizeResolvedSecretInputString(value ?? '');
    if (normalized.length === 0) return undefined;
    return {
      ...input,
      resolution: {
        mode: 'plaintext',
        value: normalized,
      },
    };
  }

  if (mode === 'ref') {
    if (!ref || !ref.key) {
      logger.warn('[secretSecurity] normalizeSecretInput: ref 模式但 ref/key 缺失');
      return undefined;
    }
    return {
      ...input,
      resolution: {
        mode: 'ref',
        ref: {
          ...ref,
          key: ref.key,
        },
      },
    };
  }

  logger.warn(`[secretSecurity] normalizeSecretInput: 未知 mode ${mode}`);
  return undefined;
}

/**
 * 规范化解析后的字符串。
 * - 去除首尾空白
 * - 不修改内部内容
 *
 * @param value - 待规范化的字符串
 * @returns 规范化后的字符串
 */
export function normalizeResolvedSecretInputString(value: string): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * 构建可选的 SecretInput schema（简化版，不依赖 zod）。
 *
 * 解析规则：
 * - undefined / null → undefined
 * - 空字符串 → undefined
 * - 字符串 → 明文模式 SecretInput
 * - 对象 → 规范化为 SecretInput
 *
 * @returns 包含 parse 方法的 schema 对象
 */
export function buildOptionalSecretInputSchema(): {
  parse: (value: unknown) => SecretInput | undefined;
} {
  return {
    parse: (value: unknown): SecretInput | undefined => {
      if (value === undefined || value === null) return undefined;

      if (typeof value === 'string') {
        const trimmed = normalizeResolvedSecretInputString(value);
        if (trimmed.length === 0) return undefined;
        return {
          resolution: {
            mode: 'plaintext',
            value: trimmed,
          },
        };
      }

      if (typeof value === 'object') {
        const obj = value as Partial<SecretInput>;
        return normalizeSecretInput(obj as SecretInput);
      }

      return undefined;
    },
  };
}
