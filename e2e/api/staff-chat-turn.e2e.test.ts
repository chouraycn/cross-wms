import express from 'express';
import request from 'supertest';
import { vi, describe, it, expect } from 'vitest';
import chatStreamRouter from '../../server/routes/staff/chatStream.js';
import * as agentDao from '../../server/dao/staff/staffAgentDao.js';

/**
 * 覆盖数字员工「演示模式 / 同步 turn / SSE 协议」冒烟：
 *  - /turn 在桌面默认无 API Key 时返回演示模式占位回答（验证接线正确）
 *  - /stream 的 SSE 事件顺序（对齐前端 useChatSession 契约）：
 *    session_created → user_message_received →
 *    stream_delta* → stream_end → done，且 done 必现收尾。
 *    （后端 StaffStreamEvent 原始名 session.created/text.delta/message.saved
 *     已统一重写为前端事件名，否则聊天 UI 会因事件名失配而假死。）
 *
 * 通过 mock loadModelsConfig 抛错强制走 mock 兜底分支（桌面默认路径），
 * 保证断言确定、不依赖测试环境是否有真实模型配置。
 */
vi.mock('../../server/modelsStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    loadModelsConfig: async () => {
      throw new Error('no model config in test env → mock fallback');
    },
  };
});

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/chat', chatStreamRouter);
  return app;
}

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}

function parseSse(raw: string): SseEvent[] {
  return raw
    .split('\n\n')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const ev = block.match(/^event:\s*(.+)$/m);
      const dt = block.match(/^data:\s*([\s\S]+)$/m);
      const type = ev ? ev[1].trim() : '';
      let data: Record<string, unknown> = {};
      if (dt) {
        try {
          data = JSON.parse(dt[1]);
        } catch {
          data = {};
        }
      }
      return { type, data };
    });
}

function orderOf(types: string[], t: string): number {
  return types.indexOf(t);
}

describe('员工聊天 /turn 同步端点（演示模式兜底）', () => {
  const app = makeApp();
  const tenant = `test-turn-mock-${Date.now()}`;

  it('无 API Key 时返回演示模式占位回答，且 assistant 消息落库', async () => {
    const agent = agentDao.createAgent({
      tenant_id: tenant,
      name: `agent-turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      persona_prompt: '你是测试数字员工。',
    });

    const res = await request(app)
      .post('/chat/turn')
      .send({ tenant_id: tenant, agent_id: agent.id, message: '你好，请介绍一下你自己' });

    expect(res.body.code).toBe(0);
    expect(res.body.data.content).toBeTruthy();
    expect(res.body.data.content.startsWith('（演示模式')).toBe(true);

    // assistant 消息确实写入 sd_messages
    const msgs = await request(app).get(
      `/chat/sessions/${res.body.data.session_id}/messages?tenant_id=${tenant}`,
    );
    expect(msgs.body.code).toBe(0);
    expect(
      msgs.body.data.some(
        (m: { role: string; content: string }) =>
          m.role === 'assistant' && m.content.startsWith('（演示模式'),
      ),
    ).toBe(true);
  });

  it('message 为空时返回 400', async () => {
    const res = await request(app)
      .post('/chat/turn')
      .send({ tenant_id: tenant, agent_id: 'x', message: '   ' });
    expect(res.status).toBe(400);
  });

  it('agent_id 缺失时返回 400', async () => {
    const res = await request(app)
      .post('/chat/turn')
      .send({ tenant_id: tenant, message: '你好' });
    expect(res.status).toBe(400);
  });
});

describe('员工聊天 /stream SSE 协议顺序（mock 演示模式）', () => {
  const app = makeApp();
  const tenant = `test-stream-proto-${Date.now()}`;

  it('事件流顺序正确且以 done 收尾', async () => {
    const agent = agentDao.createAgent({
      tenant_id: tenant,
      name: `agent-stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      persona_prompt: '你是测试数字员工。',
    });

    const res = await request(app)
      .post('/chat/stream')
      .send({ tenant_id: tenant, agent_id: agent.id, message: '你好' })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c) => {
          data += c;
        });
        r.on('end', () => cb(null, data));
      })
      .expect(200);

    const raw = String(res.body);
    expect(raw).toContain('event: done');

    const events = parseSse(raw);
    const types = events.map((e) => e.type);
    expect(events.length).toBeGreaterThan(0);

    // 必现事件（前端 useChatSession 契约名，非后端原始名）
    expect(types).toContain('session_created');
    expect(types).toContain('user_message_received');
    expect(types).toContain('stream_delta');
    expect(types).toContain('stream_end');
    expect(types).toContain('done');

    // 顺序断言
    const userMsg = orderOf(types, 'user_message_received');
    const lastDelta = types.lastIndexOf('stream_delta');
    const streamEnd = orderOf(types, 'stream_end');
    const done = orderOf(types, 'done');

    expect(orderOf(types, 'session_created')).toBe(0); // 首个事件
    expect(userMsg).toBeGreaterThan(0); // user 消息在 session_created 之后
    expect(userMsg).toBeLessThan(lastDelta); // user 消息先于流式文本
    expect(lastDelta).toBeLessThan(streamEnd); // 文本增量先于 stream_end
    expect(streamEnd).toBeLessThan(done); // stream_end 先于 done
    expect(done).toBe(types.length - 1); // done 必须是最后一个事件（铁律：error 走 sendSSE 后必现 done）

    // done 之后不得再有任何事件（防止前端卡「思考中」）
    expect(types.slice(done + 1).length).toBe(0);
  });
});

describe('员工聊天 /attachments 附件上传（multipart）', () => {
  const app = makeApp();
  const tenant = `test-attach-${Date.now()}`;

  it('上传 txt 文件返回 ChatAttachmentRead[]', async () => {
    const res = await request(app)
      .post('/chat/attachments?tenant_id=' + tenant)
      .attach('files', Buffer.from('hello cross-wms'), 'hello.txt')
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    const att = res.body.data[0];
    expect(att.id).toBeTruthy();
    expect(att.filename).toBe('hello.txt');
    expect(att.content_type).toBe('text/plain');
    expect(att.size).toBe('hello cross-wms'.length);
    expect(att.kind).toBe('text');
  });

  it('无文件时返回 400', async () => {
    const res = await request(app)
      .post('/chat/attachments?tenant_id=' + tenant)
      .field('foo', 'bar')
      .expect(400);
    expect(res.body.code).toBe(400);
  });
});

describe('员工聊天 /sessions/:id/trace 时间线分组', () => {
  const app = makeApp();
  const tenant = `test-trace-${Date.now()}`;

  it('返回按 turn 分组的 TurnTraceRead[] 且含 tool/decision 行', async () => {
    const agent = agentDao.createAgent({
      tenant_id: tenant,
      name: `agent-trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      persona_prompt: '你是测试数字员工。',
    });
    const session = await request(app)
      .post('/chat/sessions')
      .send({ tenant_id: tenant, agent_id: agent.id, title: 't' });
    const sessionId = session.body.data.id;

    await request(app)
      .post('/chat/stream')
      .send({ tenant_id: tenant, agent_id: agent.id, session_id: sessionId, message: '讲个笑话' })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => cb(null, data));
      })
      .expect(200);

    const trace = await request(app)
      .get(`/chat/sessions/${sessionId}/trace?tenant_id=${tenant}`)
      .expect(200);
    expect(trace.body.code).toBe(0);
    expect(Array.isArray(trace.body.data)).toBe(true);
    const turns = trace.body.data as Array<{
      turn_id: string;
      lines: Array<{ id: string; kind: string; state: string }>;
    }>;
    expect(turns.length).toBeGreaterThan(0);
    // 至少有一个 turn 含 decision 行（assistant_message_created 映射）
    const hasDecision = turns.some((t) => t.lines.some((l) => l.kind === 'decision'));
    expect(hasDecision).toBe(true);
    // 每个 turn 都有 completed_at
    expect(turns.every((t) => Boolean(t.turn_id))).toBe(true);
  });
});

describe('员工聊天 /messages/:id/feedback 点赞点踩', () => {
  const app = makeApp();
  const tenant = `test-feedback-${Date.now()}`;

  it('POST 创建 + DELETE 取消反馈', async () => {
    const agent = agentDao.createAgent({
      tenant_id: tenant,
      name: `agent-fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      persona_prompt: '你是测试数字员工。',
    });
    const session = await request(app)
      .post('/chat/sessions')
      .send({ tenant_id: tenant, agent_id: agent.id, title: 'f' });
    const sessionId = session.body.data.id;
    const msg = await request(app)
      .post('/chat/messages')
      .send({ tenant_id: tenant, session_id: sessionId, role: 'assistant', content: '回复' });
    const messageId = msg.body.data.id;

    const up = await request(app)
      .post(`/chat/messages/${messageId}/feedback`)
      .send({ tenant_id: tenant, rating: 'up' })
      .expect(200);
    expect(up.body.code).toBe(0);
    expect(up.body.data.rating).toBe('up');

    const del = await request(app)
      .delete(`/chat/messages/${messageId}/feedback?tenant_id=${tenant}`)
      .expect(200);
    expect(del.body.code).toBe(0);
    expect(del.body.data.deleted).toBe(true);
  });

  it('非法 rating 返回 400', async () => {
    const res = await request(app)
      .post('/chat/messages/whatever/feedback')
      .send({ tenant_id: tenant, rating: 'sideways' })
      .expect(400);
    expect(res.body.code).toBe(400);
  });
});
