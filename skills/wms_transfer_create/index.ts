/**
 * wms_transfer_create — 调拨单创建（原生可执行入口）
 *
 * 调用方式：skill_wms_transfer_create({ fromWarehouse, toWarehouse, items, transferType?, fromLocation?, toLocation?, urgent? })
 *   items: [{ sku, qty }]
 *
 * 真实能力：
 * - 校验源/目标仓库不同（库位间调拨时校验源/目标库位不同）
 * - 逐项真实查源仓可用量：available = quantity - locked_quantity
 * - 缺口识别：调拨量 > 源仓可用量时标记缺口
 *
 * 生成 TF-yyyyMMdd-NNNN 草稿（当前调拨后端路由尚未提供，待用户在 WMS 模块确认后执行
 * 源仓锁定 → 在途 → 目标仓入库验收）。与 inbound_create 一致：结构化草稿，不直接改库存。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

interface InvRow {
  sku: string;
  name?: string;
  quantity?: number;
  locked_quantity?: number;
}

interface TransferLine {
  sku: string;
  name: string;
  qty: number;
  availableAtSource: number;
  gap: number;
}

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    const fromWarehouse = params.fromWarehouse ? String(params.fromWarehouse) : '';
    const toWarehouse = params.toWarehouse ? String(params.toWarehouse) : '';
    const transferType = params.transferType ? String(params.transferType) : '仓库间';
    const fromLocation = params.fromLocation ? String(params.fromLocation) : '';
    const toLocation = params.toLocation ? String(params.toLocation) : '';
    const urgent = params.urgent === true || params.urgent === 'true';
    const rawItems = Array.isArray(params.items) ? (params.items as unknown[]) : [];

    const warnings: string[] = [];
    if (!fromWarehouse) warnings.push('缺少源仓库 fromWarehouse');
    if (!toWarehouse) warnings.push('缺少目标仓库 toWarehouse');

    // 校验源/目标不同
    if (transferType === '库位间') {
      if (!fromLocation) warnings.push('库位间调拨缺少源库位 fromLocation');
      if (!toLocation) warnings.push('库位间调拨缺少目标库位 toLocation');
      if (fromLocation && toLocation && fromLocation === toLocation) {
        return fail('源库位与目标库位不能相同', startTime);
      }
    } else if (fromWarehouse && toWarehouse && fromWarehouse === toWarehouse) {
      return fail('源仓库与目标仓库不能相同', startTime);
    }

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

    // 逐项真实查源仓可用量
    const lines: TransferLine[] = [];
    const gaps: { sku: string; qty: number; availableAtSource: number; gap: number }[] = [];
    for (const it of items) {
      const safeSku = it.sku.replace(/'/g, "''");
      const invRaw = await ctx.tools.run('db_query', {
        sql:
          `SELECT sku, name, quantity, locked_quantity FROM inventory ` +
          `WHERE sku = '${safeSku}' AND warehouse_id = '${fromWarehouse.replace(/'/g, "''")}' LIMIT 1`,
      });
      const invParsed = safeJson(invRaw);
      const row: InvRow | undefined = Array.isArray(invParsed) && invParsed.length
        ? (invParsed[0] as InvRow)
        : undefined;
      const available = row ? (Number(row.quantity) || 0) - (Number(row.locked_quantity) || 0) : 0;
      const gap = it.qty - available;
      if (gap > 0) gaps.push({ sku: it.sku, qty: it.qty, availableAtSource: available, gap });
      lines.push({ sku: it.sku, name: row?.name || '', qty: it.qty, availableAtSource: available, gap });
    }

    const transferId = genOrderNo('TF');
    return {
      success: true,
      data: {
        transferId,
        fromWarehouse,
        toWarehouse,
        fromLocation: transferType === '库位间' ? fromLocation : null,
        toLocation: transferType === '库位间' ? toLocation : null,
        transferType,
        urgent,
        status: 'draft_pending_confirmation',
        lineCount: lines.length,
        lines,
        gapCount: gaps.length,
        gaps,
        warnings,
        note: gaps.length > 0
          ? '部分 SKU 源仓可用量不足，已标注缺口，建议调整调拨量或分批调拨。'
          : '草稿已生成，确认后执行源仓锁定 → 在途 → 目标仓入库验收。',
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
