/**
 * validateRow<T> —— 类型信任边界工具（DAO / Routes 入口做运行时 shape 校验）
 *
 * 解决问题：
 *   旧代码：const rows = await db.all(sql) as unknown as SessionRow[];
 *              ↑ 直接相信 DB 返回，一旦 schema 漂移立刻 data-corruption
 *   新代码：const rows = validateRows(await db.all(sql), zSessionRow, 'sessionsDao.listSessions');
 *              ↑ zod 校验失败会结构化抛错，记录 table + op，便于定位
 *
 * 分层建议：
 *   - server/routes/*      请求入参 zod 校验后再 handler
 *   - server/dao/*         SQL 结果 zod 校验后再 return
 *   - server/engine/*      不允许 as any；输入均来自上一层，已验证
 */

import { z, type ZodType } from 'zod';

// ============================================================
// 1) Core: validateRow / validateRows
// ============================================================

export class ValidationBoundaryError extends Error {
  override name = 'ValidationBoundaryError';
  constructor(
    public readonly boundary: string,
    public readonly zodIssues: z.ZodIssue[],
  ) {
    const top = zodIssues.slice(0, 3).map(i => `  - [${i.path.join('.')}] ${i.message}`).join('\n');
    const more = zodIssues.length > 3 ? `\n  ... (+${zodIssues.length - 3} more issues)` : '';
    super(
      `[ValidationBoundary] ${boundary} failed, ${zodIssues.length} issue(s):\n${top}${more}`,
    );
    // Node Error cause 协议 — 日志系统可展示结构化 issues
    (this as unknown as { cause: any }).cause = { boundary, zodIssues };
  }
}

/**
 * 校验单条数据（DAO 返回单例、config 解析等场景）。
 * 通过 → 返回类型为 T 的数据；失败 → 抛 ValidationBoundaryError
 */
export function validateRow<T>(
  raw: any,
  schema: ZodType<T>,
  boundary: string,
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data as T;
  throw new ValidationBoundaryError(boundary, result.error.issues);
}

/**
 * 校验数组形式（DB .all() / SSE 批量消息等场景）。
 * 相比 Array(schema) 手动 map，这里能给出更精确的索引定位。
 */
export function validateRows<T>(
  raw: any,
  schema: ZodType<T>,
  boundary: string,
): T[] {
  if (!Array.isArray(raw)) {
    throw new ValidationBoundaryError(
      boundary,
      [
        {
          code: z.ZodIssueCode.custom,
          path: [],
          message: `Expected array, got ${raw === null ? 'null' : typeof raw}`,
        },
      ],
    );
  }
  // 不用 z.array() 包一层（兼容 zod v3/v4 泛型差异），逐元素调 validateRow
  // 并在 error 里附上 index 信息
  const out: T[] = [];
  const allIssues: z.ZodIssue[] = [];
  raw.forEach((item, i) => {
    try {
      out.push(validateRow<T>(item, schema, `${boundary}[${i}]`));
    } catch (err) {
      if (err instanceof ValidationBoundaryError) {
        allIssues.push(
          ...err.zodIssues.map((issue) => ({
            ...issue,
            path: [i, ...issue.path],
          })),
        );
      } else {
        throw err;
      }
    }
  });
  if (allIssues.length > 0) {
    throw new ValidationBoundaryError(boundary, allIssues);
  }
  return out;
}

// ============================================================
// 2) 常用便捷 schema 片段
// ============================================================

/** 数据库 INTEGER 主键 — 兼容 number / bigint / string(数字) → 返回 number */
export const zIntId = z.union([z.number().int(), z.string(), z.bigint()]).transform(v => {
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new z.ZodError([
      { code: z.ZodIssueCode.custom, path: [], message: `Invalid int id: ${String(v)}` },
    ]);
  }
  return n;
});

/** 可空 TEXT 列 → 空字符串统一为 undefined，避免 DB '' 与 NULL 语义混乱 */
export const zNullableText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform(v => (v == null || v.length === 0 ? undefined : v));

/** ISO 8601 或 epoch ms → Date；兼容 SQLite 默认返回字符串 */
export const zDateLike = z
  .union([z.date(), z.string(), z.number().int(), z.null(), z.undefined()])
  .transform(v => {
    if (v == null) return undefined;
    if (v instanceof Date) return v;
    const d = new Date(typeof v === 'number' ? v : v);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  });

// zDateLike parse 输出类型（兼容 TS 未推导 pipe innerType 字段名的新旧 zod 版本）
export type DateLike = z.infer<typeof zDateLike>;

// ============================================================
// 3) 便捷：构造边界描述字符串
// ============================================================
export function boundary(table: string, operation: string): string {
  return `${table}.${operation}`;
}
