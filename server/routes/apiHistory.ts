/**
 * API Request History REST API — 请求历史管理端点
 *
 * v3.0:
 * - GET    /api/api-history           — 分页列表
 * - GET    /api/api-history/:id       — 单条详情
 * - DELETE /api/api-history/:id       — 删除单条
 * - DELETE /api/api-history           — 清空全部
 */

import { Router } from 'express';
import {
  listHistory,
  getHistory,
  deleteHistory,
  clearHistory,
} from '../dao/apiRequestHistory.js';

const router = Router();

// GET /api/api-history — 分页列表
router.get('/', (req, res) => {
  try {
    const result = listHistory({
      templateId: req.query.templateId as string | undefined,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
    });
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `获取请求历史失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/api-history/:id — 单条详情
router.get('/:id', (req, res) => {
  try {
    const record = getHistory(req.params.id);
    if (!record) {
      return res.status(404).json({ error: `请求记录不存在: ${req.params.id}` });
    }
    res.json({ data: record });
  } catch (e) {
    res.status(500).json({ error: `获取请求记录失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// DELETE /api/api-history/:id — 删除单条
router.delete('/:id', (req, res) => {
  try {
    const success = deleteHistory(req.params.id);
    if (!success) {
      return res.status(404).json({ error: `请求记录不存在: ${req.params.id}` });
    }
    res.json({ data: { success: true } });
  } catch (e) {
    res.status(500).json({ error: `删除请求记录失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// DELETE /api/api-history — 清空全部
router.delete('/', (_req, res) => {
  try {
    const count = clearHistory();
    res.json({ data: { success: true, deletedCount: count } });
  } catch (e) {
    res.status(500).json({ error: `清空请求历史失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
