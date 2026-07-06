/**
 * Metrics REST API — 系统指标端点
 */

import { Router } from 'express';
import { metricsCollector } from '../metrics/collector.js';

const router = Router();

// GET /api/metrics/current — 当前系统指标
router.get('/current', (_req, res) => {
  try {
    const metrics = metricsCollector.collect();
    res.json({ data: metrics });
  } catch (e) {
    res.status(500).json({ error: `获取系统指标失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/metrics/latest — 最新缓存的指标
router.get('/latest', (_req, res) => {
  try {
    const metrics = metricsCollector.getLatest();
    if (!metrics) {
      return res.status(404).json({ error: '暂无指标数据' });
    }
    res.json({ data: metrics });
  } catch (e) {
    res.status(500).json({ error: `获取最新指标失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/metrics/history — 历史指标
router.get('/history', (req, res) => {
  try {
    const durationMinutes = req.query.minutes ? parseInt(req.query.minutes as string, 10) : 60;
    const history = metricsCollector.getHistory(durationMinutes * 60 * 1000);
    res.json({ data: history });
  } catch (e) {
    res.status(500).json({ error: `获取历史指标失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/metrics/custom/:name — 记录自定义指标
router.post('/custom/:name', (req, res) => {
  try {
    const { value, labels } = req.body || {};
    if (typeof value !== 'number') {
      return res.status(400).json({ error: '缺少 value 参数或类型错误' });
    }

    metricsCollector.recordCustomMetric(req.params.name, value, labels);
    res.json({ data: { success: true } });
  } catch (e) {
    res.status(500).json({ error: `记录自定义指标失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/metrics/custom/:name — 获取自定义指标
router.get('/custom/:name', (req, res) => {
  try {
    const series = metricsCollector.getCustomMetric(req.params.name);
    if (!series) {
      return res.status(404).json({ error: '指标不存在' });
    }
    res.json({ data: series });
  } catch (e) {
    res.status(500).json({ error: `获取自定义指标失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/metrics/custom — 获取自定义指标名称列表
router.get('/custom', (_req, res) => {
  try {
    const names = metricsCollector.getCustomMetricNames();
    res.json({ data: names });
  } catch (e) {
    res.status(500).json({ error: `获取自定义指标列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;