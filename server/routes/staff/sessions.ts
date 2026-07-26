/**
 * StaffDeck Sessions Routes — /api/staffdeck/sessions
 *
 * 端点：
 *   GET /                  会话列表
 *   GET /:session_id       单会话详情（含消息和事件）
 *   POST /:session_id/reset 重置会话运行时状态
 *
 * 响应格式统一为 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import {
  listSessions,
  getSessionById,
  toSessionRead,
  resetSession,
  listMessagesBySession,
  toMessageRead,
} from '../../dao/staff/staffSessionDao.js';
import { listEventsBySession, toAgentEventRead } from '../../dao/staff/staffTraceDao.js';
import { getStaffContext, staffAuth } from '../../middleware/staffAuth.js';

const router = Router();

// ===================== GET /api/staffdeck/sessions — 会话列表 =====================

router.get('/', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;

  const sessions = listSessions({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    agentId,
  });

  const items = sessions.map(toSessionRead);
  res.json({ code: 0, data: items, message: 'ok' });
});

// ===================== GET /api/staffdeck/sessions/:session_id — 单会话详情 =====================

router.get('/:session_id', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const sessionId = req.params.session_id;

  const session = getSessionById(ctx.tenantId, sessionId);
  if (!session || session.user_id !== ctx.userId) {
    res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    return;
  }

  const messages = listMessagesBySession(ctx.tenantId, sessionId).map(toMessageRead);
  const events = listEventsBySession(ctx.tenantId, sessionId).map(toAgentEventRead);

  res.json({
    code: 0,
    data: {
      session: toSessionRead(session),
      messages,
      events,
    },
    message: 'ok',
  });
});

// ===================== POST /api/staffdeck/sessions/:session_id/reset — 重置会话 =====================

router.post('/:session_id/reset', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const sessionId = req.params.session_id;

  const session = getSessionById(ctx.tenantId, sessionId);
  if (!session || session.user_id !== ctx.userId) {
    res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    return;
  }

  const updated = resetSession(ctx.tenantId, sessionId);
  if (!updated) {
    res.status(500).json({ code: 500, data: null, message: '会话重置失败' });
    return;
  }
  res.json({ code: 0, data: toSessionRead(updated), message: 'ok' });
});

export default router;
