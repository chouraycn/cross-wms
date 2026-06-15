/**
 * API Domain Whitelist REST API — 域名白名单管理端点
 *
 * v3.0: CRUD + check 端点
 * - GET    /api/api-domain-whitelist         — 列表（支持分页、搜索、分类筛选）
 * - POST   /api/api-domain-whitelist         — 新增域名
 * - DELETE /api/api-domain-whitelist/:id     — 删除域名
 * - POST   /api/api-domain-whitelist/check   — 校验域名是否在白名单中
 */

import { Router } from 'express';
import {
  listDomainWhitelist,
  addDomain,
  removeDomain,
  isDomainAllowed,
  clearDomainCache,
} from '../dao/apiDomainWhitelist.js';

const router = Router();

// GET /api/api-domain-whitelist — 列表
router.get('/', (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;

    const result = listDomainWhitelist(category, search, page, pageSize);
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `获取域名白名单失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/api-domain-whitelist — 新增
router.post('/', (req, res) => {
  try {
    const { hostname, description, category } = req.body;

    if (!hostname || typeof hostname !== 'string' || hostname.trim() === '') {
      return res.status(400).json({ error: 'hostname 参数不能为空' });
    }

    // 验证 hostname 格式
    const normalized = hostname.toLowerCase().trim();
    const hostnameRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!hostnameRegex.test(normalized)) {
      return res.status(400).json({ error: `无效的域名格式: ${hostname}` });
    }

    const row = addDomain(
      normalized,
      typeof description === 'string' ? description : '',
      typeof category === 'string' ? category : 'user',
    );
    res.status(201).json({ data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('已在白名单中')) {
      return res.status(409).json({ error: msg });
    }
    res.status(500).json({ error: `添加域名失败: ${msg}` });
  }
});

// POST /api/api-domain-whitelist/check — 校验域名是否在白名单中
router.post('/check', (req, res) => {
  try {
    const { hostname, url } = req.body;

    // 支持传入完整 URL 或纯 hostname
    let target = '';
    if (typeof hostname === 'string' && hostname.trim()) {
      target = hostname.trim();
    } else if (typeof url === 'string' && url.trim()) {
      try {
        target = new URL(url).hostname;
      } catch {
        return res.status(400).json({ error: `无效的 URL: ${url}` });
      }
    } else {
      return res.status(400).json({ error: '需要提供 hostname 或 url 参数' });
    }

    const allowed = isDomainAllowed(target);
    res.json({ data: { hostname: target, allowed } });
  } catch (e) {
    res.status(500).json({ error: `校验失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// DELETE /api/api-domain-whitelist/:id — 删除
router.delete('/:id', (req, res) => {
  try {
    const success = removeDomain(req.params.id);
    if (!success) {
      return res.status(404).json({ error: '域名不存在或无法删除' });
    }
    res.json({ data: { success: true } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('不可删除')) {
      return res.status(403).json({ error: msg });
    }
    res.status(500).json({ error: `删除域名失败: ${msg}` });
  }
});

// POST /api/api-domain-whitelist/cache/clear — 清除缓存
router.post('/cache/clear', (req, res) => {
  try {
    clearDomainCache();
    res.json({ data: { success: true, message: '域名白名单缓存已清除' } });
  } catch (e) {
    res.status(500).json({ error: `清除缓存失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
