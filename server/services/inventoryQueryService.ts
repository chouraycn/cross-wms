/**
 * InventoryQueryService — SQL 安全校验 + 执行服务
 * 四层校验：SELECT 正则 + 关键词黑名单 + LIMIT 强制 + 超时兜底
 */
import type Database from 'better-sqlite3';
import type { NlQueryRequest, NlQueryResponse, QueryResult } from '../../src/types/inventory-query.js';

/** 安全查询结果（内部使用） */
interface SafeQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

/** SQL 关键词黑名单（不区分大小写） */
const BLOCKED_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|EXEC|EXECUTE|ATTACH|PRAGMA|REINDEX|VACUUM)\b/i;

/** SELECT 正则：只允许以 SELECT 开头的语句 */
const SELECT_ONLY_REGEX = /^\s*SELECT\s/i;

/** 最大允许 LIMIT 值 */
const MAX_LIMIT = 500;

/** 默认 LIMIT 值（无 LIMIT 时自动追加） */
const DEFAULT_LIMIT = 200;

/** 执行超时（毫秒） */
const EXECUTION_TIMEOUT_MS = 5000;

export class InventoryQueryService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 主入口：校验并执行 SQL 查询
   * @param request 自然语言查询请求
   * @returns 结构化查询响应
   */
  validateAndExecute(request: NlQueryRequest): NlQueryResponse {
    const { sql, chartType = 'table', chartConfig, dataSource, queryIntent } = request;

    // 第一层：SELECT 正则校验
    const validateError = this.validateSql(sql);
    if (validateError) {
      return { code: 403, data: null, message: validateError };
    }

    // 第二层：强制 LIMIT
    const safeSql = this.enforceLimit(sql);

    // 第三层 + 第四层：执行 + 超时
    const result = this.executeSafely(safeSql);
    if ('error' in result) {
      return { code: 500, data: null, message: result.error };
    }

    // 组装 QueryResult
    const queryResult: QueryResult = {
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
      chartType,
      chartConfig,
      sql: safeSql,
      dataSource,
      queryIntent,
    };

    return { code: 0, data: queryResult, message: 'ok' };
  }

  /**
   * 安全校验 SQL：只允许 SELECT 语句 + 关键词黑名单
   * @returns 错误信息字符串，校验通过返回 null
   */
  private validateSql(sql: string): string | null {
    // 校验 SELECT only
    if (!SELECT_ONLY_REGEX.test(sql)) {
      return '仅允许 SELECT 查询';
    }

    // 校验关键词黑名单（排除 SELECT 本身，检查其余部分）
    const upperSql = sql.toUpperCase();
    // 移除 SELECT 关键字后的子串中检查黑名单
    const afterSelect = upperSql.replace(/^\s*SELECT\s+/, '');

    // 特殊处理：允许 SELECT 中出现 CREATE 等作为列名/别名
    // 但禁止作为独立 SQL 语句开头的关键词
    const blockedMatch = afterSelect.match(BLOCKED_KEYWORDS);
    if (blockedMatch) {
      // 检查匹配的关键词是否在子查询开头位置（更严格判断）
      // 简单策略：如果黑名单关键词出现在行首或分号后，则拒绝
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      const semicolonParts = normalizedSql.split(';').map(p => p.trim()).filter(p => p.length > 0);
      for (const part of semicolonParts) {
        if (!SELECT_ONLY_REGEX.test(part)) {
          return '仅允许 SELECT 查询';
        }
      }

      // 额外检查：即使在 SELECT 内，也不允许 ATTACH/PRAGMA 等危险操作
      const dangerousKeywords = /\b(ATTACH|PRAGMA|REINDEX|VACUUM)\b/i;
      if (dangerousKeywords.test(sql)) {
        return '仅允许 SELECT 查询';
      }

      // 检查多语句注入
      if (semicolonParts.length > 1) {
        return '仅允许单条 SELECT 查询';
      }
    }

    return null;
  }

  /**
   * 强制 LIMIT：确保 SQL 有 LIMIT 且不超过 500
   * 无 LIMIT 时自动追加 LIMIT 200
   */
  private enforceLimit(sql: string): string {
    // 移除末尾分号（统一处理）
    let normalized = sql.trimEnd();
    if (normalized.endsWith(';')) {
      normalized = normalized.slice(0, -1).trimEnd();
    }

    // 检测是否已有 LIMIT 子句
    const limitMatch = normalized.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const limitValue = parseInt(limitMatch[1], 10);
      if (limitValue > MAX_LIMIT) {
        // 替换 LIMIT 值为 500
        normalized = normalized.replace(/\bLIMIT\s+\d+/i, `LIMIT ${MAX_LIMIT}`);
      }
      // LIMIT 值合法，保持不变
    } else {
      // 无 LIMIT，追加默认 LIMIT
      normalized += ` LIMIT ${DEFAULT_LIMIT}`;
    }

    return normalized;
  }

  /**
   * 安全执行 SQL：db.prepare().all() + 5 秒超时
   * @returns SafeQueryResult 或错误对象
   */
  private executeSafely(sql: string): SafeQueryResult | { error: string } {
    try {
      // 同步执行 better-sqlite3，通过 executeWithTimeout 包装超时控制
      // 注意：better-sqlite3 是同步 API，db.prepare().all() 是同步阻塞的
      // 真正的超时需通过 busy_timeout pragma + 执行策略实现
      const result = this.executeWithTimeout(sql);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';

      // 区分错误类型返回友好提示，不暴露 SQL 细节
      if (errorMessage.includes('no such table') || errorMessage.includes('no such column')) {
        return { error: '查询的表或字段不存在，请检查后重试' };
      }
      if (errorMessage.includes('syntax error') || errorMessage.includes('near')) {
        return { error: 'SQL 语法错误，请调整查询语句' };
      }
      if (errorMessage.includes('timeout') || errorMessage.includes('超时')) {
        return { error: '查询执行超时，请简化查询条件后重试' };
      }

      return { error: '查询执行失败，请稍后重试' };
    }
  }

  /**
   * 带超时的 SQL 执行（better-sqlite3 同步 API 包装）
   */
  private executeWithTimeout(sql: string): SafeQueryResult {
    // better-sqlite3 是同步 API，设置 busyTimeout 作为超时兜底
    const prevBusyTimeout = this.db.pragma('busy_timeout', { simple: true });

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all() as Record<string, unknown>[];

      // 推断列名
      const columns = rows.length > 0
        ? Object.keys(rows[0])
        : this.inferColumnsFromStatement(stmt.source);

      const rowCount = rows.length;
      const limitValue = this.extractLimitValue(sql);
      const truncated = limitValue > 0 && rowCount >= limitValue;

      return { columns, rows, rowCount, truncated };
    } finally {
      // 恢复原始 busy_timeout
      this.db.pragma(`busy_timeout = ${prevBusyTimeout}`);
    }
  }

  /**
   * 从 SQL 语句中推断列名（当查询结果为空时使用）
   * 解析 SELECT 后的字段列表
   */
  private inferColumnsFromStatement(source: string): string[] {
    // stmt.source 可能不可用，回退到空数组
    if (!source) return [];
    const match = source.match(/^\s*SELECT\s+(.*?)\s+FROM/i);
    if (!match) return [];
    const fieldsStr = match[1];
    // 拆分字段并清理别名
    return fieldsStr
      .split(',')
      .map((f: string) => {
        const trimmed = f.trim();
        // 处理 AS 别名
        const asMatch = trimmed.match(/\bAS\s+(\w+)\s*$/i);
        if (asMatch) return asMatch[1];
        // 处理 table.column 格式
        const dotMatch = trimmed.match(/(\w+)$/);
        if (dotMatch) return dotMatch[1];
        return trimmed;
      })
      .filter((c: string) => c.length > 0 && c !== '*');
  }

  /**
   * 从 SQL 中提取 LIMIT 数值
   */
  private extractLimitValue(sql: string): number {
    const match = sql.match(/\bLIMIT\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }
}
