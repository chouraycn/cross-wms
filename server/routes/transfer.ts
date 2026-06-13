/**
 * Transfer Order Routes
 *
 * 9 endpoints for warehouse transfer order management:
 * - GET    /api/transfer-orders           查询列表（分页+多条件筛选）
 * - GET    /api/transfer-orders/:id       查询详情
 * - POST   /api/transfer-orders           创建（支持 autoSubmit）
 * - PUT    /api/transfer-orders/:id       更新草稿
 * - DELETE /api/transfer-orders/:id       删除草稿
 * - POST   /api/transfer-orders/:id/submit     提交（出库扣减）
 * - POST   /api/transfer-orders/:id/receive    确认收货
 * - PUT    /api/transfer-orders/:id/bind-transit   绑定物流
 * - PUT    /api/transfer-orders/:id/unbind-transit 解绑物流
 */
import { Router, type Request, type Response } from 'express';
import {
  getTransferOrders as dbGetAll,
  getTransferOrderById as dbGetById,
  createTransferOrder as dbCreate,
  updateTransferOrder as dbUpdate,
  deleteTransferOrder as dbDelete,
  getWarehouseById,
  getTransitOrderById,
} from '../dao/warehouse.js';
import * as TransferService from '../services/transferService.js';

const router = Router();

// GET /api/transfer-orders?status=draft&fromWarehouseId=xxx&toWarehouseId=xxx&sku=ABC&page=1&pageSize=20
router.get('/', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const fromWarehouseId = req.query.fromWarehouseId as string | undefined;
  const toWarehouseId = req.query.toWarehouseId as string | undefined;
  const sku = req.query.sku as string | undefined;
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

  const result = dbGetAll({ status, fromWarehouseId, toWarehouseId, sku, page, pageSize });

  // Enrich with warehouse names and transit tracking number
  const enrichedItems = result.items.map((item) => {
    const fromWh = getWarehouseById(item.fromWarehouseId);
    const toWh = getWarehouseById(item.toWarehouseId);
    let transitTrackingNo: string | undefined;
    if (item.transitOrderId) {
      const transit = getTransitOrderById(item.transitOrderId);
      transitTrackingNo = transit ? (transit as Record<string, unknown>).trackingNo as string : undefined;
    }
    return {
      ...item,
      fromWarehouseName: fromWh?.name ?? '',
      toWarehouseName: toWh?.name ?? '',
      transitTrackingNo: transitTrackingNo ?? '',
    };
  });

  res.json({ code: 0, data: { items: enrichedItems, total: result.total, page, pageSize }, message: 'ok' });
});

// GET /api/transfer-orders/:id
router.get('/:id', (req: Request, res: Response) => {
  const item = dbGetById(req.params.id);
  if (!item) {
    res.status(404).json({ code: 404, data: null, message: '调拨单不存在' });
    return;
  }
  // Enrich with warehouse names and transit tracking number
  const fromWh = getWarehouseById(item.fromWarehouseId);
  const toWh = getWarehouseById(item.toWarehouseId);
  let transitTrackingNo: string | undefined;
  if (item.transitOrderId) {
    const transit = getTransitOrderById(item.transitOrderId);
    transitTrackingNo = transit ? (transit as Record<string, unknown>).trackingNo as string : undefined;
  }
  res.json({
    code: 0,
    data: {
      ...item,
      fromWarehouseName: fromWh?.name ?? '',
      toWarehouseName: toWh?.name ?? '',
      transitTrackingNo: transitTrackingNo ?? '',
    },
    message: 'ok',
  });
});

// POST /api/transfer-orders — Create (supports autoSubmit)
router.post('/', (req: Request, res: Response) => {
  try {
    const { autoSubmit, submittedBy, ...data } = req.body;

    // Validate fromWarehouseId !== toWarehouseId
    if (data.fromWarehouseId && data.toWarehouseId && data.fromWarehouseId === data.toWarehouseId) {
      res.status(400).json({ code: 400, data: null, message: '出库仓和入库仓不能相同' });
      return;
    }

    // Generate transferNo if not provided
    if (!data.transferNo) {
      data.transferNo = TransferService.generateTransferNo();
    }

    const created = dbCreate(data);

    // Auto-submit if requested
    if (autoSubmit) {
      const submitted = TransferService.submit(created.id, submittedBy || data.createdBy || '');
      const fromWh = getWarehouseById(submitted.fromWarehouseId);
      const toWh = getWarehouseById(submitted.toWarehouseId);
      res.status(201).json({
        code: 0,
        data: {
          ...submitted,
          fromWarehouseName: fromWh?.name ?? '',
          toWarehouseName: toWh?.name ?? '',
        },
        message: 'ok',
      });
      return;
    }

    const fromWh = getWarehouseById(created.fromWarehouseId);
    const toWh = getWarehouseById(created.toWarehouseId);
    res.status(201).json({
      code: 0,
      data: {
        ...created,
        fromWarehouseName: fromWh?.name ?? '',
        toWarehouseName: toWh?.name ?? '',
      },
      message: 'ok',
    });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// PUT /api/transfer-orders/:id — Update draft
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = dbGetById(req.params.id);
    if (!existing) {
      res.status(404).json({ code: 404, data: null, message: '调拨单不存在' });
      return;
    }
    if (existing.status !== 'draft') {
      res.status(400).json({ code: 400, data: null, message: '只有草稿状态的调拨单可以编辑' });
      return;
    }

    // Validate fromWarehouseId !== toWarehouseId
    const fromWarehouseId = req.body.fromWarehouseId ?? existing.fromWarehouseId;
    const toWarehouseId = req.body.toWarehouseId ?? existing.toWarehouseId;
    if (fromWarehouseId === toWarehouseId) {
      res.status(400).json({ code: 400, data: null, message: '出库仓和入库仓不能相同' });
      return;
    }

    const data = dbUpdate(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ code: 404, data: null, message: '调拨单不存在' });
      return;
    }
    const fromWh = getWarehouseById(data.fromWarehouseId);
    const toWh = getWarehouseById(data.toWarehouseId);
    res.json({
      code: 0,
      data: { ...data, fromWarehouseName: fromWh?.name ?? '', toWarehouseName: toWh?.name ?? '' },
      message: 'ok',
    });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// DELETE /api/transfer-orders/:id — Delete draft
router.delete('/:id', (req: Request, res: Response) => {
  const existing = dbGetById(req.params.id);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: '调拨单不存在' });
    return;
  }
  if (existing.status !== 'draft') {
    res.status(400).json({ code: 400, data: null, message: '只有草稿状态的调拨单可以删除' });
    return;
  }
  const ok = dbDelete(req.params.id);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '调拨单不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// POST /api/transfer-orders/:id/submit — Submit (outbound deduction)
router.post('/:id/submit', (req: Request, res: Response) => {
  try {
    const { submittedBy } = req.body;
    const result = TransferService.submit(req.params.id, submittedBy || '');
    const fromWh = getWarehouseById(result.fromWarehouseId);
    const toWh = getWarehouseById(result.toWarehouseId);
    res.json({
      code: 0,
      data: { ...result, fromWarehouseName: fromWh?.name ?? '', toWarehouseName: toWh?.name ?? '' },
      message: 'ok',
    });
  } catch (e) {
    const message = (e as Error).message;
    const code = message.includes('不存在') ? 404 : 400;
    res.status(code).json({ code, data: null, message });
  }
});

// POST /api/transfer-orders/:id/receive — Confirm receipt
router.post('/:id/receive', (req: Request, res: Response) => {
  try {
    const { receivedBy } = req.body;
    const result = TransferService.receive(req.params.id, receivedBy || '');
    const fromWh = getWarehouseById(result.fromWarehouseId);
    const toWh = getWarehouseById(result.toWarehouseId);
    res.json({
      code: 0,
      data: { ...result, fromWarehouseName: fromWh?.name ?? '', toWarehouseName: toWh?.name ?? '' },
      message: 'ok',
    });
  } catch (e) {
    const message = (e as Error).message;
    const code = message.includes('不存在') ? 404 : 400;
    res.status(code).json({ code, data: null, message });
  }
});

// PUT /api/transfer-orders/:id/bind-transit — Bind transit order
router.put('/:id/bind-transit', (req: Request, res: Response) => {
  try {
    const { transitOrderId } = req.body;
    if (!transitOrderId) {
      res.status(400).json({ code: 400, data: null, message: '缺少物流单ID' });
      return;
    }
    const result = TransferService.bindTransit(req.params.id, transitOrderId);
    const fromWh = getWarehouseById(result.fromWarehouseId);
    const toWh = getWarehouseById(result.toWarehouseId);
    let transitTrackingNo = '';
    if (result.transitOrderId) {
      const transit = getTransitOrderById(result.transitOrderId);
      transitTrackingNo = transit ? (transit as Record<string, unknown>).trackingNo as string : '';
    }
    res.json({
      code: 0,
      data: { ...result, fromWarehouseName: fromWh?.name ?? '', toWarehouseName: toWh?.name ?? '', transitTrackingNo },
      message: 'ok',
    });
  } catch (e) {
    const message = (e as Error).message;
    const code = message.includes('不存在') ? 404 : 400;
    res.status(code).json({ code, data: null, message });
  }
});

// PUT /api/transfer-orders/:id/unbind-transit — Unbind transit order
router.put('/:id/unbind-transit', (req: Request, res: Response) => {
  try {
    const result = TransferService.unbindTransit(req.params.id);
    const fromWh = getWarehouseById(result.fromWarehouseId);
    const toWh = getWarehouseById(result.toWarehouseId);
    res.json({
      code: 0,
      data: { ...result, fromWarehouseName: fromWh?.name ?? '', toWarehouseName: toWh?.name ?? '', transitTrackingNo: '' },
      message: 'ok',
    });
  } catch (e) {
    const message = (e as Error).message;
    const code = message.includes('不存在') ? 404 : 400;
    res.status(code).json({ code, data: null, message });
  }
});

export default router;
