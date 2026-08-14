/**
 * 企业微信回调消息加解密（官方算法）
 *
 * 文档: https://developer.work.weixin.qq.com/document/path/90930
 *
 * - 签名：msg_signature = sha1( 字典序排列 [token, timestamp, nonce, encrypt] 后拼接 )
 * - 加密：AES-256-CBC，key = base64_decode(EncodingAESKey + "=")（32 字节），
 *   iv = key 前 16 字节，PKCS7 填充
 * - 解密后的明文：16 随机字节 | 4 字节大端消息长度 | 消息体 | receiveId
 */
import { createHash, createDecipheriv, createCipheriv, randomBytes } from "node:crypto";

/** 校验企业微信回调签名（msg_signature） */
export function verifyWeComSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  msgSignature: string,
): boolean {
  const sorted = [token, timestamp, nonce, encrypt].sort();
  const hash = createHash("sha1").update(sorted.join("")).digest("hex");
  return hash === msgSignature;
}

/** 由 EncodingAESKey（43 位）派生 AES key（32 字节） */
function deriveAesKey(encodingAesKey: string): Buffer {
  // 官方 EncodingAESKey 为 43 位 base64（缺一个 = 号），补 "=" 后解码得 32 字节
  return Buffer.from(`${encodingAesKey}=`, "base64");
}

/** PKCS7 去填充 */
function pkcs7Unpad(data: Buffer): Buffer {
  if (data.length === 0) return data;
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 32) {
    throw new Error(`invalid PKCS7 padding byte: ${pad}`);
  }
  return data.subarray(0, data.length - pad);
}

/** PKCS7 填充 */
function pkcs7Pad(data: Buffer): Buffer {
  const blockSize = 32;
  const padLen = blockSize - (data.length % blockSize);
  const pad = Buffer.alloc(padLen, padLen);
  return Buffer.concat([data, pad]);
}

/** AES-256-CBC 解密（企业微信回调 Encrypt 字段） */
export function decryptWeComMessage(
  encodingAesKey: string,
  encrypt: string,
): { message: string; receiveId: string } {
  const key = deriveAesKey(encodingAesKey);
  const iv = key.subarray(0, 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypt, "base64")),
    decipher.final(),
  ]);
  const plain = pkcs7Unpad(decrypted);

  // 结构: 16 字节随机 | 4 字节大端长度 | 消息 | receiveId
  if (plain.length < 20) {
    throw new Error("decrypted payload too short");
  }
  const msgLen = plain.readUInt32BE(16);
  const message = plain.subarray(20, 20 + msgLen).toString("utf8");
  const receiveId = plain.subarray(20 + msgLen).toString("utf8");
  return { message, receiveId };
}

/** AES-256-CBC 加密（企业微信回调响应 / 测试往返用） */
export function encryptWeComMessage(
  encodingAesKey: string,
  message: string,
  receiveId: string,
): string {
  const key = deriveAesKey(encodingAesKey);
  const iv = key.subarray(0, 16);
  const random = randomBytes(16);
  const msgBuf = Buffer.from(message, "utf8");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(msgBuf.length, 0);
  const plain = pkcs7Pad(Buffer.concat([random, lengthBuf, msgBuf, Buffer.from(receiveId, "utf8")]));

  const cipher = createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return encrypted.toString("base64");
}

/** 计算加密消息的 msg_signature（用于回包 / 测试） */
export function signWeComEncrypt(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const sorted = [token, timestamp, nonce, encrypt].sort();
  return createHash("sha1").update(sorted.join("")).digest("hex");
}

/**
 * 完整校验并解密企业微信回调：
 * 校验 msg_signature → AES 解密 Encrypt 字段 → 返回明文 XML
 */
export function verifyAndDecryptWeComCallback(
  params: {
    token?: string;
    encodingAesKey?: string;
    timestamp: string;
    nonce: string;
    msgSignature: string;
    encrypt: string;
  },
): { ok: true; message: string; receiveId: string } | { ok: false; error: string } {
  const { token, encodingAesKey, timestamp, nonce, msgSignature, encrypt } = params;
  if (!token || !encodingAesKey) {
    return { ok: false, error: "回调未配置 token / encodingAesKey" };
  }
  if (!verifyWeComSignature(token, timestamp, nonce, encrypt, msgSignature)) {
    return { ok: false, error: "msg_signature 校验失败" };
  }
  try {
    const { message, receiveId } = decryptWeComMessage(encodingAesKey, encrypt);
    return { ok: true, message, receiveId };
  } catch (err) {
    return { ok: false, error: `AES 解密失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
