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
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import * as chatDao from '../../dao/staff/staffChatDao.js';
import * as traceDao from '../../dao/staff/staffTraceDao.js';
import * as agentDao from '../../dao/staff/staffAgentDao.js';
import {
  upsertMessageFeedback,
  deleteMessageFeedback,
} from '../../dao/staff/staffFeedbackDao.js';
import { parseMultipartFiles, ensureUploadsDir, UPLOADS_DIR } from '../../routes/upload.js';
import { runStaffChatTurn, abortStaffChat } from '../../staff/staffChatExecutor.js';
import { recordSkillTransition } from '../../staff/skillEvents.js';
import type { StaffStreamEvent } from '../../types/staff.js';
import { logger } from '../../logger.js';

const router = Router();

function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body?.tenant_id as string) || DEFAULT_TENANT_ID;
}

/** 写入一条 SSE 事件（规范格式：event: <type>\\ndata: <json>） */
function writeSse(res: Response, type: string, data: Record<string, any>): void {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 兼容旧调用：传 StaffStreamEvent 对象也支持 */
function writeSseEvent(res: Response, event: StaffStreamEvent): void {
  writeSse(res, event.type, event.data);
}

/**
 * 落 Trace 的节点级事件白名单。
 * 关键点：这里存的是**前端 useChatSession 期望的事件名**（session_created /
 * user_message_received / stream_delta / stream_end / done / error 等），而非
 * 后端 StaffStreamEvent 的原始名（session.created / text.delta / message.saved）。
 * /sessions/:id/events 回放会被前端轮询恢复（beginRelayRecovery →
 * pollScheduledSessionEvents）走 normalizeSessionEventForStream，只有存前端事件名
 * 才能被正确 hydrate，否则断流恢复会失配。
 */
const TRACE_EVENT_TYPES = new Set<string>([
  'session_created',
  'user_message_received',
  'status',
  'assistant_message_created',
  'stream_end',
  'done',
  'error',
]);

/** 同时写 SSE（实时）与 Trace（持久化，供断流恢复）；res 已结束时只写 trace。 */
function emitEvent(
  res: Response,
  tenantId: string,
  sessionId: string,
  type: string,
  data: Record<string, any>,
): void {
  if (res.writable && !res.writableEnded) {
    writeSse(res, type, data);
  }
  recordTrace(tenantId, sessionId, type, data);
}

function recordTrace(
  tenantId: string,
  sessionId: string,
  type: string,
  data: Record<string, any>,
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
  const { session_id, agent_id, user_id, message, model, enableReflection } = req.body ?? {};
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
      { tenantId, sessionId: session.id, agentId: agent_id, message, history, model, enableReflection: Boolean(enableReflection) },
      (ev) => {
        const d = ev.data as Record<string, any>;
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
// 协议对齐说明：原前端 useChatSession 期望的是 StaffDeck 原生事件名
// （session_created / user_message_received / stream_delta / stream_end / done /
// error），而非本仓 StaffStreamEvent 的原始名（session.created / text.delta /
// message.saved）。此处把后端发射与 trace 存储统一为前端契约，否则聊天 UI 会因
// 事件名/字段不匹配而「假死」（不流式、用户气泡不出现，仅末尾 done）。
router.post('/stream', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { session_id, agent_id, user_id, message, model, enableReflection } = req.body ?? {};
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
  const sid = session.id;
  // 前端 session_created 读 newSessionId || sessionId（见 useChatSession 2947）
  emitEvent(res, tenantId, sid, 'session_created', { newSessionId: sid, sessionId: sid });

  // 2. 持久化 user message
  const userMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: sid,
    role: 'user',
    content: message,
  });
  // 前端 user_message_received 读 message_id 并 bindRealtimeUserToServerMessage
  emitEvent(res, tenantId, sid, 'user_message_received', { message_id: userMsg.id, sessionId: sid });

  // 3. 历史（最多最近 20 条）
  const history = chatDao
    .listMessages(tenantId, sid, 20)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    .slice(0, -1); // 去掉刚写入的当前 user 消息

  let finalContent = '';
  try {
    const out = await runStaffChatTurn(
      { tenantId, sessionId: sid, agentId: agent_id, message, history, model, enableReflection: Boolean(enableReflection) },
      (ev) => {
        const d = ev.data as Record<string, any>;
        // 只把前端能消费的事件映射到前端契约，其余（thinking.* / text.end）忽略。
        if (ev.type === 'text.delta') {
          // 前端 useChatSession 读 event.data.text（兼容 stream_delta / text.delta / token）
          emitEvent(res, tenantId, sid, 'stream_delta', {
            text: typeof d.text === 'string' ? d.text : '',
            sessionId: sid,
          });
          finalContent += (d?.text as string) || '';
        } else if (ev.type === 'thinking.delta') {
          // 前端 useChatSession 读 event.data.text 追加到 trace.thinking 行
          emitEvent(res, tenantId, sid, 'thinking.delta', {
            text: typeof d.text === 'string' ? d.text : '',
            sessionId: sid,
          });
        } else if (ev.type === 'tool.call') {
          // 前端 status(phase=tool) 展示「正在调用 X」运行态 trace 行
          const toolName = typeof d.toolName === 'string' && d.toolName ? d.toolName : '工具';
          emitEvent(res, tenantId, sid, 'status', {
            phase: 'tool',
            tool_name: toolName,
            tool_call_id: toolName,
            sessionId: sid,
          });
        }
      },
    );
    finalContent = out.content;
  } catch (err) {
    logger.error('[StaffChat] stream 执行失败:', err);
    const errMsg = err instanceof Error ? err.message : '对话执行失败';
    emitEvent(res, tenantId, sid, 'error', { message: errMsg, sessionId: sid });
    // 发 done(error:true) 让前端 markStreamTerminal 不再触发 relayRecovery
    emitEvent(res, tenantId, sid, 'done', { session_id: sid, error: true });
    res.end();
    return;
  }

  // 4. 持久化 assistant message
  const assistantMsg = chatDao.createMessage({
    tenant_id: tenantId,
    session_id: sid,
    role: 'assistant',
    content: finalContent,
    metadata: { mock: finalContent.startsWith('（演示模式') },
  });
  // assistant_message_created 仅入 trace（供断流恢复经 normalizeSessionEventForStream
  // → stream_replace 重放），不进实时流，避免 stream_delta 后重复替换造成闪烁。
  recordTrace(tenantId, sid, 'assistant_message_created', {
    message_id: assistantMsg.id,
    sessionId: sid,
    role: 'assistant',
    reply: finalContent,
  });
  emitEvent(res, tenantId, sid, 'stream_end', { sessionId: sid });
  emitEvent(res, tenantId, sid, 'done', { session_id: sid, message_id: assistantMsg.id });
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

  // 变更前快照，用于判定技能切换方向
  const beforeRow = chatDao.getSessionById(tenantId, req.params.sessionId);

  const row = chatDao.updateSession(tenantId, req.params.sessionId, patch);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '会话不存在' });
    return;
  }

  if (beforeRow) {
    recordSkillTransition(
      tenantId,
      req.params.sessionId,
      {
        skillId: beforeRow.active_skill_id,
        stepId: beforeRow.active_step_id,
        stack: chatDao.toSessionRead(beforeRow).skill_stack ?? [],
      },
      { skillId: row.active_skill_id, stepId: row.active_step_id },
    );
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

// ===================== POST /attachments — 聊天附件上传 =====================
// 前端 uploadChatAttachments 以 multipart/form-data 发送字段 files（可多文件），
// 期望返回 ChatAttachmentRead[]。此端点补全原缺失 handler，避免聊天传文件死链。
router.post('/attachments', async (req: Request, res: Response) => {
  try {
    const files = await parseMultipartFiles(req);
    if (!files.length) {
      res.status(400).json({ code: 400, data: null, message: '未检测到上传文件' });
      return;
    }
    ensureUploadsDir();
    const chatDir = path.join(UPLOADS_DIR, 'chat');
    if (!fs.existsSync(chatDir)) fs.mkdirSync(chatDir, { recursive: true });

    const data = files.map((f) => {
      const ext = path.extname(f.fileName).toLowerCase().replace('.', '') || 'bin';
      const fileId = uuidv4();
      const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
      const savedName = `${fileId}.${safeExt}`;
      fs.writeFileSync(path.join(chatDir, savedName), f.data);
      const isImage = f.mimeType.startsWith('image/');
      const kind: 'text' | 'pdf' | 'image' | 'binary' = isImage
        ? 'image'
        : f.mimeType === 'application/pdf'
          ? 'pdf'
          : f.mimeType.startsWith('text/')
            ? 'text'
            : 'binary';
      return {
        id: fileId,
        filename: f.fileName,
        content_type: f.mimeType,
        size: f.data.length,
        kind,
        text: null,
        preview: null,
        data_url: null,
        python_summary: null,
        error: null,
      };
    });
    res.json({ code: 0, data, message: 'ok' });
  } catch (err) {
    logger.error('[StaffChat] 附件上传失败:', err);
    res.status(500).json({
      code: 500,
      data: null,
      message: err instanceof Error ? err.message : '附件上传失败',
    });
  }
});

// ===================== GET /sessions/:sessionId/trace — 会话 Trace 时间线 =====================
// 前端 useChatSession.loadTraces / ConversationLogsTab 期望 TurnTraceRead[]（按 turn 分组）。
// 由 sd_agent_events 中已存的前端事件名（session_created / user_message_received /
// stream_delta / status / assistant_message_created / done / error）分组重建。
function toIso(sec: number | undefined): string {
  return sec ? new Date(sec * 1000).toISOString() : new Date().toISOString();
}

function buildTurnTraces(
  tenantId: string,
  sessionId: string,
): Array<{
  turn_id: string;
  user_message_id: string | null;
  started_at: string;
  completed_at: string | null;
  lines: Array<{
    id: string;
    kind: 'thinking' | 'decision' | 'skill' | 'tool' | 'code' | 'knowledge';
    text: string;
    detail?: string | null;
    code?: string | null;
    language?: string | null;
    output?: string | null;
    outputLanguage?: string | null;
    outputTitle?: string | null;
    state: 'running' | 'completed' | 'failed';
    collapsible?: boolean | null;
  }>;
}> {
  const events = traceDao.listEventsBySession(tenantId, sessionId); // 升序
  const turns: Array<{
    turn_id: string;
    user_message_id: string | null;
    started_at: string;
    completed_at: string | null;
    lines: Array<{
      id: string;
      kind: 'thinking' | 'decision' | 'skill' | 'tool' | 'code' | 'knowledge';
      text: string;
      detail?: string | null;
      code?: string | null;
      language?: string | null;
      output?: string | null;
      outputLanguage?: string | null;
      outputTitle?: string | null;
      state: 'running' | 'completed' | 'failed';
      collapsible?: boolean | null;
    }>;
  }> = [];
  let current: (typeof turns)[number] | null = null;

  const startTurn = (userMessageId: string | null, startedAt: number | undefined) => {
    current = {
      turn_id: userMessageId || `turn-${turns.length}`,
      user_message_id: userMessageId,
      started_at: toIso(startedAt),
      completed_at: null,
      lines: [],
    };
    turns.push(current);
  };

  for (const ev of events) {
    const p = (((ev.payload_json as string | null) ?? '{}') as unknown as Record<string, any>);
    if (ev.event_type === 'user_message_received') {
      startTurn(typeof p.message_id === 'string' ? p.message_id : null, ev.created_at);
      continue;
    }
    if (ev.event_type === 'session_created' && !current) {
      startTurn(null, ev.created_at);
      continue;
    }
    if (!current) startTurn(null, ev.created_at);
    const cur = current!;

    if (ev.event_type === 'status' && p.phase === 'tool') {
      cur.lines.push({
        id: ev.id,
        kind: 'tool',
        text: `调用工具：${typeof p.tool_name === 'string' ? p.tool_name : '工具'}`,
        detail: typeof p.tool_call_id === 'string' ? p.tool_call_id : null,
        state: 'completed',
        collapsible: true,
      });
    } else if (ev.event_type === 'assistant_message_created') {
      cur.lines.push({
        id: ev.id,
        kind: 'decision',
        text: '生成回复完成',
        state: 'completed',
      });
    } else if (ev.event_type === 'error') {
      cur.lines.push({
        id: ev.id,
        kind: 'decision',
        text: typeof p.message === 'string' ? p.message : '执行出错',
        state: 'failed',
      });
      cur.completed_at = toIso(ev.created_at);
    } else if (ev.event_type === 'done' || ev.event_type === 'stream_end') {
      cur.completed_at = toIso(ev.created_at);
    }
  }
  // 未显式收尾的 turn 标记完成
  for (const t of turns) if (!t.completed_at) t.completed_at = t.started_at;
  return turns;
}

router.get('/sessions/:sessionId/trace', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const turns = buildTurnTraces(tenantId, req.params.sessionId);
  res.json({ code: 0, data: turns, message: 'ok' });
});

// ===================== POST /messages/:messageId/feedback — 消息反馈 👍/👎 =====================
// 前端 rateMessage：POST { tenant_id, rating:'up'|'down' }；取消时 DELETE ?tenant_id。
// sd_message_feedback 唯一约束 (tenant, message, user)；user 取 default（桌面嵌入登录态）。
router.post('/messages/:messageId/feedback', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const { rating, tenant_id: bodyTenant } = req.body ?? {};
  const messageId = req.params.messageId;
  if (rating !== 'up' && rating !== 'down') {
    res.status(400).json({ code: 400, data: null, message: 'rating 仅支持 up / down' });
    return;
  }
  const msg = chatDao.getMessageById(tenantId, messageId);
  if (!msg) {
    res.status(404).json({ code: 404, data: null, message: '消息不存在' });
    return;
  }
  const row = upsertMessageFeedback({
    tenant_id: bodyTenant || tenantId,
    session_id: msg.session_id,
    message_id: messageId,
    user_id: 'default',
    rating,
  });
  res.json({ code: 0, data: row, message: 'ok' });
});

// ===================== DELETE /messages/:messageId/feedback — 取消反馈 =====================
router.delete('/messages/:messageId/feedback', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const messageId = req.params.messageId;
  const ok = deleteMessageFeedback(tenantId, messageId, 'default');
  res.json({ code: 0, data: { deleted: ok }, message: 'ok' });
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
  res.json({ code: 0, data: agentDao.buildAgentReader(tenantId)(agent), message: 'ok' });
});

export default router;
