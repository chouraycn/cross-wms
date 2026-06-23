import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  getSessions,
  searchSessions,
  createSession,
  getSessionMessages,
  deleteSession,
  moveSessionToFolder,
  updateSession,
} from '../dao/chat.js';
import {
  getActiveSessions,
  getArchivedSessions,
  searchArchivedSessions,
  archiveSession,
  restoreSession,
  getSubSessions,
  createSubSession,
  getTodaySessions,
  deleteArchivedSession,
  touchSession,
  sessionLifecycleManager,
} from '../services/sessionLifecycle.js';

const router = Router();

// ===================== 原有接口 =====================

// 获取会话列表（支持?q=搜索参数）
router.get('/', (req, res) => {
  const q = req.query.q as string | undefined;
  const status = req.query.status as string | undefined;

  // v6.0: 按 status 筛选
  if (status === 'archived') {
    const sessions = q ? searchArchivedSessions(q) : getArchivedSessions();
    return res.json({ sessions });
  }
  if (status === 'active') {
    const sessions = getActiveSessions();
    return res.json({ sessions });
  }
  if (status === 'today') {
    const sessions = getTodaySessions();
    return res.json({ sessions });
  }

  // 兼容原有逻辑
  const sessions = q ? searchSessions(q) : getSessions();
  res.json({ sessions });
});

// 创建会话
router.post('/', (req, res) => {
  const { title, model, agentId, parentSessionId, tags } = req.body;

  // v6.0: 创建子会话
  if (parentSessionId) {
    const subSession = createSubSession(parentSessionId, title || '子任务', model || 'auto', tags);
    return res.json({ session: subSession });
  }

  const session = createSession(uuidv4(), title || '新对话', model || 'auto', agentId, undefined, undefined, tags);
  res.json({ session });
});

// 获取会话消息
router.get('/:id', (req, res) => {
  const messages = getSessionMessages(req.params.id);
  // 解析 JSON 字符串字段为数组/对象（DB 中存储为 TEXT）
  const parsed = messages.map((m: any) => ({
    ...m,
    attachments: m.attachments ? (typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments) : undefined,
    toolCalls: m.toolCalls ? (typeof m.toolCalls === 'string' ? JSON.parse(m.toolCalls) : m.toolCalls) : undefined,
  }));
  res.json({ messages: parsed });
});

// 删除会话
router.delete('/:id', (req, res) => {
  const { permanent } = req.query;
  // v6.0: 归档会话可永久删除
  if (permanent === 'true') {
    const ok = deleteArchivedSession(req.params.id);
    return res.json({ ok });
  }
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// 更新会话标题
router.patch('/:id', (req, res) => {
  const { title, tags } = req.body;
  const updates: { title?: string; tags?: string } = {};

  if (title) {
    updates.title = title;
  }
  if (tags) {
    updates.tags = JSON.stringify(tags);
  }

  if (Object.keys(updates).length > 0) {
    updateSession(req.params.id, updates);
  }

  res.json({ ok: true });
});

// 移动会话到文件夹
router.post('/:id/move', (req, res) => {
  const { folderId } = req.body;
  moveSessionToFolder(req.params.id, folderId || null);
  res.json({ ok: true });
});

// ===================== v6.0: 生命周期 API =====================

// 归档会话
router.post('/:id/archive', (req, res) => {
  const { summary } = req.body;
  const ok = archiveSession(req.params.id, summary);
  if (!ok) {
    return res.status(404).json({ error: '会话不存在或已归档' });
  }
  res.json({ ok: true });
});

// 恢复归档会话
router.post('/:id/restore', (req, res) => {
  const ok = restoreSession(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: '会话不存在或未归档' });
  }
  res.json({ ok: true });
});

// 更新最后活跃时间（心跳）
router.post('/:id/touch', (req, res) => {
  touchSession(req.params.id);
  res.json({ ok: true });
});

// 获取子会话
router.get('/:id/sub-sessions', (req, res) => {
  const subSessions = getSubSessions(req.params.id);
  res.json({ sessions: subSessions });
});

// 获取生命周期管理器状态
router.get('/_lifecycle/status', (req, res) => {
  res.json(sessionLifecycleManager.getStatus());
});

export default router;
