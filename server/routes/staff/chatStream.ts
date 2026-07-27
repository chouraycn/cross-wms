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
 *   GET    /sessions/:sessionId/events        — 列出会话事件（Trace 时间线，由 /stream 节点事件写入）
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
import * as traceDao from '../../dao/staff/staffTraceDao.js';
import * as agentDao from '../../dao/staff/staffAgentDao.js';
import { runStaffChatTurn, abortStaffChat } from '../../staff/staffChatExecutor.js';
import type { StaffStreamEvent } from '../../types/staff.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

/** 写入一条 SSE 事件（规范格式：event: <type>\\ndata: <json>） */
function writeSse(res: Response, type: string, data: Record<string, unknown>): void {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 兼容旧调用：传 StaffStreamEvent 对象也支持 */
function writeSseEvent(res: Response, event: StaffStreamEvent): void {
  writeSse(res, event.type, event.data);
}

/**
 * 落 Trace 的节点级事件白名单（跳过高频增量 delta，避免 sd_agent_events 膨胀）。
 * 仅这些事件会经 recordTrace 写入 sd_agent_events，供 /sessions/:id/events 回放。
 */
const TRACE_EVENT_TYPES = new Set<string>([
  'session.created',
  'message.saved',
  'thinking.end',
  'text.end',
  'tool.call',
  'error',
  'done',
]);

function recordTrace(
  tenantId: string,
  sessionId: string,
  type: string,
  data: Record<string, unknown>,
): void {
  if (!TRACE_EVENT_TYPES.has(type)) return;
  try {
    traceDao.createEvent(tenantId, sessionId, type, data);
  } catch (e) {
    logger.warn('[StaffChat] 写入 Trace 事件失败:', e);
  }
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
router.post('/turn', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { session_id, agent_id, user_id, message, model } = req.body ?? {};
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'message 不能为空' });
    return;
  }
  if (!agent_id) {
    res.status(400).json({ code: 400, data: null, message: 'agent_id 必填' });
    return;
  }
  // 1. 确保或创建 session
  let session = session_id ? chatDao.getSessionById(tenantId, session_id) : undefined;
  if (!session) {
    session = chatDao.createSession({
      tenant_id: tenantId,
      user_id: user_id ?? null,
      agent_id,
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
  // 3. 历史（最多最近 20 条）
  const history = chatDao
    .listMessages(tenantId, session.id, 20)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    .slice(0, -1); // 去掉刚写入的当前 user 消息

  let accumulated = '';
  let thinking = '';
  try {
    const out = await runStaffChatTurn(
      { tenantId, sessionId: session.id, agentId: agent_id, message, history, model },
      (ev) => {
        const d = ev.data as Record<string, unknown>;
        if (ev.type === 'text.delta') accumulated += (d?.text as string) || '';
        else if (ev.type === 'thinking.delta') thinking += (d?.text as string) || '';
      },
    );
    accumulated = out.content;
    thinking = out.thinkingContent;
  } catch (err) {
    logger.error('[StaffChat] turn 执行失败:', err);
    res.status(500).json({ code: 500, data: null, message: err instanceof Error ? err.message : '对话执行失败' });
    return;
  }

  // 4. 持久化 assistant message
  const assistantMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: session.id,
    role: 'assistant',
    content: accumulated,
    metadata: { thinking: thinking || null, mock: thinking === '' && accumulated.startsWith('（演示模式') },
  });
  res.json({
    code: 0,
    data: {
      session_id: session.id,
      message_id: assistantMsg.id,
      content: accumulated,
      thinking,
    },
    message: 'ok',
  });
});

// ===================== POST /stream — SSE 流式 chat =====================
router.post('/stream', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { session_id, agent_id, user_id, message, model } = req.body ?? {};
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'message 不能为空' });
    return;
  }
  if (!agent_id) {
    res.status(400).json({ code: 400, data: null, message: 'agent_id 必填' });
    return;
  }
  setupSseHeaders(res);

  // 1. 确保或创建 session
  let session = session_id ? chatDao.getSessionById(tenantId, session_id) : undefined;
  if (!session) {
    session = chatDao.createSession({
      tenant_id: tenantId,
      user_id: user_id ?? null,
      agent_id,
      title: message.slice(0, 50),
    });
  }
  writeSse(res, 'session.created', { session_id: session.id });
  recordTrace(tenantId, session.id, 'session.created', { session_id: session.id });

  // 2. 持久化 user message
  const userMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: session.id,
    role: 'user',
    content: message,
  });
  writeSse(res, 'message.saved', { message_id: userMsg.id, role: 'user' });
  recordTrace(tenantId, session.id, 'message.saved', { message_id: userMsg.id, role: 'user' });

  // 3. 历史（最多最近 20 条）
  const history = chatDao
    .listMessages(tenantId, session.id, 20)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    .slice(0, -1); // 去掉刚写入的当前 user 消息

  let finalContent = '';
  try {
    const out = await runStaffChatTurn(
      { tenantId, sessionId: session.id, agentId: agent_id, message, history, model },
      (ev) => {
        const d = ev.data as Record<string, unknown>;
        writeSse(res, ev.type as StaffStreamEvent['type'], d);
        recordTrace(tenantId, session.id, ev.type, d);
        if (ev.type === 'text.delta') finalContent += (d?.text as string) || '';
      },
    );
    finalContent = out.content;
  } catch (err) {
    logger.error('[StaffChat] stream 执行失败:', err);
    writeSse(res, 'error', { message: err instanceof Error ? err.message : '对话执行失败' });
    recordTrace(tenantId, session.id, 'error', { message: err instanceof Error ? err.message : '对话执行失败' });
    writeSse(res, 'done', { session_id: session.id, error: true });
    recordTrace(tenantId, session.id, 'done', { session_id: session.id, error: true });
    res.end();
    return;
  }

  // 4. 持久化 assistant message
  const assistantMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: session.id,
    role: 'assistant',
    content: finalContent,
    metadata: { mock: finalContent.startsWith('（演示模式') },
  });
  writeSse(res, 'message.saved', { message_id: assistantMsg.id, role: 'assistant' });
  recordTrace(tenantId, session.id, 'message.saved', { message_id: assistantMsg.id, role: 'assistant' });
  writeSse(res, 'done', { session_id: session.id, message_id: assistantMsg.id });
  recordTrace(tenantId, session.id, 'done', { session_id: session.id, message_id: assistantMsg.id });
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

// ===================== GET /sessions/:sessionId/events =====================
router.get('/sessions/:sessionId/events', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const limit = parseInt(req.query.limit as string, 10) || 200;
  const rows = traceDao.listEventsBySessionDesc(tenantId, req.params.sessionId, limit);
  res.json({ code: 0, data: rows.map(traceDao.toAgentEventRead), message: 'ok' });
});

// ===================== POST /sessions/:sessionId/cancel =====================
router.post('/sessions/:sessionId/cancel', (req: Request, res: Response) => {
  const cancelled = abortStaffChat(req.params.sessionId);
  res.json({
    code: 0,
    data: { session_id: req.params.sessionId, cancelled },
    message: cancelled ? '已发送取消信号' : '未找到进行中的会话',
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

// ===================== POST /agents/:agentId/use =====================
// AgentsPage / OpenPlatformPage 标记某 Agent 被当前用户"投入使用"（驱动 used_by 标记与画廊可见性）
router.post('/agents/:agentId/use', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const userId = (req.body?.user_id as string) || 'default';
  const agentId = req.params.agentId;
  agentDao.upsertAgentUsage(tenantId, userId, agentId);
  const agent = agentDao.getAgentById(tenantId, agentId);
  if (!agent) {
    res.status(404).json({ code: 404, data: null, message: 'Agent 不存在' });
    return;
  }
  res.json({ code: 0, data: agentDao.toAgentRead(agent), message: 'ok' });
});

export default router;
