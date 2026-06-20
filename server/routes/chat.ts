import { Router } from 'express';
import { messageQueue } from '../engine/messageQueue.js';
import { logger } from '../logger.js';
import { handleChat, activeSSEConnections } from './chatService.js';
import { handlePermissionResponse } from './toolPermissionService.js';

const router = Router();

// 发送消息（SSE）
router.post('/chat', async (req, res) => {
  await handleChat(req, res);
});

// v1.9.2: 工具权限响应 — 前端通过此端点回复权限请求
router.post('/permission-response', (req, res) => {
  const { reqId, approved, alwaysAllow, toolCategory } = req.body;
  if (!reqId) {
    return res.status(400).json({ error: 'reqId is required' });
  }
  handlePermissionResponse(reqId, approved, alwaysAllow, toolCategory);
  res.json({ ok: true });
});

// v7.0: 获取队列状态
router.get('/queue-status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.json({
    sessionId,
    state: messageQueue.getSessionState(sessionId),
    queueLength: messageQueue.getQueueLength(sessionId),
    activeGlobalCount: messageQueue.getActiveCount(),
    canAcceptGlobal: messageQueue.canAcceptGlobal(),
  });
});

// v7.0: 取消队列中所有消息
router.post('/queue-cancel/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const cancelledCount = messageQueue.cancelAll(sessionId);
  activeSSEConnections.delete(sessionId);
  res.json({ ok: true, cancelledCount });
});

export default router;
