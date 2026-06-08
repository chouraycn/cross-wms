/**
 * WMS Inventory Count Routes
 *
 * 库存盘点记录的路由：
 * - POST /api/wms/inventory-count              创建盘点记录
 * - GET  /api/wms/inventory-count              查询盘点记录（支持 warehouseId/status/sku 过滤）
 * - GET  /api/wms/inventory-count/:id          查询单条盘点记录
 * - PUT  /api/wms/inventory-count/:id          更新盘点记录
 * - POST /api/wms/inventory-count/adjust        调整库存（确认盘点差异并同步更新 inventory_items）
 */
import { Router, type Request, type Response } from 'express';
import {
  createInventoryCount,
  getInventoryCounts,
  getInventoryCountById,
  updateInventoryCount,
  adjustInventoryCount,
} from '../dao/wmsSkillDao.js';

const router = Router();

// POST / — 创建盘点记录
router.post('/', (req: Request, res: Response) => {
  try {
    const { warehouseId, locationCode, sku } = req.body;
    if (!warehouseId || !locationCode || !sku) {
      res.status(400).json({ code: 400, data: null, message: '缺少必填字段: warehouseId, locationCode, sku' });
      return;
    }
    const id = createInventoryCount({
      warehouseId,
      locationCode,
      sku,
      systemQuantity: req.body.systemQuantity ?? 0,
      actualQuantity: req.body.actualQuantity ?? 0,
      counter: req.body.counter,
      countTime: req.body.countTime,
      status: req.body.status ?? 'pending',
      notes: req.body.notes,
    });
    const data = getInventoryCountById(id);
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// GET / — 查询盘点记录
router.get('/', (req: Request, res: Response) => {
  const data = getInventoryCounts({
    warehouseId: req.query.warehouseId as string | undefined,
    status: req.query.status as string | undefined,
    sku: req.query.sku as string | undefined,
    locationCode: req.query.locationCode as string | undefined,
  });
  res.json({ code: 0, data, message: 'ok' });
});

// GET /:id — 查询单条盘点记录
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const data = getInventoryCountById(id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: '盘点记录不存在' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// PUT /:id — 更新盘点记录
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  try {
    const ok = updateInventoryCount(id, req.body);
    if (!ok) {
      res.status(404).json({ code: 404, data: null, message: '盘点记录不存在' });
      return;
    }
    const data = getInventoryCountById(id);
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// POST /adjust — 调整库存（确认盘点差异）
router.post('/adjust', (req: Request, res: Response) => {
  try {
    const { id, adjustedBy } = req.body;
    if (!id) {
      res.status(400).json({ code: 400, data: null, message: '缺少必填字段: id' });
      return;
    }
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
      return;
    }
    const data = adjustInventoryCount(parsedId, adjustedBy);
    if (!data) {
      res.status(404).json({ code: 404, data: null, message: '盘点记录不存在' });
      return;
    }
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

export default router;
