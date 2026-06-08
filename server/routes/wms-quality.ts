/**
 * WMS Quality Check Routes
 *
 * 入库质检记录的 CRUD 路由：
 * - POST /api/wms/quality          创建质检记录
 * - GET  /api/wms/quality          查询质检记录（支持 warehouseId/qualityStatus/sku 过滤）
 * - GET  /api/wms/quality/:id      查询单条质检记录
 * - PUT  /api/wms/quality/:id      更新质检记录
 * - DELETE /api/wms/quality/:id    删除质检记录
 */
import { Router, type Request, type Response } from 'express';
import {
  createQualityCheck,
  getQualityChecks,
  getQualityCheckById,
  updateQualityCheck,
  deleteQualityCheck,
} from '../dao/wmsSkillDao.js';

const router = Router();

// POST / — 创建质检记录
router.post('/', (req: Request, res: Response) => {
  try {
    const { warehouseId, sku, qualityStatus } = req.body;
    if (!warehouseId || !sku) {
      res.status(400).json({ code: 400, data: null, message: '缺少必填字段: warehouseId, sku' });
      return;
    }
    const id = createQualityCheck({
      warehouseId,
      sku,
      productName: req.body.productName,
      batchNo: req.body.batchNo,
      expiryDate: req.body.expiryDate,
      expectedQuantity: req.body.expectedQuantity ?? 0,
      actualQuantity: req.body.actualQuantity ?? 0,
      qualityStatus: qualityStatus ?? 'pending',
      inspector: req.body.inspector,
      checkTime: req.body.checkTime,
      notes: req.body.notes,
    });
    const data = getQualityCheckById(id);
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// GET / — 查询质检记录
router.get('/', (req: Request, res: Response) => {
  const data = getQualityChecks({
    warehouseId: req.query.warehouseId as string | undefined,
    qualityStatus: req.query.qualityStatus as string | undefined,
    sku: req.query.sku as string | undefined,
  });
  res.json({ code: 0, data, message: 'ok' });
});

// GET /:id — 查询单条质检记录
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const data = getQualityCheckById(id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: '质检记录不存在' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// PUT /:id — 更新质检记录
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  try {
    const ok = updateQualityCheck(id, req.body);
    if (!ok) {
      res.status(404).json({ code: 404, data: null, message: '质检记录不存在' });
      return;
    }
    const data = getQualityCheckById(id);
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// DELETE /:id — 删除质检记录
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const ok = deleteQualityCheck(id);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '质检记录不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

export default router;
