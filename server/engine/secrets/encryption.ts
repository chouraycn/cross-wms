/**
 * 加密模块
 *
 * 基于 AES-256-GCM 提供对称加密，支持：
 * - 密钥派生（PBKDF2 / HKDF）
 * - 密钥轮换（旧密钥解密 → 新密钥加密）
 * - 恒定时间比较（防时序攻击）
 *
 * 复用根目录 crypto.ts 的底层 ensureEncryptionKey 以保持与现有 secretsStore 的兼容。
 */

import crypto from 'crypto';
import { ensureEncryptionKey } from '../crypto.js';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_LENGTH = 16;

/** 加密载荷（JSON 序列化后存储） */
export interface EncryptedPayload {
  iv: string;
  tag: string;
  ct: string;
}

/**
 * 使用 PBKDF2 从口令派生密钥
 *
 * @param password - 主口令
 * @param salt - 盐值（可选，默认随机生成）
 * @returns base64 编码的 256-bit 密钥 + salt
 */
export function deriveKeyWithPbkdf2(
  password: string,
  salt?: Buffer,
): { keyBase64: string; saltBase64: string } {
  const saltBuffer = salt ?? crypto.randomBytes(PBKDF2_SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, saltBuffer, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  return {
    keyBase64: key.toString('base64'),
    saltBase64: saltBuffer.toString('base64'),
  };
}

/**
 * 使用 HKDF 从主密钥派生子密钥
 *
 * @param masterKeyBase64 - 主密钥（base64）
 * @param info - 上下文信息（如模块名）
 * @returns base64 编码的 256-bit 子密钥
 */
export function deriveKeyWithHkdf(masterKeyBase64: string, info: string): string {
  const masterKey = Buffer.from(masterKeyBase64, 'base64');
  const derived = crypto.hkdfSync('sha256', masterKey, '', info, KEY_LENGTH);
  return Buffer.from(derived).toString('base64');
}

/**
 * AES-256-GCM 加密
 *
 * @param plaintext - 明文
 * @param keyBase64 - base64 编码的 256-bit 密钥
 * @returns JSON 字符串：{ iv, tag, ct }
 */
export function encrypt(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`加密密钥长度错误：期望 ${KEY_LENGTH} 字节，实际 ${key.length}`);
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: encrypted.toString('base64'),
  };
  return JSON.stringify(payload);
}

/**
 * AES-256-GCM 解密
 *
 * @param encryptedJson - JSON 字符串：{ iv, tag, ct }
 * @param keyBase64 - base64 编码的 256-bit 密钥
 * @returns 明文
 */
export function decrypt(encryptedJson: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`解密密钥长度错误：期望 ${KEY_LENGTH} 字节，实际 ${key.length}`);
  }
  const payload = JSON.parse(encryptedJson) as EncryptedPayload;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ct, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * 密钥轮换：使用新密钥重新加密已有密文
 *
 * @param encryptedJson - 旧密钥加密的密文
 * @param oldKeyBase64 - 旧密钥
 * @param newKeyBase64 - 新密钥
 * @returns 新密钥加密的密文
 */
export function reencrypt(
  encryptedJson: string,
  oldKeyBase64: string,
  newKeyBase64: string,
): string {
  const plaintext = decrypt(encryptedJson, oldKeyBase64);
  return encrypt(plaintext, newKeyBase64);
}

/**
 * 生成新的 256-bit 随机密钥
 */
export function generateKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * 获取主加密密钥（复用现有 app_settings 存储的密钥）
 */
export function getMasterKey(): string {
  return ensureEncryptionKey();
}

/**
 * 恒定时间字符串比较 — 防止时序攻击
 *
 * 无论两个字符串是否相等，比较时间都相同。
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBytes = Buffer.from(a, 'utf8');
  const bBytes = Buffer.from(b, 'utf8');
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let result = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const aByte = i < aBytes.length ? aBytes[i] : 0;
    const bByte = i < bBytes.length ? bBytes[i] : 0;
    result |= aByte ^ bByte;
  }
  return result === 0;
}

/**
 * 计算字符串的香农熵（用于高熵字符串检测）
 */
export function shannonEntropy(value: string): number {
  if (!value || value.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of value) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const len = value.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
