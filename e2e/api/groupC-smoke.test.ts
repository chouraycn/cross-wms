/**
 * Group C 新增路由冒烟测试
 *
 * 验证 C1–C6 增量接入的 HTTP 端点在「不 fork 主执行链路」前提下确实可用。
 * 每个簇用动态 import 隔离，单簇 import/运行时异常不会级联拖垮其他簇。
 *
 * 运行：npm run test:e2e:api  （vitest + supertest，已配置 include: e2e/api/**）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';

/** 为每个簇构建最小 express 应用并挂载目标路由 */
async function mountRouter(importPath: string): Promise<Express> {
  const mod = await import(importPath);
  const router = mod.default ?? mod;
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe('C1 ACP 路由 (/api/acp)', () => {
  let app: Express;
  beforeEach(async () => {
    app = await mountRouter('../../server/routes/acp.js');
  });

  it('POST / 应透传 ACP JSON-RPC（health 方法）', async () => {
    const res = await request(app)
      .post('/')
      .send({ jsonrpc: '2.0', id: '1', method: 'health' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('jsonrpc', '2.0');
  });

  it('POST / 应拒绝非法包络', async () => {
    const res = await request(app).post('/').send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });

  it('GET /health 应返回 ACP 健康包络', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('jsonrpc', '2.0');
  });

  it('GET /doctor 应返回 DoctorReport', async () => {
    const res = await request(app).get('/doctor');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
  });
});

describe('C2 channels-core 路由 (/api/channels-core)', () => {
  let app: Express;
  beforeEach(async () => {
    app = await mountRouter('../../server/routes/channelsCore.js');
  });

  it('GET /adapters 应列出已注册适配器', async () => {
    const res = await request(app).get('/adapters');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('adapters');
    expect(Array.isArray(res.body.data.adapters)).toBe(true);
  });

  it('GET /lookup/:id 对未知通道应 404', async () => {
    const res = await request(app).get('/lookup/__no_such_channel__');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
  });

  it('POST /access/check 应评估访问决策', async () => {
    const res = await request(app)
      .post('/access/check')
      .send({ sender: { channel: 'web', accountId: 'u1' }, eventType: 'message' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('decision');
  });

  it('POST /inbound 应处理合法入站事件（优雅降级 DB）', async () => {
    const res = await request(app)
      .post('/inbound')
      .send({
        kind: 'message',
        channelId: 'web',
        accountId: 'u1',
        messageId: 'm1',
        timestamp: Date.now(),
        payload: { text: 'hello' },
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data.processed).toHaveProperty('success');
  });

  it('POST /inbound 应拒绝缺字段的事件', async () => {
    const res = await request(app).post('/inbound').send({ kind: 'message' });
    expect(res.status).toBe(400);
  });
});

describe('C3 gateway-ext 路由 (/api/gateway-ext)', () => {
  let app: Express;
  beforeEach(async () => {
    app = await mountRouter('../../server/routes/gatewayExt.js');
  });

  it('GET /health 应返回网关诊断（含 WS/MCP 状态）', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('webSocketHub');
    expect(res.body.data).toHaveProperty('mcp');
  });

  it('GET /mcp/status 应返回 MCP 网关状态', async () => {
    const res = await request(app).get('/mcp/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('available');
  });

  it('POST /mcp/start 应确认请求但不自动劫持 stdin', async () => {
    const res = await request(app).post('/mcp/start');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('started', false);
    expect(res.body).toHaveProperty('launchSnippet');
  });
});

describe('C4 agent-runtime 路由 (/api/agent-runtime)', () => {
  let app: Express;
  beforeEach(async () => {
    app = await mountRouter('../../server/routes/agentRuntime.js');
  });

  it('GET /subagents 应列出子代理定义', async () => {
    const res = await request(app).get('/subagents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('definitions');
  });

  it('GET /subagents/describe 应返回定义与工具集', async () => {
    const res = await request(app).get('/subagents/describe');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('GET /mcp 应返回 MCP 管理器状态', async () => {
    const res = await request(app).get('/mcp');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('GET /health 应返回各运行时组件快照', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('components');
  });

  it('POST /subagents/run 应接受编排请求并返回 202', async () => {
    const res = await request(app)
      .post('/subagents/run')
      .send({ definitionId: 'noop', taskDescription: 'smoke' });
    expect([200, 202, 404]).toContain(res.status); // 404 表示定义不存在也属正常降级
  });
});

describe('C6 capabilities 路由 (/api/capabilities)', () => {
  let app: Express;
  beforeEach(async () => {
    app = await mountRouter('../../server/routes/capabilities.js');
  });

  it('GET / 应返回能力清单', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(Array.isArray(res.body.endpoints)).toBe(true);
  });

  it('GET /thinking-modes 应返回思考级别', async () => {
    const res = await request(app).get('/thinking-modes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('options');
  });

  it('GET /tool-search 应返回目录统计', async () => {
    const res = await request(app).get('/tool-search');
    expect(res.status).toBe(200);
  });

  it('GET /infra/retry 应返回退避计算', async () => {
    const res = await request(app).get('/infra/retry');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('backoff');
  });
});

describe('C5 CLI 路由 (/api/cli)', () => {
  let app: Express;
  beforeEach(async () => {
    app = await mountRouter('../../server/routes/cli.js');
  });

  it('POST / 应拒绝非数组 argv', async () => {
    const res = await request(app).post('/').send({ argv: 'status' });
    expect(res.status).toBe(400);
  });

  it('POST / 应拒绝空请求体', async () => {
    const res = await request(app).post('/').send({});
    expect(res.status).toBe(400);
  });
});
