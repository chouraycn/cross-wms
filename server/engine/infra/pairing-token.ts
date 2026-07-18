// 生成并验证 pairing bearer token。
import { randomBytes } from "node:crypto";
// 降级实现：openclaw 中从 ../security/secret-equal.js 导入，cross-wms 在 _openclaw-stubs 中提供。
import { safeEqualSecret } from "./_openclaw-stubs.js";

/** base64url 设备/节点/bootstrap bearer token 的随机字节长度 */
export const PAIRING_TOKEN_BYTES = 32;

/** 生成 URL 安全的 bearer token，用于配对与 bootstrap 流程 */
export function generatePairingToken(): string {
  return randomBytes(PAIRING_TOKEN_BYTES).toString("base64url");
}

/** 通过常量时间密钥比较验证非空 pairing token */
export function verifyPairingToken(provided: string, expected: string): boolean {
  if (provided.trim().length === 0 || expected.trim().length === 0) {
    return false;
  }
  return safeEqualSecret(provided, expected);
}
