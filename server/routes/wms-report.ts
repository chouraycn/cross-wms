/**
 * WMS Report Routes
 *
 * 报表生成的路由：
 * - POST /api/wms/reports/generate   生成报表（支持 inventory 类型，导出 CSV）
 * - GET  /api/wms/reports             查询报表记录（支持 reportType/warehouseId/status 过滤）
 * - GET  /api/wms/reports/:id         查询单条报表记录
 * - GET  /api/wms/reports/:id/download 下载报表文件
 */
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  createReport,
  getReports,
  getReportById,
  generateInventoryReport,
} from '../dao/wmsSkillDao.js';

const router = Router();

// POST /generate — 生成报表
router.post('/generate', (req: Request, res: Response) => {
  try {
    const { reportType } = req.body;
    if (!reportType) {
      res.status(400).json({ code: 400, data: null, message: '缺少必填字段: reportType' });
      return;
    }

    let data: Awaited<ReturnType<typeof getReportById>>;

    if (reportType === 'inventory') {
      data = generateInventoryReport({
        warehouseId: req.body.warehouseId,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        generatedBy: req.body.generatedBy,
      });
    } else {
      // inbound / outbound / custom 类型暂只创建记录，后续可扩展生成逻辑
      const id = createReport({
        reportType,
        warehouseId: req.body.warehouseId,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        filePath: undefined,
        fileFormat: req.body.fileFormat ?? 'csv',
        generatedBy: req.body.generatedBy,
        generatedAt: new Date().toISOString(),
        status: 'pending',
      });
      data = getReportById(id);
    }

    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 400, data: null, message: (e as Error).message });
  }
});

// GET / — 查询报表记录
router.get('/', (req: Request, res: Response) => {
  const data = getReports({
    reportType: req.query.reportType as string | undefined,
    warehouseId: req.query.warehouseId as string | undefined,
    status: req.query.status as string | undefined,
  });
  res.json({ code: 0, data, message: 'ok' });
});

// GET /:id — 查询单条报表记录
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const data = getReportById(id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: '报表记录不存在' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// GET /:id/download — 下载报表文件
router.get('/:id/download', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ code: 400, data: null, message: '无效的 ID' });
    return;
  }
  const report = getReportById(id);
  if (!report) {
    res.status(404).json({ code: 404, data: null, message: '报表记录不存在' });
    return;
  }
  if (!report.filePath || !fs.existsSync(report.filePath)) {
    res.status(404).json({ code: 404, data: null, message: '报表文件不存在' });
    return;
  }

  const fileName = path.basename(report.filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const fileStream = fs.createReadStream(report.filePath);
  fileStream.pipe(res);
});

export default router;
