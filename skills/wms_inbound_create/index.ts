/**
 * wms_inbound_create — 入库单创建（原生可执行入口）
 *
 * 调用方式：skill_wms_inbound_create({ supplier, warehouse, lines, expectedAt? })
 *   lines: [{ sku, qty, batch? }]
 *
 * 行为：校验供应商/仓库/明细，逐行校验 SKU 是否存在于库存主数据，
 * 生成入库单**草稿**（含草稿单号），**不**调用任何提交接口，等待用户确认。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

interface InboundLine {
  sku: string;
  qty: number;
  batch?: string;
  exists?: boolean;
  availableQty?: number;
}

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    const supplier = params.supplier ? String(params.supplier) : '';
    const warehouse = params.warehouse ? String(params.warehouse) : '';
    const expectedAt = params.expectedAt ? String(params.expectedAt) : undefined;
    const rawLines = Array.isArray(params.lines) ? (params.lines as unknown[]) : [];

    const warnings: string[] = [];
    if (!supplier) warnings.push('缺少供应商 supplier');
    if (!warehouse) warnings.push('缺少目标仓库 warehouse');
    if (rawLines.length === 0) warnings.push('入库明细 lines 为空');

    const lines: InboundLine[] = [];
    for (const item of rawLines) {
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
      lines.push({ sku, qty, batch: it.batch ? String(it.batch) : undefined });
    }

    // 逐行校验 SKU 是否存在
    for (const line of lines) {
      const safeSku = line.sku.replace(/'/g, "''");
      const raw = await ctx.tools.run('db_query', {
        sql: `SELECT quantity FROM inventory WHERE sku = '${safeSku}' LIMIT 1`,
      });
      const parsed = safeJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        line.exists = true;
        line.availableQty = Number((parsed[0] as Record<string, unknown>).quantity);
      } else {
        line.exists = false;
        warnings.push(`SKU ${line.sku} 不在库存主数据中，请先维护物料主数据`);
      }
    }

    const draftId = `IB-DRAFT-${Date.now()}`;
    const missingMaster = lines.filter((l) => l.exists === false).length;

    return {
      success: true,
      data: {
        draftId,
        supplier,
        warehouse,
        expectedAt,
        status: 'draft_pending_confirmation',
        lineCount: lines.length,
        lines,
        warnings,
        note:
          missingMaster > 0
            ? '存在未知 SKU，草稿已生成但需先完善物料主数据后再提交。'
            : '草稿已生成，请用户确认后调用提交接口。',
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

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
