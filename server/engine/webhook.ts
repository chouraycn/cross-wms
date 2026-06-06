import crypto from 'crypto';
import { decrypt } from './crypto.js';

export interface WebhookSignature {
  timestamp: number;
  signature: string;
}

/**
 * 解析 X-CrossWMS-Signature 请求头
 * 输入格式：t=1750000000,s=a1b2c3d4...
 * @throws {Error} 格式错误时抛出
 */
export function parseSignatureHeader(header: string): WebhookSignature {
  const parts = header.split(',');
  let timestamp: number | undefined;
  let signature: string | undefined;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') {
      timestamp = Number(value);
    } else if (key === 's') {
      signature = value;
    }
  }

  if (timestamp === undefined || signature === undefined || isNaN(timestamp)) {
    throw new Error('Invalid signature header format');
  }

  return { timestamp, signature };
}

/**
 * 生成签名
 * 签名内容：{timestamp}.{request-body-json}
 * 算法：HMAC-SHA256，hex 编码
 */
export function generateSignature(secret: string, timestamp: number, body: string): string {
  const payload = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * 验证签名（不含时间戳检查）
 * 使用 crypto.timingSafeEqual() 防止时序攻击
 */
export function verifySignature(signatureHeader: string, secret: string, body: string): boolean {
  let parsed: WebhookSignature;
  try {
    parsed = parseSignatureHeader(signatureHeader);
  } catch {
    return false;
  }

  const expectedSig = generateSignature(secret, parsed.timestamp, body);
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  const actualBuf = Buffer.from(parsed.signature, 'hex');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * 解密并验证 Webhook 请求
 * - 解密 webhook_config.secret
 * - 检查时间戳是否在 ±300 秒内（防重放攻击）
 * - 调用 verifySignature() 验证签名
 */
export function authenticateWebhook(
  signatureHeader: string,
  body: string,
  encryptedSecretJson: string,
  encryptionKey: string,
): { valid: boolean; reason?: string } {
  // 1. 解析签名头（在解密前做，快速失败）
  let parsed: WebhookSignature;
  try {
    parsed = parseSignatureHeader(signatureHeader);
  } catch {
    return { valid: false, reason: 'invalid_signature_header' };
  }

  // 2. 检查时间戳容差（±300 秒）
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > 300) {
    return { valid: false, reason: 'timestamp_too_old' };
  }

  // 3. 解密 secret
  let secret: string;
  try {
    secret = decrypt(encryptedSecretJson, encryptionKey);
  } catch {
    return { valid: false, reason: 'decryption_failed' };
  }

  // 4. 验证签名
  const valid = verifySignature(signatureHeader, secret, body);
  if (!valid) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  return { valid: true };
}
