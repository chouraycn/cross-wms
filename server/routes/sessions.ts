import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db.js';
import {
  getSessions,
  searchSessions,
  createSession,
  getSessionMessages,
  deleteSession,
  moveSessionToFolder,
} from '../dao/chat.js';

const router = Router();

// 获取会话列表（支持?q=搜索参数）
router.get('/', (req, res) => {
  const q = req.query.q as string | undefined;
  const sessions = q ? searchSessions(q) : getSessions();
  res.json({ sessions });
});

// 创建会话
router.post('/', (req, res) => {
  const { title, model, agentId } = req.body;
  const session = createSession(uuidv4(), title || '新对话', model || 'auto', agentId);
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
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// 更新会话标题
router.patch('/:id', (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  const db = initDb();
  db.prepare('UPDATE sessions SET title = ?, updatedAt = ? WHERE id = ?').run(title, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

// 移动会话到文件夹
router.post('/:id/move', (req, res) => {
  const { folderId } = req.body;
  moveSessionToFolder(req.params.id, folderId || null);
  res.json({ ok: true });
});

export default router;
