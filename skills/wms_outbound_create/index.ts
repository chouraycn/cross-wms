/**
 * wms_outbound_create — 出库单创建（原生可执行入口）
 *
 * 调用方式：skill_wms_outbound_create({ orderNo, warehouse, items, priority?, pickStrategy? })
 *   items: [{ sku, qty }]
 *
 * 真实能力：
 * - 防重复：按 orderNo 查询 outbound_reviews（表不存在时优雅跳过）
 * - 逐项真实查库存：available = quantity - locked_quantity（来自 inventory 主数据）
 * - 缺口识别：需求量 > 可用量时标记缺口与缺口量
 * - 波次建议：明细 > 20 行建议拆波次
 *
 * 生成 OB-yyyyMMdd-NNNN 草稿，待用户在 WMS 模块确认后执行库存锁定与出库单提交。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

interface InvRow {
  sku: string;
  name?: string;
  quantity?: number;
  locked_quantity?: number;
}

interface OutboundLine {
  sku: string;
  name: string;
  requestedQty: number;
  availableQty: number;
  allocatedQty: number;
  gap: number;
}

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    const orderNo = params.orderNo ? String(params.orderNo) : '';
    const warehouse = params.warehouse ? String(params.warehouse) : '';
    const priority = params.priority ? String(params.priority) : '普通';
    const pickStrategy = params.pickStrategy ? String(params.pickStrategy) : 'FIFO';
    const rawItems = Array.isArray(params.items) ? (params.items as unknown[]) : [];

    const warnings: string[] = [];
    if (!orderNo) warnings.push('缺少关联订单号 orderNo');
    if (!warehouse) warnings.push('缺少目标仓库 warehouse');
    if (rawItems.length === 0) warnings.push('出库明细 items 为空');

    const items: { sku: string; qty: number }[] = [];
    for (const item of rawItems) {
      const it = item as Record<string, unknown>;
      const sku = it.sku ? String(it.sku) : '';
      const qty = Number(it.qty);
      if (!sku) {
        warnings.push(`明细缺少 sku（原始：${JSON.stringify(it)}）`);
        continue;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        warnings.push(`SKU ${sku} 的数量无效（qty=${it.qty}），已跳过`);
        continue;
      }
      items.push({ sku, qty });
    }

    // 防重复（best-effort，表不存在则跳过）
    let duplicate = false;
    if (orderNo) {
      const dupRaw = await ctx.tools.run('db_query', {
        sql:
          `SELECT outboundOrderId FROM outbound_reviews ` +
          `WHERE outboundOrderId = '${orderNo.replace(/'/g, "''")}' LIMIT 1`,
      });
      const dupParsed = safeJson(dupRaw);
      if (Array.isArray(dupParsed) && dupParsed.length > 0) duplicate = true;
      else if (dupParsed && (dupParsed as Record<string, unknown>).error) {
        warnings.push(`重复校验跳过（${(dupParsed as Record<string, unknown>).error}）`);
      }
    }

    // 逐项真实查可用量
    const lines: OutboundLine[] = [];
    const gaps: { sku: string; requested: number; available: number; gap: number }[] = [];
    for (const it of items) {
      const safeSku = it.sku.replace(/'/g, "''");
      const invRaw = await ctx.tools.run('db_query', {
        sql:
          `SELECT sku, name, quantity, locked_quantity FROM inventory ` +
          `WHERE sku = '${safeSku}' AND warehouse_id = '${warehouse.replace(/'/g, "''")}' LIMIT 1`,
      });
      const invParsed = safeJson(invRaw);
      const row: InvRow | undefined = Array.isArray(invParsed) && invParsed.length
        ? (invParsed[0] as InvRow)
        : undefined;
      const available = row ? (Number(row.quantity) || 0) - (Number(row.locked_quantity) || 0) : 0;
      const allocated = Math.min(it.qty, available);
      const gap = it.qty - allocated;
      if (gap > 0) gaps.push({ sku: it.sku, requested: it.qty, available, gap });
      lines.push({
        sku: it.sku,
        name: row?.name || '',
        requestedQty: it.qty,
        availableQty: available,
        allocatedQty: allocated,
        gap,
      });
    }

    const totalLocked = lines.reduce((s, l) => s + l.allocatedQty, 0);
    const waveSuggested = items.length > 20;
    const outboundId = genOrderNo('OB');

    return {
      success: true,
      data: {
        outboundId,
        orderNo,
        warehouse,
        priority,
        pickStrategy,
        duplicate,
        status: 'draft_pending_confirmation',
        lineCount: lines.length,
        lines,
        totalLocked,
        gapCount: gaps.length,
        gaps,
        waveSuggested,
        warnings,
        note: duplicate
          ? '检测到该订单号已存在出库单，请核实是否重复创建。'
          : '草稿已生成，确认后执行库存锁定与出库单提交。',
      },
      metadata: { durationMs: Date.now() - startTime },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      metadata: { durationMs: Date.now() - startTime },
    };
  }
}

function genOrderNo(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Date.now() / 1000) % 10000).padStart(4, '0');
  return `${prefix}-${ymd}-${seq}`;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
