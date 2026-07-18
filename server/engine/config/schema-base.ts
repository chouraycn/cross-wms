/**
 * 基础 schema 构建块 — 提供通用的 zod 类型定义
 *
 * 参考 openclaw/src/config/schema-base.ts，为 cross-wms 配置体系提供
 * 可复用的基础类型（端口号、URL、文件路径、正整数、日志级别等）。
 */

import { z } from 'zod';

/** 被拒绝的对象键（防止原型链污染） */
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** 端口号：1 ~ 65535 的整数 */
export const portNumber = z
  .number()
  .int()
  .min(1, '端口号不能小于 1')
  .max(65535, '端口号不能大于 65535');

/** 通用 URL 字符串 */
export const url = z.string().url('请输入合法的 URL');

/** HTTP/HTTPS URL，协议必须为 http: 或 https: */
export const httpUrl = z
  .string()
  .url('请输入合法的 URL')
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'URL 协议必须为 http:// 或 https://');

/** 文件路径：非空字符串 */
export const filePath = z.string().min(1, '文件路径不能为空');

/** 正整数 */
export const positiveInt = z.number().int().positive('必须为正整数');

/** 非负整数 */
export const nonNegativeInt = z.number().int().nonnegative('不能为负数');

/** 正数（允许小数） */
export const positiveNumber = z.number().positive('必须为正数');

/** 非负数（允许小数） */
export const nonNegativeNumber = z.number().nonnegative('不能为负数');

/** 日志级别枚举 */
export const logLevel = z.enum(['debug', 'info', 'warn', 'error']);

/** 完整日志级别枚举（包含 silent/fatal/trace） */
export const extendedLogLevel = z.enum([
  'silent',
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
]);

/** 持续时长（毫秒），非负整数 */
export const durationMs = z.number().int().nonnegative('持续时长不能为负数');

/** 字节大小，正整数 */
export const byteSize = z.number().int().positive('字节大小必须为正数');

/** 十六进制颜色值，如 #ff6600 */
export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '颜色值格式应为 #rrggbb（如 #ff6600）');

/** 密钥输入：支持明文字符串或环境变量引用对象 */
export const secretInput = z.union([
  z.string().min(1, '密钥值不能为空'),
  z
    .object({
      ref: z.string().min(1, '环境变量引用名不能为空'),
    })
    .strict(),
]);

/** 安全的对象键名：拒绝原型链污染键 */
export const safeObjectKey = z
  .string()
  .refine((key) => !BLOCKED_OBJECT_KEYS.has(key), '不允许的键名（可能引发原型链污染）');

/** 字符串数组 */
export const stringArray = z.array(z.string());

/** 布尔值，带可选默认值 */
export const booleanField = z.boolean();

/** 主机地址：IP 或域名 */
export const hostAddress = z
  .string()
  .min(1, '主机地址不能为空')
  .refine((value) => {
    // 允许 IP 地址、域名、localhost
    return (
      value === 'localhost' ||
      value === '0.0.0.0' ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(value) ||
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(value)
    );
  }, '主机地址格式不合法');

/**
 * 基础 schema 类型集合
 *
 * 将所有基础类型聚合为一个对象，方便按需引用。
 */
export const baseSchemaTypes = {
  portNumber,
  url,
  httpUrl,
  filePath,
  positiveInt,
  nonNegativeInt,
  positiveNumber,
  nonNegativeNumber,
  logLevel,
  extendedLogLevel,
  durationMs,
  byteSize,
  hexColor,
  secretInput,
  safeObjectKey,
  stringArray,
  booleanField,
  hostAddress,
} as const;

export type BaseSchemaTypes = typeof baseSchemaTypes;
