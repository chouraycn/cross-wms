/**
 * Zod 解析辅助 — 使用一致的错误处理包装 Schema 解析
 * 参考 openclaw/src/utils/zod-parse.ts
 */
import type { ZodType } from "zod";

/**
 * 面向 plugin 和 runtime 边界的 Null 返回 Zod 解析辅助。
 *
 * 调用方在希望忽略或恢复无效外部载荷而不构造和抛出校验错误时使用。
 */

/** 使用 Zod schema 安全校验未知值，校验失败返回 null */
export function safeParseWithSchema<T>(schema: ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** 解析 JSON 后用 Zod schema 安全校验，JSON 解析或 schema 校验失败均返回 null */
export function safeParseJsonWithSchema<T>(schema: ZodType<T>, raw: string): T | null {
  try {
    return safeParseWithSchema(schema, JSON.parse(raw));
  } catch {
    return null;
  }
}
