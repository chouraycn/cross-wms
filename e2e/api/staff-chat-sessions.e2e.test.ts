import express from 'express';
import request from 'supertest';
import chatStreamRouter from '../../server/routes/staff/chatStream.js';

/**
 * 覆盖 ChatPage（对话大厅）依赖的会话 CRUD 契约：
 * 创建会话 → 列表可见 → 删除 → 列表不可见。
 * 后端 /api/staffdeck/chat/sessions 已真实实现，本测试为契约冒烟。
 */
describe('员工对话大厅 — 会话 CRUD 契约', () => {
  const app = express();
  app.use(express.json());
  app.use('/chat', chatStreamRouter);

  const tenant = `test-chatpage-sessions-${Date.now()}`;
  const title = `session-hall-${Date.now()}`;

  it('创建会话后可在列表中查到，删除后消失', async () => {
    const created = await request(app)
      .post(`/chat/sessions?tenant_id=${tenant}`)
      .send({ title, status: 'active' });
    expect(created.body.code).toBe(0);
    expect(created.body.data.id).toBeTruthy();
    const sessionId = created.body.data.id;

    const listed = await request(app).get(`/chat/sessions?tenant_id=${tenant}`);
    expect(listed.body.code).toBe(0);
    const ids = (listed.body.data || []).map((s: { id: string }) => s.id);
    expect(ids).toContain(sessionId);

    const deleted = await request(app)
      .delete(`/chat/sessions/${sessionId}?tenant_id=${tenant}`);
    expect(deleted.body.code).toBe(0);

    const listedAfter = await request(app).get(`/chat/sessions?tenant_id=${tenant}`);
    const idsAfter = (listedAfter.body.data || []).map((s: { id: string }) => s.id);
    expect(idsAfter).not.toContain(sessionId);
  });

  it('按 agent_id 过滤会话', async () => {
    const agentId = `agent-filter-${Date.now()}`;
    const a = await request(app)
      .post(`/chat/sessions?tenant_id=${tenant}`)
      .send({ title: `${title}-a`, agent_id: agentId });
    const b = await request(app)
      .post(`/chat/sessions?tenant_id=${tenant}`)
      .send({ title: `${title}-b`, agent_id: 'other-agent' });
    expect(a.body.code).toBe(0);
    expect(b.body.code).toBe(0);

    const filtered = await request(app).get(`/chat/sessions?tenant_id=${tenant}&agent_id=${agentId}`);
    const ids = (filtered.body.data || []).map((s: { id: string }) => s.id);
    expect(ids).toContain(a.body.data.id);
    expect(ids).not.toContain(b.body.data.id);

    await request(app).delete(`/chat/sessions/${a.body.data.id}?tenant_id=${tenant}`);
    await request(app).delete(`/chat/sessions/${b.body.data.id}?tenant_id=${tenant}`);
  });
});
