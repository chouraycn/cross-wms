/**
 * 模板市场 API — 模板查询、安装、分类
 */

import { Router, type Request, type Response } from 'express';
import {
  getTemplates,
  getTemplateById,
  installTemplate,
  getTemplateCategories,
  searchTemplates,
  updateTemplateRating,
  seedBuiltinTemplates,
  type TemplateFilter,
} from '../engine/workflow/templates.js';

const router = Router();

// ===================== 初始化预置模板 =====================

// 在服务启动时初始化
seedBuiltinTemplates();

// ===================== 模板列表 =====================

/**
 * GET /api/templates
 * 获取模板列表（支持分类过滤和搜索）
 *
 * Query params:
 * - category: 分类过滤
 * - search: 搜索关键词
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const filter: TemplateFilter = {};

    if (req.query.category) {
      filter.category = req.query.category as string;
    }
    if (req.query.search) {
      filter.search = req.query.search as string;
    }

    const templates = getTemplates(filter);
    res.json({ data: templates, total: templates.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 分类列表 =====================

/**
 * GET /api/templates/categories
 * 获取模板分类列表
 */
router.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = getTemplateCategories();
    res.json({ data: categories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 搜索模板 =====================

/**
 * GET /api/templates/search
 * 搜索模板
 *
 * Query params:
 * - q: 搜索关键词
 */
router.get('/search', (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const templates = searchTemplates(query);
    res.json({ data: templates, total: templates.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 单条模板详情 =====================

/**
 * GET /api/templates/:id
 * 获取单条模板详情
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const template = getTemplateById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 安装模板 =====================

/**
 * POST /api/templates/:id/install
 * 安装模板（创建工作流）
 */
router.post('/:id/install', (req: Request, res: Response) => {
  try {
    const workflow = installTemplate(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ success: true, workflow });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 评分模板 =====================

/**
 * POST /api/templates/:id/rate
 * 评分模板
 *
 * Body: { rating: number } (0-5)
 */
router.post('/:id/rate', (req: Request, res: Response) => {
  try {
    const { rating } = req.body;
    if (typeof rating !== 'number' || rating < 0 || rating > 5) {
      res.status(400).json({ error: 'Rating must be a number between 0 and 5' });
      return;
    }

    const success = updateTemplateRating(req.params.id, rating);
    if (!success) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;