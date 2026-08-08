/**
 * StaffDeck Traces Routes — /api/staffdeck/traces
 *
 * 端点：
 *   GET /            所有追踪会话列表
 *   GET /:session_id 单会话事件流（含会话详情 + 消息 + 事件）
 *
 * 响应格式统一为 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import {
  listSessions,
  toSessionRead,
  listMessagesBySession,
  toMessageRead,
  getSessionById,
} from '../../dao/staff/staffSessionDao.js';
import {
  listEventsBySession,
  listEventsBySessionDesc,
  toAgentEventRead,
} from '../../dao/staff/staffTraceDao.js';
import { getStaffContext, staffAuth } from '../../middleware/staffAuth.js';

const router = Router();

// ===================== GET /api/staffdeck/traces — 追踪会话列表 =====================

router.get('/', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;

  const sessions = listSessions({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    agentId,
  });

  const items = sessions.map((session) => {
    const events = listEventsBySessionDesc(ctx.tenantId, session.id, 30);
    const messages = listMessagesBySession(ctx.tenantId, session.id);
    const reversedEvents = [...events].reverse();
    const lastDecisionEvent = reversedEvents.find(
      (e) => e.event_type === 'router_decision_created',
    );
    let lastDecision: any = null;
    if (lastDecisionEvent) {
      try {
        lastDecision = lastDecisionEvent.payload_json
          ? JSON.parse(lastDecisionEvent.payload_json)
          : null;
      } catch {
        lastDecision = null;
      }
    }
    const toolCallCount = events.filter((e) => e.event_type === 'tool_call_finished').length;
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    return {
      session_id: session.id,
      user_id: session.user_id,
      active_skill_id: session.active_skill_id,
      active_step_id: session.active_step_id,
      last_decision: lastDecision,
      last_message: lastMessage ? lastMessage.content : null,
      last_message_time: lastMessage ? lastMessage.created_at : null,
      tool_call_count: toolCallCount,
      status: session.status,
      updated_at: session.updated_at,
    };
  });

  // 按 updated_at 降序
  items.sort((a, b) => b.updated_at - a.updated_at);
  res.json({ code: 0, data: items, message: 'ok' });
});

// ===================== GET /api/staffdeck/traces/:session_id — 单会话事件流 =====================

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

export default router;
