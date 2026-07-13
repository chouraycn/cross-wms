/**
 * wms_stock_query — 库存查询（原生可执行入口）
 *
 * 调用方式：skill_wms_stock_query({ sku?, warehouse?, location? })
 *
 * 执行策略：
 * 1. 提供 sku → 走 db_query 精确检索该物料全部库存记录；
 * 2. 否则 → wms_inventory 概览 + 低库存清单（db_query）。
 *
 * 仅通过 ctx.tools.run 调用内置工具，不依赖任何 server 内部模块，可随技能目录迁移。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    const sku = params.sku ? String(params.sku) : '';
    const warehouse = params.warehouse ? String(params.warehouse) : '';

    // 1) 按 SKU 精确检索
    if (sku) {
      const safeSku = sku.replace(/'/g, "''");
      const sql =
        `SELECT sku, name, warehouse_id, quantity, locked_quantity, ` +
        `in_transit_quantity, safety_stock FROM inventory ` +
        `WHERE sku LIKE '%${safeSku}%' LIMIT 100`;
      const raw = await ctx.tools.run('db_query', { sql });
      const parsed = safeJson(raw);
      if (parsed && !Array.isArray(parsed) && (parsed as Record<string, unknown>).error) {
        return fail(String((parsed as Record<string, unknown>).error), startTime);
      }
      const rows = Array.isArray(parsed) ? parsed : [];
      const lowStock = rows.filter(
        (r) => Number((r as Record<string, unknown>).quantity) < Number((r as Record<string, unknown>).safety_stock),
      );
      return ok(
        {
          type: 'sku_detail',
          sku,
          warehouse: warehouse || 'ALL',
          count: rows.length,
          lowStockCount: lowStock.length,
          rows,
        },
        startTime,
      );
    }

    // 2) 概览 + 低库存清单
    const overviewRaw = await ctx.tools.run('wms_inventory', {});
    const overview = (safeJson(overviewRaw) || {}) as Record<string, unknown>;

    const lowSql =
      `SELECT sku, name, warehouse_id, quantity, safety_stock FROM inventory ` +
      `WHERE quantity < safety_stock ORDER BY quantity ASC LIMIT 20`;
    const lowParsed = safeJson(await ctx.tools.run('db_query', { sql: lowSql }));
    const lowRows = Array.isArray(lowParsed) ? lowParsed : [];

    return ok(
      {
        type: 'overview',
        warehouse: warehouse || 'ALL',
        totalItems: overview.totalItems,
        warehouseCount: overview.warehouseCount,
        lowStockItems: overview.lowStockItems,
        lowStockList: lowRows,
      },
      startTime,
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), startTime);
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function ok(data: unknown, t: number): SkillResult {
  return { success: true, data, metadata: { durationMs: Date.now() - t } };
}

function fail(err: string, t: number): SkillResult {
  return { success: false, error: err, metadata: { durationMs: Date.now() - t } };
}
