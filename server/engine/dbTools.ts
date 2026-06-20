/**
 * DB Tools — 数据库查询与 WMS 库存操作
 */

/** 查询 SQLite 数据库（安全限制：仅允许 SELECT 语句） */
export async function handleDbQuery(args: Record<string, unknown>): Promise<string> {
  const { initDb } = await import('../db.js');
  const sql = String(args.sql || '').trim();

  // 安全检查：仅允许 SELECT 语句
  const normalizedSql = sql.toUpperCase().replace(/\s+/g, ' ');
  if (!normalizedSql.startsWith('SELECT')) {
    return JSON.stringify({ error: '安全限制：仅允许 SELECT 查询语句。不允许 INSERT/UPDATE/DELETE/DROP 等写操作。' });
  }

  // 禁止危险关键字（即使伪装在子查询中）
  const dangerousPatterns = [
    /\bDROP\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bUPDATE\b/i,
    /\bALTER\b/i, /\bCREATE\b/i, /\bGRANT\b/i, /\bREVOKE\b/i,
    /\bATTACH\b/i, /\bDETACH\b/i, /\bPRAGMA\b/i,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      return JSON.stringify({ error: `安全限制：SQL 中包含不允许的关键字 '${pattern.source}'。` });
    }
  }

  // 限制结果行数，防止大量数据消耗 token
  const limitedSql = normalizedSql.includes('LIMIT') ? sql : `${sql} LIMIT 100`;

  try {
    const db = initDb();
    const results = db.prepare(limitedSql).all();
    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify({ error: `查询失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 获取 WMS 库存概览 */
export async function handleWmsInventory(): Promise<string> {
  const { initDb } = await import('../db.js');
  try {
    const db = initDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM inventory').get() as { count: number };
    const warehouses = db.prepare('SELECT COUNT(DISTINCT warehouse_id) as count FROM inventory').get() as { count: number };
    const lowStock = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE quantity < safety_stock').get() as { count: number };
    return JSON.stringify({ totalItems: total.count, warehouseCount: warehouses.count, lowStockItems: lowStock.count });
  } catch (e) {
    return JSON.stringify({ error: `查询失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}
