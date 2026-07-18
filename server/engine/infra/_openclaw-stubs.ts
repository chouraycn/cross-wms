/**
 * 本地 stub 与降级实现 — 为移植自 openclaw 的工具模块提供 @openclaw/* 包外部依赖的占位实现。
 *
 * 设计原则：
 *  - 纯类型/常量/简单函数的 stub 直接实现
 *  - 涉及文件系统/网络/锁的复杂 stub 抛出明确错误，避免静默失败
 *  - 所有 stub 都加注释说明降级原因
 *
 * 参考 openclaw/packages/{normalization-core,net-policy,shared,fs-safe}
 */

import { timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizeOptionalString } from "./string-coerce.js";

// ============================================================================
// @openclaw/normalization-core/string-coerce —— 补充 cross-wms 缺失的导出
// ============================================================================

/**
 * 将任意输入规范化为已去除首尾空白的字符串，输入无效时返回 null（而非 undefined）。
 * 与 normalizeOptionalString 行为一致，仅返回类型不同，用于兼容 openclaw 调用方。
 */
export function normalizeNullableString(value: unknown): string | null {
  return normalizeOptionalString(value) ?? null;
}

// ============================================================================
// @openclaw/net-policy/ip —— CIDR 匹配
// ============================================================================

/**
 * 判断 IP 是否在指定 CIDR 范围内。
 *
 * 降级实现：仅支持 IPv4，IPv6 始终返回 false。
 * 复杂的 net-policy 包未移植，这里提供足以满足 tailnet 检测的最小实现。
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (typeof ip !== "string" || typeof cidr !== "string") {
    return false;
  }
  const slashIndex = cidr.indexOf("/");
  if (slashIndex < 0) {
    return ip === cidr;
  }
  const network = cidr.slice(0, slashIndex);
  const prefixBits = Number.parseInt(cidr.slice(slashIndex + 1), 10);
  if (!Number.isFinite(prefixBits) || prefixBits < 0 || prefixBits > 32) {
    return false;
  }
  if (ip.includes(":") || network.includes(":")) {
    // IPv6 不在 stub 实现范围内
    return false;
  }
  const ipParts = ip.split(".").map((part) => Number.parseInt(part, 10));
  const netParts = network.split(".").map((part) => Number.parseInt(part, 10));
  if (ipParts.length !== 4 || netParts.length !== 4) {
    return false;
  }
  if (ipParts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return false;
  }
  if (netParts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return false;
  }
  const ipInt =
    (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const netInt =
    (netParts[0] << 24) | (netParts[1] << 16) | (netParts[2] << 8) | netParts[3];
  const mask = prefixBits === 0 ? 0 : (0xffffffff << (32 - prefixBits)) >>> 0;
  return (ipInt >>> 0) === ((ipInt & mask) >>> 0) && (netInt & mask) === (ipInt & mask);
}

// ============================================================================
// @openclaw/shared/global-singleton —— 进程级单例
// ============================================================================

/**
 * 解析进程级单例：相同 key 返回同一实例。
 *
 * 降级实现：使用 globalThis 缓存，确保跨模块图共享同一实例。
 * 用于避免重复初始化 warning filter 等单例资源。
 */
export function resolveGlobalSingleton<T>(key: symbol, factory: () => T): T {
  const existing = (globalThis as Record<PropertyKey, unknown>)[key];
  if (existing !== undefined) {
    return existing as T;
  }
  const value = factory();
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: false,
    value,
    writable: false,
  });
  return value;
}

// ============================================================================
// ../utils.js —— CONFIG_DIR 与 ensureDir 占位
// ============================================================================

/** cross-wms 配置目录占位（openclaw 的 ../utils.js 中导出） */
export const CONFIG_DIR: string = process.env.OPENCLAW_CONFIG_DIR
  ? path.resolve(process.env.OPENCLAW_CONFIG_DIR)
  : path.join(os.homedir(), ".openclaw");

/** 递归创建目录（openclaw 的 ../utils.js 中导出） */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// ============================================================================
// ../security/secret-equal.js —— 常量时间字符串比较
// ============================================================================

/**
 * 常量时间字符串比较，防止时序侧信道攻击。
 *
 * 降级实现：使用 Node 内置 crypto.timingSafeEqual，与 openclaw 行为一致。
 */
export function safeEqualSecret(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
