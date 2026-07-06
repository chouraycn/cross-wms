/**
 * Message Lifecycle REST API — 消息生命周期管理端点
 *
 * 提供消息状态查询、生命周期追踪、重试队列管理和死信队列查看
 */

import { Router } from 'express';
import { messageLifecycleManager, retryQueue } from '../channels/outbound/index.js';

const router = Router();

// GET /api/message-lifecycle/stats — 生命周期统计
router.get('/stats', (_req, res) => {
  try {
    const stats = messageLifecycleManager.getStats();
    res.json({ data: stats });
  } catch (e) {
    res.status(500).json({ error: `获取生命周期统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/message-lifecycle/active — 活跃消息
router.get('/active', (_req, res) => {
  try {
    const states = messageLifecycleManager.getActiveStates();
    res.json({ data: states });
  } catch (e) {
    res.status(500).json({ error: `获取活跃消息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/message-lifecycle/failed — 失败消息
router.get('/failed', (_req, res) => {
  try {
    const states = messageLifecycleManager.getFailedStates();
    res.json({ data: states });
  } catch (e) {
    res.status(500).json({ error: `获取失败消息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/message-lifecycle/:id — 消息状态详情
router.get('/:id', (req, res) => {
  try {
    const state = messageLifecycleManager.getState(req.params.id);
    if (!state) {
      return res.status(404).json({ error: '消息不存在' });
    }
    res.json({ data: state });
  } catch (e) {
    res.status(500).json({ error: `获取消息状态失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/message-lifecycle/:id/audit — 消息审计日志
router.get('/:id/audit', (req, res) => {
  try {
    const transitions = messageLifecycleManager.getAuditLog(req.params.id);
    res.json({ data: transitions });
  } catch (e) {
    res.status(500).json({ error: `获取审计日志失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/message-lifecycle/:id/cancel — 取消消息
router.post('/:id/cancel', (req, res) => {
  try {
    const reason = req.body?.reason || 'Cancelled by user';
    const state = messageLifecycleManager.markCancelled(req.params.id, reason);
    if (!state) {
      return res.status(404).json({ error: '消息不存在或无法取消' });
    }
    res.json({ data: state });
  } catch (e) {
    res.status(500).json({ error: `取消消息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/message-lifecycle/cleanup — 清理过期消息
router.post('/cleanup', (req, res) => {
  try {
    const cleaned = messageLifecycleManager.cleanupExpired();
    res.json({ data: { cleaned } });
  } catch (e) {
    res.status(500).json({ error: `清理过期消息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/message-lifecycle/retry/stats — 重试队列统计
router.get('/retry/stats', (_req, res) => {
  try {
    const stats = retryQueue.getStats();
    res.json({ data: stats });
  } catch (e) {
    res.status(500).json({ error: `获取重试队列统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/message-lifecycle/retry/queue — 重试队列列表
router.get('/retry/queue', (_req, res) => {
  try {
    res.json({
      data: retryQueue.size(),
      deadLetter: retryQueue.deadLetterSize(),
    });
  } catch (e) {
    res.status(500).json({ error: `获取重试队列失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/message-lifecycle/retry/dead-letter — 死信队列
router.get('/retry/dead-letter', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const items = retryQueue.getDeadLetterItems(limit);
    res.json({ data: items });
  } catch (e) {
    res.status(500).json({ error: `获取死信队列失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/message-lifecycle/retry/process — 手动处理下一个重试项
router.post('/retry/process', async (_req, res) => {
  try {
    const item = await retryQueue.processNext();
    res.json({ data: item });
  } catch (e) {
    res.status(500).json({ error: `处理重试项失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/message-lifecycle/retry/start — 启动重试队列
router.post('/retry/start', (_req, res) => {
  try {
    retryQueue.start();
    res.json({ data: { success: true, message: '重试队列已启动' } });
  } catch (e) {
    res.status(500).json({ error: `启动重试队列失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/message-lifecycle/retry/stop — 停止重试队列
router.post('/retry/stop', (_req, res) => {
  try {
    retryQueue.stop();
    res.json({ data: { success: true, message: '重试队列已停止' } });
  } catch (e) {
    res.status(500).json({ error: `停止重试队列失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// DELETE /api/message-lifecycle/retry/dead-letter — 清空死信队列
router.delete('/retry/dead-letter', (_req, res) => {
  try {
    retryQueue.clearDeadLetter();
    res.json({ data: { success: true, message: '死信队列已清空' } });
  } catch (e) {
    res.status(500).json({ error: `清空死信队列失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;