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
import { ok, fail, notFound, created, serverError, BizCode } from './_shared/respond.js';

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
    return ok(res, { data: templates, total: templates.length });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
    return ok(res, categories);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return fail(res, BizCode.BAD_REQUEST, 'Search query is required', 400);
    }

    const templates = searchTemplates(query);
    return ok(res, { data: templates, total: templates.length });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return notFound(res, 'Template not found');
    }
    return ok(res, template);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return notFound(res, 'Template not found');
    }
    return ok(res, { success: true, workflow });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
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
      return fail(res, BizCode.BAD_REQUEST, 'Rating must be a number between 0 and 5', 400);
    }

    const success = updateTemplateRating(req.params.id, rating);
    if (!success) {
      return notFound(res, 'Template not found');
    }
    return ok(res, { success: true });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return serverError(res, message);
  }
});

export default router;