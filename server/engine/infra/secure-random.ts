// 提供安全的随机 ID 与有界随机数
import { randomBytes, randomInt, randomUUID } from "node:crypto";

/** 为运行时 ID 和缓存键生成加密安全的 UUID。 */
export function generateSecureUuid(): string {
  return randomUUID();
}

/** 从指定字节数生成 URL 安全的加密 token。 */
export function generateSecureToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

/** 从指定字节数生成十六进制编码的加密 token。 */
export function generateSecureHex(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

/** 返回 [0, 1) 范围内的加密安全小数。 */
export function generateSecureFraction(): number {
  return randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}

/** 生成 `[0, maxExclusive)` 范围内的加密安全整数。 */
export function generateSecureInt(maxExclusive: number): number;
/** 生成 `[minInclusive, maxExclusive)` 范围内的加密安全整数。 */
export function generateSecureInt(minInclusive: number, maxExclusive: number): number;
export function generateSecureInt(a: number, b?: number): number {
  return typeof b === "number" ? randomInt(a, b) : randomInt(a);
}
