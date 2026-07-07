/**
 * Performance telemetry REST API — 端到端性能数据接口
 */

import { Router } from 'express';
import {
  getLatestSnapshot,
  getSnapshots,
  getSummary,
  getBackendPhases,
  recordSnapshot,
  type PerformanceSnapshot,
} from '../performance/performanceStore.js';

const router = Router();

// POST /api/performance/snapshot — 接收前端性能快照
router.post('/snapshot', (req, res) => {
  try {
    const payload = req.body?.data as PerformanceSnapshot | undefined;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: '缺少 data 字段' });
    }
    recordSnapshot(payload);
    res.json({ data: { success: true } });
  } catch (e) {
    res.status(500).json({ error: `记录性能快照失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/performance/summary — 聚合摘要
router.get('/summary', (req, res) => {
  try {
    const minutes = req.query.minutes ? parseInt(req.query.minutes as string, 10) : undefined;
    const summary = getSummary(minutes ? minutes * 60 * 1000 : undefined);
    res.json({ data: summary });
  } catch (e) {
    res.status(500).json({ error: `获取性能摘要失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/performance/latest — 最新快照
router.get('/latest', (_req, res) => {
  try {
    const snapshot = getLatestSnapshot();
    if (!snapshot) {
      return res.status(404).json({ error: '暂无性能快照' });
    }
    res.json({ data: snapshot });
  } catch (e) {
    res.status(500).json({ error: `获取最新快照失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/performance/history — 历史快照
router.get('/history', (req, res) => {
  try {
    const minutes = req.query.minutes ? parseInt(req.query.minutes as string, 10) : undefined;
    const history = getSnapshots(minutes ? minutes * 60 * 1000 : undefined);
    res.json({ data: history });
  } catch (e) {
    res.status(500).json({ error: `获取历史快照失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/performance/phases — 后端启动阶段
router.get('/phases', (_req, res) => {
  try {
    res.json({ data: getBackendPhases() });
  } catch (e) {
    res.status(500).json({ error: `获取后端阶段失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
