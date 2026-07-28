import express from 'express';
import request from 'supertest';
import { vi, describe, it, expect } from 'vitest';
import chatStreamRouter from '../../server/routes/staff/chatStream.js';
import * as agentDao from '../../server/dao/staff/staffAgentDao.js';

/**
 * 覆盖数字员工「演示模式 / 同步 turn / SSE 协议」冒烟：
 *  - /turn 在桌面默认无 API Key 时返回演示模式占位回答（验证接线正确）
 *  - /stream 的 SSE 事件顺序（session.created → message.saved(user) →
 *    thinking.delta → thinking.end → text.delta → text.end →
 *    message.saved(assistant) → done），且 done 必现收尾。
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

    // 必现事件
    expect(types).toContain('session.created');
    expect(types).toContain('message.saved');
    expect(types).toContain('thinking.delta');
    expect(types).toContain('thinking.end');
    expect(types).toContain('text.delta');
    expect(types).toContain('text.end');
    expect(types).toContain('done');

    // 顺序断言
    const userMsg = orderOf(types, 'message.saved'); // 第一个是 user
    const assistantMsg = types.lastIndexOf('message.saved'); // 最后一个是 assistant
    const thinkingDelta = orderOf(types, 'thinking.delta');
    const textEnd = orderOf(types, 'text.end');
    const done = orderOf(types, 'done');

    expect(orderOf(types, 'session.created')).toBe(0); // 首个事件
    expect(userMsg).toBeLessThan(thinkingDelta); // user 消息先于思考
    expect(textEnd).toBeLessThan(assistantMsg); // 文本结束先于 assistant 落库
    expect(assistantMsg).toBeLessThan(done); // assistant 落库先于 done
    expect(done).toBe(types.length - 1); // done 必须是最后一个事件（铁律：error 走 sendSSE 后必现 done）

    // done 之后不得再有任何事件（防止前端卡「思考中」）
    expect(types.slice(done + 1).length).toBe(0);
  });
});
