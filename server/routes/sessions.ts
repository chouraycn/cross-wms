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
  getSessionsPaged,
  searchSessionsPaged,
  getArchivedSessionsPaged,
  searchArchivedSessionsPaged,
  deleteArchivedSession as daoDeleteArchivedSession,
} from '../engine/sessions/index.js';
import { FileStorage } from '../storage/FileStorage.js';
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
} from '../engine/sessions/index.js';

const router = Router();

// ===================== 原有接口 =====================

// 获取会话列表（支持?q=搜索参数，?limit=&offset=分页参数）
router.get('/', (req, res) => {
  const q = req.query.q as string | undefined;
  const status = req.query.status as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 0, 500);
  const offset = parseInt(req.query.offset as string, 10) || 0;
  const hasPaging = limit > 0;

  // v6.0: 按 status 筛选
  if (status === 'archived') {
    if (hasPaging) {
      const result = q
        ? searchArchivedSessionsPaged(q, limit, offset)
        : getArchivedSessionsPaged(limit, offset);
      return res.json(result);
    }
    const sessions = q ? searchArchivedSessions(q) : getArchivedSessions();
    return res.json({ sessions });
  }
  if (status === 'active') {
    if (hasPaging) {
      const result = q
        ? searchSessionsPaged(q, limit, offset)
        : getSessionsPaged(limit, offset);
      return res.json(result);
    }
    const sessions = getActiveSessions();
    return res.json({ sessions });
  }
  if (status === 'today') {
    const sessions = getTodaySessions();
    return res.json({ sessions });
  }

  // 兼容原有逻辑
  if (hasPaging) {
    const result = q
      ? searchSessionsPaged(q, limit, offset)
      : getSessionsPaged(limit, offset);
    return res.json(result);
  }
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

// 分页获取会话消息（懒加载）
// GET /:id/messages?limit=50&before=N
router.get('/:id/messages', (req, res) => {
  const sessionId = req.params.id;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
  const beforeIndex = req.query.before !== undefined
    ? parseInt(req.query.before as string, 10)
    : undefined;

  const { messages, hasMore, totalCount } = FileStorage.readSessionMessagesPaged(
    sessionId, limit, beforeIndex,
  );

  // 解析 JSON 字符串字段
  const parsed = messages.map((m: any) => {
    let toolCalls = m.toolCalls;
    if (toolCalls && typeof toolCalls === 'string') {
      const MAX_TOOLCALLS_BYTES = 200 * 1024;
      if (Buffer.byteLength(toolCalls, 'utf-8') > MAX_TOOLCALLS_BYTES) {
        try {
          const arr = JSON.parse(toolCalls);
          if (Array.isArray(arr)) {
            toolCalls = JSON.stringify(arr.slice(0, 5).map((tc: any) => ({
              ...tc,
              result: typeof tc.result === 'string' && tc.result.length > 5000
                ? tc.result.slice(0, 5000) + `\n\n[已截断，原大小 ${(Buffer.byteLength(tc.result, 'utf-8') / 1024).toFixed(1)} KB]`
                : tc.result,
            })));
          }
        } catch {
          toolCalls = toolCalls.slice(0, MAX_TOOLCALLS_BYTES) + '...[truncated]';
        }
      }
      try {
        toolCalls = JSON.parse(toolCalls);
      } catch {
        toolCalls = undefined;
      }
    }

    let attachments = m.attachments;
    if (attachments && typeof attachments === 'string') {
      try { attachments = JSON.parse(attachments); } catch { attachments = undefined; }
    }

    let generatedFiles = m.generatedFiles;
    if (generatedFiles && typeof generatedFiles === 'string') {
      try { generatedFiles = JSON.parse(generatedFiles); } catch { generatedFiles = undefined; }
    }

    return { ...m, attachments, toolCalls, generatedFiles };
  });

  res.json({ messages: parsed, hasMore, totalCount });
});

// 获取会话消息（全量，向后兼容）
router.get('/:id', (req, res) => {
  const messages = getSessionMessages(req.params.id);
  // 解析 JSON 字符串字段为数组/对象（DB 中存储为 TEXT）
  const parsed = messages.map((m: any) => {
    let toolCalls = m.toolCalls;
    if (toolCalls && typeof toolCalls === 'string') {
      // 快速检查大小，超大则直接截断后再 parse，避免内存爆炸
      const MAX_TOOLCALLS_BYTES = 200 * 1024;
      if (Buffer.byteLength(toolCalls, 'utf-8') > MAX_TOOLCALLS_BYTES) {
        try {
          const arr = JSON.parse(toolCalls);
          if (Array.isArray(arr)) {
            toolCalls = JSON.stringify(arr.slice(0, 5).map((tc: any) => ({
              ...tc,
              result: typeof tc.result === 'string' && tc.result.length > 5000
                ? tc.result.slice(0, 5000) + `\n\n[已截断，原大小 ${(Buffer.byteLength(tc.result, 'utf-8') / 1024).toFixed(1)} KB]`
                : tc.result,
            })));
          }
        } catch {
          toolCalls = toolCalls.slice(0, MAX_TOOLCALLS_BYTES) + '...[truncated]';
        }
      }
      try {
        toolCalls = JSON.parse(toolCalls);
      } catch {
        toolCalls = undefined;
      }
    }

    let attachments = m.attachments;
    if (attachments && typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
      } catch {
        attachments = undefined;
      }
    }

    let generatedFiles = m.generatedFiles;
    if (generatedFiles && typeof generatedFiles === 'string') {
      try {
        generatedFiles = JSON.parse(generatedFiles);
      } catch {
        generatedFiles = undefined;
      }
    }

    return { ...m, attachments, toolCalls, generatedFiles };
  });
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
