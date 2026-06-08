/**
 * WMS Outbound Review Routes
 *
 * 出库复核记录的路由：
 * - POST /api/wms/outbound-review          创建出库复核记录
 * - GET  /api/wms/outbound-review          查询出库复核记录（支持 warehouseId/reviewStatus/outboundOrderId/sku 过滤）
 * - GET  /api/wms/outbound-review/:id      查询单条出库复核记录
 * - PUT  /api/wms/outbound-review/:id      更新出库复核记录
 */
import { Router, type Request, type Response } from 'express';
import {
  createOutboundReview,
  getOutboundReviews,
  getOutboundReviewById,
  updateOutboundReview,
} from '../dao/wmsSkillDao.js';

const router = Router();

// POST / — 创建出库复核记录
router.post('/', (req: Request, res: Response) => {
  try {
    const { outboundOrderId, warehouseId, sku } = req.body;
    if (!outboundOrderId || !warehouseId || !sku) {
      res.status(400).json({ code: 400, data: null, message: '缺少必填字段: outboundOrderId, warehouseId, sku' });
      return;
    }
    const id = createOutboundReview({
      outboundOrderId,
      warehouseId,
      sku,
      productName: req.body.productName,
      expectedQuantity: req.body.expectedQuantity ?? 0,
      scannedQuantity: req.body.scannedQuantity ?? 0,
      reviewStatus: req.body.reviewStatus ?? 'pending',
      reviewer: req.body.reviewer,
      reviewTime: req.body.reviewTime,
      notes: req.body.notes,
    });
    const data = getOutboundReviewById(id);
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// GET / — 查询出库复核记录
router.get('/', (req: Request, res: Response) => {
  const data = getOutboundReviews({
    warehouseId: req.query.warehouseId as string | undefined,
    reviewStatus: req.query.reviewStatus as string | undefined,
    outboundOrderId: req.query.outboundOrderId as string | undefined,
    sku: req.query.sku as string | undefined,
  });
  res.json({ code: 0, data, message: 'ok' });
});

// GET /:id — 查询单条出库复核记录
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const data = getOutboundReviewById(id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: '出库复核记录不存在' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// PUT /:id — 更新出库复核记录
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  try {
    const ok = updateOutboundReview(id, req.body);
    if (!ok) {
      res.status(404).json({ code: 404, data: null, message: '出库复核记录不存在' });
      return;
    }
    const data = getOutboundReviewById(id);
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

export default router;
