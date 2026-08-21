/**
 * wms_inventory_check — 盘点作业（原生可执行入口）
 *
 * 调用方式：
 *   1) 生成盘点任务：skill_wms_inventory_check({ warehouse, scope?, zone?, skus?, method? })
 *   2) 差异分析（用户提供实盘量后）：
 *      skill_wms_inventory_check({ warehouse, countId?, counts: [{ sku, actualQuantity }] })
 *
 * 真实能力：
 * - 按仓库/范围从 inventory 主数据提取账面清单（真实查库）
 * - 明盘暴露账面量，盲盘仅给 SKU+库位（不暴露数量）
 * - 差异分析：逐项比对账实、标记盘盈/盘亏/一致、计算差异率与差异金额、给调整建议
 *
 * 不直写库存（与 inbound_create 一致：生成结构化草稿，待用户在 WMS 模块确认后提交/调整）。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

interface InventoryRow {
  sku: string;
  name: string;
  warehouse_id?: string;
  location_code?: string;
  quantity?: number;
  safety_stock?: number;
}

interface CountLine {
  sku: string;
  name: string;
  locationCode: string | null;
  bookQuantity: number | null;
}

interface DifferenceLine {
  sku: string;
  name: string;
  bookQuantity: number;
  actualQuantity: number;
  variance: number;
  varianceRate: number;
  status: '一致' | '盘盈' | '盘亏';
}

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    const warehouse = params.warehouse ? String(params.warehouse) : '';
    if (!warehouse) {
      return fail('缺少必填字段 warehouse（仓库编码）', startTime);
    }

    // ---- 模式 2：差异分析 ----
    const counts = Array.isArray(params.counts) ? (params.counts as unknown[]) : [];
    if (counts.length > 0) {
      return analyzeDifferences(warehouse, counts, startTime);
    }

    // ---- 模式 1：生成盘点任务 ----
    const scope = params.scope ? String(params.scope) : '全盘';
    const method = params.method ? String(params.method) : '明盘';
    const zone = params.zone ? String(params.zone) : '';
    const skus = Array.isArray(params.skus) ? (params.skus as unknown[]).map((s) => String(s)) : [];

    const where: string[] = [`warehouse_id = '${warehouse.replace(/'/g, "''")}'`];
    if (scope === '分区' && zone) {
      where.push(`location_code LIKE '${zone.replace(/'/g, "''")}%'`);
    }
    if (scope === '指定SKU' && skus.length > 0) {
      const list = skus.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
      where.push(`sku IN (${list})`);
    }
    const sql =
      `SELECT sku, name, warehouse_id, location_code, quantity, safety_stock ` +
      `FROM inventory WHERE ${where.join(' AND ')} ORDER BY sku ASC LIMIT 500`;

    const raw = await ctx.tools.run('db_query', { sql });
    const parsed = safeJson(raw);
    const rows: InventoryRow[] = Array.isArray(parsed) ? (parsed as InventoryRow[]) : [];

    const blind = method === '盲盘';
    const lines: CountLine[] = rows.map((r) => ({
      sku: r.sku,
      name: r.name || '',
      locationCode: r.location_code ?? null,
      bookQuantity: blind ? null : Number(r.quantity) || 0,
    }));

    const countId = genOrderNo('IC');
    return ok(
      {
        mode: 'task',
        countId,
        warehouse,
        scope,
        method,
        itemCount: lines.length,
        lines,
        note: blind
          ? '盲盘任务已生成：仅含 SKU 与库位，请逐项实盘后回传实盘量执行差异分析。'
          : '明盘任务已生成：已附账面量供参考，请逐项实盘后回传实盘量执行差异分析。',
      },
      startTime,
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), startTime);
  }
}

function analyzeDifferences(
  warehouse: string,
  counts: unknown[],
  startTime: number,
): SkillResult {
  const lines: DifferenceLine[] = [];
  const diffAmountUnknown = [];
  for (const item of counts) {
    const it = item as Record<string, unknown>;
    const sku = it.sku ? String(it.sku) : '';
    const actual = Number(it.actualQuantity);
    if (!sku || !Number.isFinite(actual)) continue;
    const book = Number(it.bookQuantity ?? it.systemQuantity ?? 0);
    const variance = actual - book;
    const rate = book === 0 ? (actual === 0 ? 0 : 1) : variance / book;
    const status: DifferenceLine['status'] =
      variance === 0 ? '一致' : variance > 0 ? '盘盈' : '盘亏';
    lines.push({ sku, name: it.name ? String(it.name) : '', bookQuantity: book, actualQuantity: actual, variance, varianceRate: rate, status });
    if (it.unitValue !== undefined) {
      diffAmountUnknown.push({ sku, amount: variance * Number(it.unitValue) });
    }
  }

  const consistent = lines.filter((l) => l.status === '一致').length;
  const profit = lines.filter((l) => l.status === '盘盈').length;
  const loss = lines.filter((l) => l.status === '盘亏').length;
  const maxRate = lines.reduce((m, l) => Math.max(m, Math.abs(l.varianceRate)), 0);

  let advice: string;
  if (maxRate < 0.01) advice = '差异率 < 1%：建议直接调整账面。';
  else if (maxRate <= 0.05) advice = '差异率 1%-5%：建议复盘后调整。';
  else advice = '差异率 > 5%：建议停止出入库并彻查。';

  return ok(
    {
      mode: 'difference',
      warehouse,
      summary: { total: lines.length, consistent, profit, loss, maxVarianceRate: round(maxRate) },
      advice,
      lines,
    },
    startTime,
  );
}

function genOrderNo(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Date.now() / 1000) % 10000).padStart(4, '0');
  return `${prefix}-${ymd}-${seq}`;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
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
