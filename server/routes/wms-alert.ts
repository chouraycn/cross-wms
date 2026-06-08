/**
 * WMS Alert Routes
 *
 * 异常预警的路由：
 * - POST /api/wms/alerts             创建预警
 * - GET  /api/wms/alerts             查询预警（支持 warehouseId/alertType/severity/status 过滤）
 * - PUT  /api/wms/alerts/:id/resolve 解决预警（标记为 resolved 或 ignored）
 * - POST /api/wms/alerts/check       手动触发预警检查（扫描低库存、临期等）
 */
import { Router, type Request, type Response } from 'express';
import {
  createAlert,
  getAlerts,
  getAlertById,
  resolveAlert,
  checkAlerts,
} from '../dao/wmsSkillDao.js';

const router = Router();

// POST / — 创建预警
router.post('/', (req: Request, res: Response) => {
  try {
    const { warehouseId, alertType, message } = req.body;
    if (!warehouseId || !alertType || !message) {
      res.status(400).json({ code: 400, data: null, message: '缺少必填字段: warehouseId, alertType, message' });
      return;
    }
    const id = createAlert({
      warehouseId,
      alertType,
      severity: req.body.severity ?? 'medium',
      sku: req.body.sku,
      message,
      status: req.body.status ?? 'active',
    });
    const data = getAlertById(id);
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// GET / — 查询预警
router.get('/', (req: Request, res: Response) => {
  const data = getAlerts({
    warehouseId: req.query.warehouseId as string | undefined,
    alertType: req.query.alertType as string | undefined,
    severity: req.query.severity as string | undefined,
    status: req.query.status as string | undefined,
  });
  res.json({ code: 0, data, message: 'ok' });
});

// PUT /:id/resolve — 解决预警
router.put('/:id/resolve', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const { resolution } = req.body;
  if (resolution !== 'resolved' && resolution !== 'ignored') {
    res.status(400).json({ code: 400, data: null, message: 'resolution 必须为 resolved 或 ignored' });
    return;
  }
  const ok = resolveAlert(id, resolution);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '预警记录不存在' });
    return;
  }
  const data = getAlertById(id);
  res.json({ code: 0, data, message: 'ok' });
});

// POST /check — 手动触发预警检查
router.post('/check', (req: Request, res: Response) => {
  try {
    const warehouseId = req.body.warehouseId as string | undefined;
    const lowStockThreshold = req.body.lowStockThreshold as number | undefined;
    const newAlertCount = checkAlerts(warehouseId, lowStockThreshold ?? 10);
    res.json({ code: 0, data: { newAlertCount }, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

export default router;
