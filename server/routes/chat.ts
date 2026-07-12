/**
 * Chat API — 统一聊天入口（兼容路径）
 *
 * 架构定位：
 * - /api/chat 和 /api/agent-chat 现在统一输出 AgentEventPayload 格式
 * - 两者都委托给 handleAgentChat，底层共享 chatService.handleChat
 * - 消除了双格式问题：只有一个事件格式（AgentEventPayload）
 *
 * 保留 /api/chat 路径仅为向后兼容（旧版前端 URL 引用）
 * 新代码应直接使用 /api/agent-chat
 */

import { Router } from 'express';
import { messageQueue } from '../engine/messageQueue.js';
import { logger } from '../logger.js';
import { activeSSEConnections } from './chatService.js';
import { handleAgentChat } from './agentChat.js';
import { compactionNotificationManager } from '../engine/compaction/compactionNotification.js';

const router = Router();

// 统一聊天入口：委托给 handleAgentChat，输出 AgentEventPayload
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

// ===== 压缩通知 API =====

router.get('/notifications/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const notifications = compactionNotificationManager.getNotifications(sessionId);
  const unreadCount = compactionNotificationManager.getUnreadCount(sessionId);
  res.json({
    ok: true,
    notifications,
    unreadCount,
  });
});

router.post('/notifications/:sessionId/:id/read', (req, res) => {
  const { sessionId, id } = req.params;
  const success = compactionNotificationManager.markAsRead(sessionId, id);
  res.json({ ok: success });
});

router.post('/notifications/:sessionId/read-all', (req, res) => {
  const { sessionId } = req.params;
  compactionNotificationManager.markAllAsRead(sessionId);
  res.json({ ok: true });
});

router.delete('/notifications/:sessionId/:id', (req, res) => {
  const { sessionId, id } = req.params;
  const success = compactionNotificationManager.removeNotification(sessionId, id);
  res.json({ ok: success });
});

router.delete('/notifications/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  compactionNotificationManager.clearAll(sessionId);
  res.json({ ok: true });
});

export default router;
