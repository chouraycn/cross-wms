/**
 * API Templates REST API — 模板管理端点
 *
 * v3.0: CRUD + test 端点
 * - GET    /api/api-templates              — 列表（分页、搜索、过滤）
 * - GET    /api/api-templates/:id          — 获取单个模板
 * - POST   /api/api-templates              — 创建模板
 * - PUT    /api/api-templates/:id          — 更新模板
 * - DELETE /api/api-templates/:id          — 删除模板
 * - POST   /api/api-templates/:id/test     — 测试模板执行
 * - GET    /api/api-templates/domains       — 获取所有可用域名
 */

import { Router } from 'express';
import {
  listApiTemplates,
  getApiTemplate,
  createApiTemplate,
  updateApiTemplate,
  deleteApiTemplate,
  getTemplateDomains,
} from '../dao/apiTemplates.js';
import { executeApiTemplate } from '../engine/webApiTemplates.js';

const router = Router();

// GET /api/api-templates — 列表
router.get('/', (req, res) => {
  try {
    const result = listApiTemplates({
      domain: req.query.domain as string | undefined,
      method: req.query.method as string | undefined,
      riskLevel: req.query.riskLevel as string | undefined,
      isBuiltin: req.query.isBuiltin === 'true' ? true : req.query.isBuiltin === 'false' ? false : undefined,
      search: req.query.search as string | undefined,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
    });
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `获取模板列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/api-templates/domains — 获取所有可用域名
router.get('/domains', (_req, res) => {
  try {
    const domains = getTemplateDomains();
    res.json({ data: domains });
  } catch (e) {
    res.status(500).json({ error: `获取域名列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/api-templates/:id — 获取单个模板
router.get('/:id', (req, res) => {
  try {
    const template = getApiTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: `模板不存在: ${req.params.id}` });
    }
    res.json({ data: template });
  } catch (e) {
    res.status(500).json({ error: `获取模板失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/api-templates — 创建模板
router.post('/', (req, res) => {
  try {
    const { name, description, domain, method, pathTemplate, headersJson, bodyTemplate, responsePath, responseExtractor, riskLevel, tags } = req.body;

    // 必填字段验证
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name 不能为空' });
    }
    if (!domain || typeof domain !== 'string' || domain.trim() === '') {
      return res.status(400).json({ error: 'domain 不能为空' });
    }
    if (!pathTemplate || typeof pathTemplate !== 'string') {
      return res.status(400).json({ error: 'pathTemplate 不能为空' });
    }

    // 域名格式验证
    const normalizedDomain = domain.toLowerCase().trim();
    const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!domainRegex.test(normalizedDomain)) {
      return res.status(400).json({ error: `无效的域名格式: ${domain}` });
    }

    // method 验证
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    const normalizedMethod = (method || 'GET').toUpperCase();
    if (!validMethods.includes(normalizedMethod)) {
      return res.status(400).json({ error: `不支持的 HTTP 方法: ${method}` });
    }

    // headersJson 验证
    if (headersJson && typeof headersJson === 'string') {
      try {
        JSON.parse(headersJson);
      } catch {
        return res.status(400).json({ error: 'headersJson 必须是有效的 JSON 字符串' });
      }
    }

    const template = createApiTemplate({
      name: name.trim(),
      description: description || '',
      domain: normalizedDomain,
      method: normalizedMethod,
      pathTemplate: pathTemplate.startsWith('/') ? pathTemplate : `/${pathTemplate}`,
      headersJson: headersJson || '{}',
      bodyTemplate: bodyTemplate || '',
      responsePath: responsePath || '',
      responseExtractor: responseExtractor || 'none',
      riskLevel: riskLevel || 'confirm',
      tags: Array.isArray(tags) ? tags : [],
    });

    res.status(201).json({ data: template });
  } catch (e) {
    res.status(500).json({ error: `创建模板失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// PUT /api/api-templates/:id — 更新模板
router.put('/:id', (req, res) => {
  try {
    const { name, description, domain, method, pathTemplate, headersJson, bodyTemplate, responsePath, responseExtractor, riskLevel, tags } = req.body;

    const updated = updateApiTemplate(req.params.id, {
      name,
      description,
      domain,
      method,
      pathTemplate,
      headersJson,
      bodyTemplate,
      responsePath,
      responseExtractor,
      riskLevel,
      tags,
    });

    if (!updated) {
      return res.status(404).json({ error: `模板不存在: ${req.params.id}` });
    }

    res.json({ data: updated });
  } catch (e) {
    res.status(500).json({ error: `更新模板失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// DELETE /api/api-templates/:id — 删除模板
router.delete('/:id', (req, res) => {
  try {
    const result = deleteApiTemplate(req.params.id);
    if (!result.success) {
      return res.status(result.error?.includes('不可删除') ? 403 : 404).json({ error: result.error });
    }
    res.json({ data: { success: true } });
  } catch (e) {
    res.status(500).json({ error: `删除模板失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/api-templates/:id/test — 测试模板执行
router.post('/:id/test', async (req, res) => {
  try {
    const template = getApiTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: `模板不存在: ${req.params.id}` });
    }

    const variables = (req.body.variables && typeof req.body.variables === 'object') ? req.body.variables as Record<string, string> : {};
    const extraHeaders = (req.body.extraHeaders && typeof req.body.extraHeaders === 'object') ? req.body.extraHeaders as Record<string, string> : undefined;

    const result = await executeApiTemplate({ templateId: req.params.id, variables, extraHeaders });

    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `测试模板失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
