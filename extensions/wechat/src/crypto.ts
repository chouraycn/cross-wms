/**
 * 微信公众号回调消息加解密
 *
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Interface_field_description.html
 *
 * - 明文模式：signature = sha1( 字典序 [token, timestamp, nonce] 拼接 )
 * - 安全模式：signature = sha1( 字典序 [token, timestamp, nonce, encrypt] 拼接 )
 * - 加密：AES-256-CBC，key = base64_decode(EncodingAESKey + "=")（32 字节），
 *   iv = key 前 16 字节，PKCS7 填充；明文 = 16 随机 | 4 字节大端长度 | 消息 | AppID
 */
import { createHash, createDecipheriv, createCipheriv, randomBytes } from "node:crypto";

/** 校验公众号回调签名（自动兼容明文/安全模式：encrypt 为空时按明文模式验签） */
export function verifyWeChatSignature(
  token: string,
  timestamp: string,
  nonce: string,
  signature: string,
  encrypt?: string,
): boolean {
  const parts = encrypt ? [token, timestamp, nonce, encrypt] : [token, timestamp, nonce];
  const sorted = parts.sort();
  const hash = createHash("sha1").update(sorted.join("")).digest("hex");
  return hash === signature;
}

/** 由 EncodingAESKey（43 位）派生 AES key（32 字节） */
function deriveAesKey(encodingAesKey: string): Buffer {
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

/** AES-256-CBC 解密（公众号安全模式 Encrypt 字段 / echostr） */
export function decryptWeChatMessage(
  encodingAesKey: string,
  encrypt: string,
): { message: string; appId: string } {
  const key = deriveAesKey(encodingAesKey);
  const iv = key.subarray(0, 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypt, "base64")),
    decipher.final(),
  ]);
  const plain = pkcs7Unpad(decrypted);

  if (plain.length < 20) {
    throw new Error("decrypted payload too short");
  }
  const msgLen = plain.readUInt32BE(16);
  const message = plain.subarray(20, 20 + msgLen).toString("utf8");
  const appId = plain.subarray(20 + msgLen).toString("utf8");
  return { message, appId };
}

/** AES-256-CBC 加密（安全模式响应 / 测试往返用） */
export function encryptWeChatMessage(
  encodingAesKey: string,
  message: string,
  appId: string,
): string {
  const key = deriveAesKey(encodingAesKey);
  const iv = key.subarray(0, 16);
  const random = randomBytes(16);
  const msgBuf = Buffer.from(message, "utf8");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(msgBuf.length, 0);
  const plain = pkcs7Pad(Buffer.concat([random, lengthBuf, msgBuf, Buffer.from(appId, "utf8")]));

  const cipher = createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return encrypted.toString("base64");
}

/** 计算安全模式签名（测试/回包用） */
export function signWeChatEncrypt(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const sorted = [token, timestamp, nonce, encrypt].sort();
  return createHash("sha1").update(sorted.join("")).digest("hex");
}

/**
 * 完整校验并解密公众号回调：
 * 校验 signature（自动识别是否含 encrypt）→ AES 解密 → 返回明文
 */
export function verifyAndDecryptWeChatCallback(
  params: {
    token?: string;
    encodingAesKey?: string;
    timestamp: string;
    nonce: string;
    signature: string;
    encrypt?: string;
  },
): { ok: true; message: string; appId: string; encrypted: boolean } | { ok: false; error: string } {
  const { token, encodingAesKey, timestamp, nonce, signature, encrypt } = params;
  if (!token) {
    return { ok: false, error: "回调未配置 token" };
  }
  if (!verifyWeChatSignature(token, timestamp, nonce, signature, encrypt)) {
    return { ok: false, error: "signature 校验失败" };
  }
  // 明文模式：直接返回 XML
  if (!encrypt) {
    return { ok: true, message: "", appId: "", encrypted: false };
  }
  if (!encodingAesKey) {
    return { ok: false, error: "安全模式回调需要配置 encodingAesKey" };
  }
  try {
    const { message, appId } = decryptWeChatMessage(encodingAesKey, encrypt);
    return { ok: true, message, appId, encrypted: true };
  } catch (err) {
    return { ok: false, error: `AES 解密失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
