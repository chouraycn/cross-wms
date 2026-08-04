import express from 'express';
import request from 'supertest';
import chatStreamRouter from '../../server/routes/staff/chatStream.js';
import * as agentDao from '../../server/dao/staff/staffAgentDao.js';

// 与 staff-chat-turn 一致：mock 模型配置加载，强制走演示模式兜底，
// 避免依赖真实 ollama 端点（不可达时 /stream 会挂起超时）。
vi.mock('../../server/modelsStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    loadModelsConfig: async () => {
      throw new Error('no model config in test env → mock fallback');
    },
  };
});

/**
 * 覆盖 Round4 的核心能力：/stream 在路由层把节点级事件写入 sd_agent_events（Trace），
 * 跳过高频增量 delta（防止表膨胀），并可通过 /sessions/:id/events 回放。
 * 注意：落库事件名已统一为前端 useChatSession 契约（session_created /
 * user_message_received / assistant_message_created / stream_end / done / error），
 * 而非后端原始名（session.created / message.saved）。stream_delta 仍实时发 SSE，
 * 但不落 Trace（避免高频增量撑爆 sd_agent_events）。
 */
describe('员工聊天 /stream → Trace 落库', () => {
  const app = express();
  app.use(express.json());
  app.use('/chat', chatStreamRouter);

  const tenant = 'test-trace-round4';

  it('流式对话后节点事件写入 Trace（前端契约名），且不含高频 delta', async () => {
    // 创建真实员工，确保 /stream 走正常完成路径（而非 agent 不存在的 error 分支）
    const agent = agentDao.createAgent({
      tenant_id: tenant,
      name: `agent-trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      persona_prompt: '你是测试数字员工。',
    });
    const agentId = agent.id;

    const sess = await request(app)
      .post(`/chat/sessions?tenant_id=${tenant}`)
      .send({ agent_id: agentId, title: 'trace-test' });
    expect(sess.body.code).toBe(0);
    const sessionId = sess.body.data.id;

    const res = await request(app)
      .post('/chat/stream')
      .send({
        tenant_id: tenant,
        agent_id: agentId,
        session_id: sessionId,
        message: '你好，请简要介绍一下你自己',
      })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c) => {
          data += c;
        });
        r.on('end', () => cb(null, data));
      })
      .expect(200);

    // 流应以 done 事件结束
    expect(String(res.body)).toContain('event: done');

    const events = await request(app).get(
      `/chat/sessions/${sessionId}/events?tenant_id=${tenant}`,
    );
    expect(events.body.code).toBe(0);
    const rows = events.body.data as Array<{ event_type: string; payload: Record<string, unknown> }>;
    const types = rows.map((e) => e.event_type);

    // 节点级事件应落 Trace（前端契约名）
    expect(types).toContain('session_created');
    expect(types).toContain('user_message_received');
    expect(types).toContain('assistant_message_created');
    expect(types).toContain('done');
    // 正常完成路径应记录 assistant 消息落库事件
    expect(
      rows.some(
        (e) => e.event_type === 'assistant_message_created' && e.payload?.role === 'assistant',
      ),
    ).toBe(true);
    // 高频增量 delta 不应落库（白名单过滤）
    expect(types).not.toContain('stream_delta');
    expect(types).not.toContain('thinking.delta');
  });
});
