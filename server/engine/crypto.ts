import crypto from 'crypto';
import { initDb } from '../db.js';

const ENCRYPTION_KEY_SETTING = 'engine_encryption_key';
const KEY_LENGTH = 32; // 256-bit

/**
 * 生成 32-byte 随机密钥，返回 base64 编码字符串
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * AES-256-GCM 加密
 * @param plaintext - 明文
 * @param keyBase64 - base64 编码的 256-bit 密钥
 * @returns JSON 字符串：{ iv: base64, tag: base64, ciphertext: base64 }
 */
export function encrypt(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`);
  }

  const iv = crypto.randomBytes(12); // GCM 推荐 12-byte IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });
}

/**
 * AES-256-GCM 解密
 * @param encryptedJson - JSON 字符串：{ iv, tag, ciphertext }
 * @param keyBase64 - base64 编码的 256-bit 密钥
 * @returns 明文
 */
export function decrypt(encryptedJson: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`);
  }

  const { iv, tag, ciphertext } = JSON.parse(encryptedJson);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * 从 app_settings 表读取或生成加密密钥
 * - 若已存在，直接返回
 * - 若不存在，生成新密钥并存储到 app_settings 表
 * @returns base64 编码的 256-bit 密钥
 */
export function ensureEncryptionKey(): string {
  const db = initDb();

  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(ENCRYPTION_KEY_SETTING) as
    | { value: string }
    | undefined;

  if (row) {
    return row.value;
  }

  // 生成新密钥
  const newKey = generateEncryptionKey();
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?,?)').run(
    ENCRYPTION_KEY_SETTING,
    newKey,
  );

  return newKey;
}
