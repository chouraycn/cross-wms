/**
 * StaffDeck Chat Routes — 挂载于 /api/staffdeck/chat
 *
 * 端点：
 *   POST   /turn                              — 同步 chat turn（stub：仅持久化消息）
 *   POST   /stream                            — SSE 流式 chat
 *   POST   /sessions                          — 创建会话
 *   GET    /sessions                          — 列出会话
 *   PUT    /sessions/:sessionId               — 重命名 / 更新会话
 *   DELETE /sessions/:sessionId               — 删除会话
 *   GET    /sessions/:sessionId/messages      — 列出会话消息
 *   GET    /sessions/:sessionId/events        — 列出会话事件（stub）
 *   POST   /sessions/:sessionId/cancel        — 取消当前 turn（stub）
 *   GET    /handoffs                          — 列出人工接管请求
 *   POST   /handoffs/:handoffId/reply         — 回复人工接管
 *   POST   /messages                          — 直接创建消息（不含 chat loop）
 *   GET    /messages/:messageId               — 获取单条消息
 *
 * 说明：
 * - 同步 turn 与流式 stream 的实际 LLM 推理由后续接入。
 * - SSE 响应头设置参考 cross-wms 既有 chat.ts / soul.ts 实现。
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as chatDao from '../../dao/staff/staffChatDao.js';
import type { StaffStreamEvent } from '../../types/staff.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

/** 写入一条 SSE 事件 */
function writeSse(res: Response, event: StaffStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** 设置 SSE 响应头（仅一次） */
function setupSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

// ===================== POST /turn — 同步 chat turn =====================
router.post('/turn', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { session_id, agent_id, user_id, message } = req.body ?? {};
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'message 不能为空' });
    return;
  }
  // 1. 确保或创建 session
  let session = session_id ? chatDao.getSessionById(tenantId, session_id) : undefined;
  if (!session) {
    session = chatDao.createSession({
      tenant_id: tenantId,
      user_id: user_id ?? null,
      agent_id: agent_id ?? null,
      title: message.slice(0, 50),
    });
  }
  // 2. 持久化 user message
  const userMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: session.id,
    role: 'user',
    content: message,
  });
  // TODO: 接入实际 AgentLoop.handle_turn
  // 此处仅持久化一条占位 assistant 回复
  const assistantMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: session.id,
    role: 'assistant',
    content: 'stub: agent loop 尚未接入',
    metadata: { stub: true },
  });
  logger.debug('[StaffChat] turn stub', { sessionId: session.id, userMsgId: userMsg.id });
  res.json({
    code: 0,
    data: {
      session_id: session.id,
      message_id: assistantMsg.id,
      content: assistantMsg.content,
      stub: true,
    },
    message: 'stub: chat turn 尚未接入',
  });
});

// ===================== POST /stream — SSE 流式 chat =====================
router.post('/stream', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { session_id, agent_id, user_id, message } = req.body ?? {};
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'message 不能为空' });
    return;
  }
  setupSseHeaders(res);

  // 1. 确保或创建 session
  let session = session_id ? chatDao.getSessionById(tenantId, session_id) : undefined;
  if (!session) {
    session = chatDao.createSession({
      tenant_id: tenantId,
      user_id: user_id ?? null,
      agent_id: agent_id ?? null,
      title: message.slice(0, 50),
    });
  }
  writeSse(res, { type: 'session.created', data: { session_id: session.id } });

  // 2. 持久化 user message
  const userMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: session.id,
    role: 'user',
    content: message,
  });
  writeSse(res, { type: 'message.saved', data: { message_id: userMsg.id, role: 'user' } });

  // TODO: 接入实际 AgentLoop 流式输出
  // 此处推送一段占位 thinking + text + done
  // 注：thinking.start 未在 StaffStreamEventType 中定义，thinking 阶段由首个 delta 隐式启动
  writeSse(res, { type: 'thinking.delta', data: { text: '处理中...' } });
  writeSse(res, { type: 'thinking.end', data: {} });

  writeSse(res, { type: 'text.delta', data: { text: 'stub: agent loop 尚未接入' } });

  // 3. 持久化 assistant message
  const assistantMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: session.id,
    role: 'assistant',
    content: 'stub: agent loop 尚未接入',
    metadata: { stub: true },
  });
  writeSse(res, { type: 'message.saved', data: { message_id: assistantMsg.id, role: 'assistant' } });

  writeSse(res, { type: 'text.end', data: {} });
  writeSse(res, { type: 'done', data: { session_id: session.id, message_id: assistantMsg.id } });
  res.end();
});

// ===================== POST /sessions — 创建会话 =====================
router.post('/sessions', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { user_id, agent_id, title, status } = req.body ?? {};
  const row = chatDao.createSession({
    tenant_id: tenantId,
    user_id: user_id ?? null,
    agent_id: agent_id ?? null,
    title: title ?? null,
    status: status ?? 'active',
  });
  res.status(201).json({ code: 0, data: chatDao.toSessionRead(row), message: 'ok' });
});

// ===================== GET /sessions — 列出会话 =====================
router.get('/sessions', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = chatDao.listSessions({
    tenantId,
    userId: req.query.user_id as string | undefined,
    agentId: req.query.agent_id as string | undefined,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
  });
  res.json({ code: 0, data: rows.map(chatDao.toSessionRead), message: 'ok' });
});

// ===================== PUT /sessions/:sessionId — 更新会话 =====================
router.put('/sessions/:sessionId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const patch: chatDao.SessionUpdateInput = {};
  if (req.body.title !== undefined) patch.title = req.body.title;
  if (req.body.active_skill_id !== undefined) patch.active_skill_id = req.body.active_skill_id;
  if (req.body.active_step_id !== undefined) patch.active_step_id = req.body.active_step_id;
  if (req.body.slots !== undefined) patch.slots = req.body.slots;
  if (req.body.skill_stack !== undefined) patch.skill_stack = req.body.skill_stack;
  if (req.body.pending_tasks !== undefined) patch.pending_tasks = req.body.pending_tasks;
  if (req.body.summary !== undefined) patch.summary = req.body.summary;
  if (typeof req.body.status === 'string') patch.status = req.body.status;
  if (req.body.agent_id !== undefined) patch.agent_id = req.body.agent_id;
  const row = chatDao.updateSession(tenantId, req.params.sessionId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '会话不存在' });
    return;
  }
  res.json({ code: 0, data: chatDao.toSessionRead(row), message: 'ok' });
});

// ===================== DELETE /sessions/:sessionId — 删除会话 =====================
router.delete('/sessions/:sessionId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ok = chatDao.deleteSession(tenantId, req.params.sessionId);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '会话不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== GET /sessions/:sessionId/messages — 列出消息 =====================
router.get('/sessions/:sessionId/messages', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const rows = chatDao.listMessages(tenantId, req.params.sessionId, limit);
  res.json({ code: 0, data: rows.map(chatDao.toMessageRead), message: 'ok' });
});

// ===================== GET /sessions/:sessionId/events — stub =====================
router.get('/sessions/:sessionId/events', (req: Request, res: Response) => {
  // TODO: 接入 AgentEvent 查询
  logger.debug('[StaffChat] events stub', { sessionId: req.params.sessionId });
  res.json({
    code: 0,
    data: [],
    message: 'stub: 会话事件查询尚未接入',
  });
});

// ===================== POST /sessions/:sessionId/cancel — stub =====================
router.post('/sessions/:sessionId/cancel', (req: Request, res: Response) => {
  // TODO: 接入 AgentLoop 取消逻辑
  logger.debug('[StaffChat] cancel stub', { sessionId: req.params.sessionId });
  res.json({
    code: 0,
    data: { session_id: req.params.sessionId, cancelled: false },
    message: 'stub: turn 取消尚未接入',
  });
});

// ===================== GET /handoffs — 列出人工接管 =====================
router.get('/handoffs', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = chatDao.listHandoffs(tenantId, req.query.status as string | undefined);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== POST /handoffs/:handoffId/reply — 回复 =====================
router.post('/handoffs/:handoffId/reply', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { human_reply, assignee_user_id, status, resume_payload } = req.body ?? {};
  if (!human_reply || typeof human_reply !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'human_reply 必填' });
    return;
  }
  const row = chatDao.replyHandoff(tenantId, req.params.handoffId, {
    human_reply,
    assignee_user_id: assignee_user_id ?? null,
    status: status ?? 'answered',
    resume_payload: resume_payload ?? {},
  });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '人工接管请求不存在' });
    return;
  }
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== POST /messages — 直接创建消息 =====================
router.post('/messages', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { session_id, role, content, metadata } = req.body ?? {};
  if (!session_id || !role || !content) {
    res.status(400).json({ code: 400, data: null, message: 'session_id / role / content 必填' });
    return;
  }
  if (!chatDao.getSessionById(tenantId, session_id)) {
    res.status(404).json({ code: 404, data: null, message: '会话不存在' });
    return;
  }
  const row = chatDao.createMessage({
    tenant_id: tenantId,
    session_id,
    role,
    content,
    metadata: metadata ?? {},
  });
  res.status(201).json({ code: 0, data: chatDao.toMessageRead(row), message: 'ok' });
});

// ===================== GET /messages/:messageId — 获取单条消息 =====================
router.get('/messages/:messageId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = chatDao.getMessageById(tenantId, req.params.messageId);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '消息不存在' });
    return;
  }
  res.json({ code: 0, data: chatDao.toMessageRead(row), message: 'ok' });
});

export default router;
