import { Router } from 'express';
import { messageQueue } from '../engine/messageQueue.js';
import { logger } from '../logger.js';
import { handleAgentChat } from './agentChat.js';
import { activeSSEConnections } from './chatService.js';

const router = Router();

// 发送消息（SSE）— 已迁移到 Agent Chat 架构
router.post('/chat', async (req, res) => {
  await handleAgentChat(req, res);
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
