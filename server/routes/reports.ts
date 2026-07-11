import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import {
  generateInventoryReport,
  generateInboundReport,
  generateOutboundReport,
  getReportList,
  deleteReport,
} from '../services/reportService.js';
import { getReportById } from '../dao/wmsSkillDao.js';

const router = Router();

// ===================== Report Generation Helpers =====================

type ReportType = 'inventory' | 'inbound' | 'outbound';

function generateByType(
  type: ReportType,
  warehouseId?: string,
  startDate?: string,
  endDate?: string,
): string {
  switch (type) {
    case 'inventory':
      return generateInventoryReport(warehouseId, startDate, endDate);
    case 'inbound':
      return generateInboundReport(warehouseId, startDate, endDate);
    case 'outbound':
      return generateOutboundReport(warehouseId, startDate, endDate);
    default:
      throw new Error(`Unsupported report type: ${type}`);
  }
}

// ===================== Report List / Generate =====================

/**
 * GET /api/reports
 * 列出已生成的报表记录
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const reports = getReportList();
    res.json({ success: true, data: reports, total: reports.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[ReportsRoute] 获取报表列表失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/reports
 * 生成报表。Body: { type: 'inventory'|'inbound'|'outbound', warehouseId?, startDate?, endDate? }
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { type, warehouseId, startDate, endDate } = req.body as {
      type?: ReportType;
      warehouseId?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!type || !['inventory', 'inbound', 'outbound'].includes(type)) {
      res.status(400).json({ error: 'type is required and must be one of inventory|inbound|outbound' });
      return;
    }

    const filePath = generateByType(type, warehouseId, startDate, endDate);
    res.status(201).json({
      success: true,
      data: {
        type,
        warehouseId: warehouseId ?? null,
        filePath,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[ReportsRoute] 生成报表失败:', message);
    res.status(500).json({ error: message });
  }
});

// ===================== Single Report =====================

/**
 * GET /api/reports/:id
 * 获取单条报表记录（含文件路径）
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid report id' });
      return;
    }

    const report = getReportById(id);
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    res.json({ success: true, data: report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[ReportsRoute] 获取报表详情失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/reports/:id
 * 删除报表记录及关联文件
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid report id' });
      return;
    }

    const ok = deleteReport(id);
    if (!ok) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[ReportsRoute] 删除报表失败:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
