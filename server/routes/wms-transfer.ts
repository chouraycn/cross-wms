/**
 * WMS Transfer Draft Routes
 *
 * 调拨单草稿的路由（与 wms-outbound.ts 同范式）：
 * - POST /api/wms/transfer-draft        创建调拨草稿
 *       校验 源/目标仓库不同（库位间调拨额外校验源/目标库位不同）
 *       逐项真实查源仓可用量（available = quantity - locked_quantity，与 wms_transfer_create 技能同源）
 *       缺口识别（需求 > 源仓可用量时标记 gap）
 *       生成「待确认」调拨草稿结构并落库
 * - GET  /api/wms/transfer-draft         查询调拨草稿（支持 fromWarehouse/toWarehouse/status/sku 过滤）
 * - GET  /api/wms/transfer-draft/:id     查询单条草稿
 * - PUT  /api/wms/transfer-draft/:id     更新草稿（如确认 / 取消）
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import {
  createTransferDraft,
  getTransferDrafts,
  getTransferDraftById,
  updateTransferDraft,
  queryInventoryAvailability,
} from '../dao/wmsSkillDao.js';

const router = Router();

interface TransferLine {
  sku: string;
  name: string;
  qty: number;
  availableAtSource: number;
  gap: number;
}

// POST / — 创建调拨草稿
router.post('/', (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fromWarehouse = body.fromWarehouse ? String(body.fromWarehouse) : '';
    const toWarehouse = body.toWarehouse ? String(body.toWarehouse) : '';
    const transferType = body.transferType === '库位间' ? '库位间' : '仓库间';
    const fromLocation = body.fromLocation ? String(body.fromLocation) : '';
    const toLocation = body.toLocation ? String(body.toLocation) : '';
    const urgent = body.urgent === true || body.urgent === 'true';
    const rawItems = Array.isArray(body.items) ? (body.items as unknown[]) : [];

    // 基础必填校验
    if (!fromWarehouse || !toWarehouse || rawItems.length === 0) {
      res.status(400).json({
        code: 400,
        data: null,
        message: '缺少必填字段: fromWarehouse, toWarehouse, items',
      });
      return;
    }

    // 校验源/目标仓库不同
    if (fromWarehouse === toWarehouse) {
      res.status(400).json({ code: 400, data: null, message: '源仓库与目标仓库不能相同' });
      return;
    }

    // 库位间调拨：校验源/目标库位不同
    if (transferType === '库位间' && fromLocation && toLocation && fromLocation === toLocation) {
      res.status(400).json({ code: 400, data: null, message: '源库位与目标库位不能相同' });
      return;
    }

    // 逐项真实查源仓可用量 + 缺口识别
    const lines: TransferLine[] = [];
    const gaps: { sku: string; qty: number; availableAtSource: number; gap: number }[] = [];
    for (const item of rawItems) {
      const it = item as Record<string, unknown>;
      const sku = it.sku ? String(it.sku) : '';
      const qty = Number(it.qty);
      if (!sku) {
        res.status(400).json({ code: 400, data: null, message: `明细缺少 sku（原始：${JSON.stringify(it)}）` });
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ code: 400, data: null, message: `SKU ${sku} 的数量无效（qty=${it.qty}）` });
        return;
      }
      const inv = queryInventoryAvailability(fromWarehouse, sku);
      const available = inv ? inv.available : 0;
      const allocated = Math.min(qty, available);
      const gap = qty - allocated;
      if (gap > 0) gaps.push({ sku, qty, availableAtSource: available, gap });
      lines.push({ sku, name: inv?.name ?? '', qty, availableAtSource: available, gap });
    }

    const note =
      gaps.length > 0
        ? '部分 SKU 源仓可用量不足，已标注缺口，建议调整调拨量或分批调拨。'
        : '草稿已生成，确认后提交为正式调拨单（源仓锁定 → 在途 → 目标仓入库验收）。';

    const id = createTransferDraft({
      fromWarehouse,
      toWarehouse,
      fromLocation: transferType === '库位间' ? (fromLocation || null) : null,
      toLocation: transferType === '库位间' ? (toLocation || null) : null,
      transferType,
      urgent,
      items: lines,
      status: 'pending_confirmation',
      gapCount: gaps.length,
      note,
    });
    const data = getTransferDraftById(id);
    logger.info('[WMS-Transfer] 调拨草稿已创建', {
      id,
      fromWarehouse,
      toWarehouse,
      transferType,
      lineCount: lines.length,
      gapCount: gaps.length,
    });
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// GET / — 查询调拨草稿
router.get('/', (req: Request, res: Response) => {
  const data = getTransferDrafts({
    fromWarehouse: req.query.fromWarehouse as string | undefined,
    toWarehouse: req.query.toWarehouse as string | undefined,
    status: req.query.status as string | undefined,
    sku: req.query.sku as string | undefined,
  });
  res.json({ code: 0, data, message: 'ok' });
});

// GET /:id — 查询单条草稿
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const data = getTransferDraftById(id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: '调拨草稿不存在' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// PUT /:id — 更新草稿（确认 / 取消等）
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  try {
    const ok = updateTransferDraft(id, req.body);
    if (!ok) {
      res.status(404).json({ code: 404, data: null, message: '调拨草稿不存在' });
      return;
    }
    const data = getTransferDraftById(id);
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

export default router;
