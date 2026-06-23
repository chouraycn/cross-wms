/**
 * WMS Replenishment Suggestion Routes
 *
 * 补货建议 API 端点：
 * - GET    /api/wms/replenishment              查询建议列表（分页+筛选）
 * - POST   /api/wms/replenishment/generate     手动触发建议生成
 * - PUT    /api/wms/replenishment/:id/status   更新建议状态
 * - POST   /api/wms/replenishment/:id/transfer 从建议一键创建调拨单
 * - GET    /api/wms/replenishment/:id/sources   获取推荐来源仓库列表
 */
import { Router, type Request, type Response } from 'express';
import {
  generateSuggestions,
  getSuggestions,
  updateSuggestionStatus,
  createTransferFromSuggestion,
  getReplenishmentStats,
  recommendSourceWarehouse,
} from '../services/replenishmentService.js';
import { getReplenishmentSuggestionById } from '../dao/wmsSkillDao.js';
import type { ReplenishmentConfig } from '../models/wms-skill.js';
import { DEFAULT_REPLENISHMENT_CONFIG } from '../models/wms-skill.js';
import { logger } from '../logger.js';

const router = Router();

// GET / — 查询建议列表（分页+筛选）
router.get('/', (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      warehouseId: req.query.warehouseId as string | undefined,
      sku: req.query.sku as string | undefined,
      page: parseInt(req.query.page as string, 10) || 1,
      pageSize: parseInt(req.query.pageSize as string, 10) || 20,
    };

    // 如果请求统计信息
    const includeStats = req.query.includeStats === 'true';
    const result = getSuggestions(filters);

    const response: Record<string, unknown> = {
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };

    if (includeStats) {
      response.stats = getReplenishmentStats();
    }

    res.json({ code: 0, data: response, message: 'ok' });
  } catch (e) {
    logger.error('[ReplenishmentRoute] 查询建议列表失败:', e);
    res.status(500).json({ code: 1, message: (e as Error).message });
  }
});

// POST /generate — 手动触发建议生成
router.post('/generate', (req: Request, res: Response) => {
  try {
    const config: Partial<ReplenishmentConfig> = {
      coverDays: typeof req.body.coverDays === 'number' ? req.body.coverDays : DEFAULT_REPLENISHMENT_CONFIG.coverDays,
      enableAutoGenerate: typeof req.body.enableAutoGenerate === 'boolean' ? req.body.enableAutoGenerate : DEFAULT_REPLENISHMENT_CONFIG.enableAutoGenerate,
      minHistoryDays: typeof req.body.minHistoryDays === 'number' ? req.body.minHistoryDays : DEFAULT_REPLENISHMENT_CONFIG.minHistoryDays,
    };

    const result = generateSuggestions(config);
    res.json({ code: 0, data: result, message: 'ok' });
  } catch (e) {
    logger.error('[ReplenishmentRoute] 生成建议失败:', e);
    res.status(500).json({ code: 1, message: (e as Error).message });
  }
});

// PUT /:id/status — 更新建议状态
router.put('/:id/status', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ code: 1, message: '无效的 ID' });
      return;
    }

    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'ignored', 'deferred'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ code: 1, message: `status 必须为 ${validStatuses.join('/')} 之一` });
      return;
    }

    const updated = updateSuggestionStatus(id, status);
    if (!updated) {
      res.status(404).json({ code: 1, message: '建议记录不存在' });
      return;
    }

    res.json({ code: 0, data: updated, message: 'ok' });
  } catch (e) {
    logger.error('[ReplenishmentRoute] 更新建议状态失败:', e);
    res.status(500).json({ code: 1, message: (e as Error).message });
  }
});

// GET /:id/sources — 获取推荐来源仓库列表
router.get('/:id/sources', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ code: 1, message: '无效的 ID' });
      return;
    }

    const suggestion = getReplenishmentSuggestionById(id);
    if (!suggestion) {
      res.status(404).json({ code: 1, message: '建议记录不存在' });
      return;
    }

    const recommendations = recommendSourceWarehouse(suggestion.sku, suggestion.warehouseId, suggestion.suggestedQty);
    res.json({ code: 0, data: recommendations, message: 'ok' });
  } catch (e) {
    logger.error('[ReplenishmentRoute] 获取来源仓库推荐失败:', e);
    res.status(500).json({ code: 1, message: (e as Error).message });
  }
});

// POST /:id/confirm — 确认补货建议（v1.7.0）
router.post('/:id/confirm', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ code: 1, message: '无效的 ID' });
      return;
    }

    const suggestion = getReplenishmentSuggestionById(id);

    if (!suggestion) {
      res.status(404).json({ code: 1, message: '补货建议记录不存在' });
      return;
    }

    if (suggestion.status !== 'pending') {
      res.status(400).json({
        code: 1,
        message: `当前状态为 "${suggestion.status}"，仅处于 pending 状态的建议可确认`,
      });
      return;
    }

    const updated = updateSuggestionStatus(id, 'confirmed');
    if (!updated) {
      res.status(500).json({ code: 1, message: '确认失败，请重试' });
      return;
    }

    res.json({ code: 0, data: updated, message: 'ok' });
  } catch (e) {
    logger.error('[ReplenishmentRoute] 确认补货建议失败:', e);
    res.status(500).json({ code: 1, message: (e as Error).message });
  }
});

// POST /:id/transfer — 从建议一键创建调拨单
router.post('/:id/transfer', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ code: 1, message: '无效的 ID' });
      return;
    }

    const { fromWarehouseId, quantity } = req.body;
    if (!fromWarehouseId) {
      res.status(400).json({ code: 1, message: '缺少 fromWarehouseId' });
      return;
    }
    if (typeof quantity !== 'number' || quantity <= 0) {
      res.status(400).json({ code: 1, message: 'quantity 必须为正整数' });
      return;
    }

    const result = createTransferFromSuggestion(id, { fromWarehouseId, quantity });
    res.json({ code: 0, data: result, message: 'ok' });
  } catch (e) {
    logger.error('[ReplenishmentRoute] 创建调拨单失败:', e);
    res.status(400).json({ code: 1, message: (e as Error).message });
  }
});

export default router;
