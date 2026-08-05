/**
 * StaffDeck Chat DAO 测试
 *
 * 覆盖 sd_sessions / sd_messages 的 CRUD 与级联删除行为。
 * 使用真实内存 SQLite + initStaffTables 建表，避免 mock 偏差。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

// ===================== Mock 依赖 =====================

let mockDb: DatabaseType;

// staffChatDao 通过 '../db.js' 的 initDb() 获取连接，mock 为内存库
vi.mock('../../../db.js', () => ({
  initDb: () => mockDb,
}));

// db-staff 提供 initStaffTables / DEFAULT_TENANT_ID / newStaffId / StaffIdPrefix
// 直接使用真实实现，保证建表与 ID 生成逻辑一致
import { initStaffTables, DEFAULT_TENANT_ID } from '../../../db-staff.js';

// ===================== 测试套件 =====================

describe('StaffDeck Chat DAO', () => {
  beforeEach(() => {
    mockDb = new Database(':memory:');
    initStaffTables(mockDb);
  });

  describe('Session CRUD', () => {
    it('createSession 应生成 ID 并落库', async () => {
      const { createSession, getSessionById } = await import('../staffChatDao.js');
      const row = createSession({
        tenant_id: DEFAULT_TENANT_ID,
        agent_id: 'agent-001',
        title: '测试会话',
      });
      expect(row.id).toBeTruthy();
      expect(row.title).toBe('测试会话');
      expect(row.agent_id).toBe('agent-001');
      expect(row.status).toBe('active');

      const fetched = getSessionById(DEFAULT_TENANT_ID, row.id);
      expect(fetched?.id).toBe(row.id);
    });

    it('listSessions 应支持 agentId 过滤与按 updated_at 倒序', async () => {
      const { createSession, listSessions } = await import('../staffChatDao.js');
      const a1 = createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'agent-A', title: 'A1' });
      // 微小延时确保 updated_at 不同
      await new Promise((r) => setTimeout(r, 1100));
      const a2 = createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'agent-A', title: 'A2' });
      createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'agent-B', title: 'B1' });

      const list = listSessions({ tenantId: DEFAULT_TENANT_ID, agentId: 'agent-A' });
      expect(list).toHaveLength(2);
      // 最新更新的在前
      expect(list[0].id).toBe(a2.id);
      expect(list[1].id).toBe(a1.id);
    });

    it('updateSession 应更新字段并保留未传入字段', async () => {
      const { createSession, updateSession, getSessionById } = await import('../staffChatDao.js');
      const row = createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'agent-1', title: '原标题' });

      const updated = updateSession(DEFAULT_TENANT_ID, row.id, {
        title: '新标题',
        status: 'archived',
      });
      expect(updated?.title).toBe('新标题');
      expect(updated?.status).toBe('archived');
      expect(updated?.agent_id).toBe('agent-1'); // 未传入字段保留

      const fetched = getSessionById(DEFAULT_TENANT_ID, row.id);
      expect(fetched?.title).toBe('新标题');
    });

    it('updateSession 对不存在的 sessionId 应返回 null', async () => {
      const { updateSession } = await import('../staffChatDao.js');
      const result = updateSession(DEFAULT_TENANT_ID, 'non-existent', { title: 'x' });
      expect(result).toBeNull();
    });

    it('deleteSession 应级联删除关联 messages', async () => {
      const { createSession, createMessage, deleteSession, getSessionById, listMessages } = await import(
        '../staffChatDao.js'
      );
      const session = createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'agent-1', title: 'S' });
      createMessage({ tenant_id: DEFAULT_TENANT_ID, session_id: session.id, role: 'user', content: 'hi' });
      createMessage({ tenant_id: DEFAULT_TENANT_ID, session_id: session.id, role: 'assistant', content: 'hello' });

      expect(listMessages(DEFAULT_TENANT_ID, session.id, 100)).toHaveLength(2);

      const ok = deleteSession(DEFAULT_TENANT_ID, session.id);
      expect(ok).toBe(true);
      expect(getSessionById(DEFAULT_TENANT_ID, session.id)).toBeUndefined();
      // 级联删除 messages
      expect(listMessages(DEFAULT_TENANT_ID, session.id, 100)).toHaveLength(0);
    });

    it('deleteSession 对不存在的 sessionId 应返回 false', async () => {
      const { deleteSession } = await import('../staffChatDao.js');
      expect(deleteSession(DEFAULT_TENANT_ID, 'non-existent')).toBe(false);
    });

    it('listSessions search 应匹配 title', async () => {
      const { createSession, listSessions } = await import('../staffChatDao.js');
      createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'a', title: '入库管理咨询' });
      createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'a', title: '出库异常' });

      const matched = listSessions({ tenantId: DEFAULT_TENANT_ID, search: '入库' });
      expect(matched).toHaveLength(1);
      expect(matched[0].title).toBe('入库管理咨询');
    });
  });

  describe('Message CRUD', () => {
    it('createMessage 应按顺序落库', async () => {
      const { createSession, createMessage, listMessages } = await import('../staffChatDao.js');
      const session = createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'a', title: 'S' });
      const m1 = createMessage({ tenant_id: DEFAULT_TENANT_ID, session_id: session.id, role: 'user', content: '第一' });
      const m2 = createMessage({ tenant_id: DEFAULT_TENANT_ID, session_id: session.id, role: 'assistant', content: '第二' });

      const list = listMessages(DEFAULT_TENANT_ID, session.id, 100);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(m1.id);
      expect(list[1].id).toBe(m2.id);
    });

    it('listMessages limit 应限制返回数量', async () => {
      const { createSession, createMessage, listMessages } = await import('../staffChatDao.js');
      const session = createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'a', title: 'S' });
      for (let i = 0; i < 10; i++) {
        createMessage({ tenant_id: DEFAULT_TENANT_ID, session_id: session.id, role: 'user', content: `m${i}` });
      }
      const list = listMessages(DEFAULT_TENANT_ID, session.id, 5);
      expect(list).toHaveLength(5);
    });

    it('deleteMessage 应仅删除指定消息', async () => {
      const { createSession, createMessage, deleteMessage, listMessages } = await import('../staffChatDao.js');
      const session = createSession({ tenant_id: DEFAULT_TENANT_ID, agent_id: 'a', title: 'S' });
      const m1 = createMessage({ tenant_id: DEFAULT_TENANT_ID, session_id: session.id, role: 'user', content: '保留' });
      const m2 = createMessage({ tenant_id: DEFAULT_TENANT_ID, session_id: session.id, role: 'user', content: '删除' });

      deleteMessage(DEFAULT_TENANT_ID, m2.id);
      const list = listMessages(DEFAULT_TENANT_ID, session.id, 100);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(m1.id);
    });
  });
});
