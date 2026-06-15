/**
 * Credential Service — AES-256-GCM 凭证加密服务
 *
 * v3.0: 提供凭证的加密/解密能力
 * - 使用 AES-256-GCM 对称加密
 * - Master Key 存储于 ~/.cdf-know-clow/.master.key（0600 权限）
 * - 首次使用自动生成 32 字节随机 Key
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const KEY_DIR = path.join(os.homedir(), '.cdf-know-clow');
const KEY_FILE = path.join(KEY_DIR, '.master.key');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * 获取或创建 Master Key。
 * 如果 key 文件存在则读取，否则生成新 key 并保存（0600 权限）。
 */
function getOrCreateMasterKey(): Buffer {
  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  if (!fs.existsSync(KEY_DIR)) {
    fs.mkdirSync(KEY_DIR, { recursive: true });
  }
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

let masterKey: Buffer | null = null;

/**
 * 加密凭证明文。
 *
 * @param plaintext 待加密的明文字符串
 * @returns { encrypted, iv } — encrypted 包含密文 + auth tag（hex 拼接）
 */
export function encryptCredential(plaintext: string): { encrypted: string; iv: string } {
  if (!masterKey) masterKey = getOrCreateMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  // 将 auth tag 追加到密文末尾（各 32 hex chars = 16 bytes）
  return { encrypted: encrypted + tag.toString('hex'), iv: iv.toString('hex') };
}

/**
 * 解密凭证密文。
 *
 * @param encrypted 密文 + auth tag（hex 拼接，最后 32 hex chars 是 tag）
 * @param iv 初始化向量（hex 字符串）
 * @returns 解密后的明文字符串
 */
export function decryptCredential(encrypted: string, iv: string): string {
  if (!masterKey) masterKey = getOrCreateMasterKey();
  const ivBuf = Buffer.from(iv, 'hex');
  // 最后 32 hex chars 是 auth tag (16 bytes)
  const tagHex = encrypted.slice(-32);
  const dataHex = encrypted.slice(0, -32);
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, ivBuf);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(dataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
