import express from 'express';
import request from 'supertest';
import { createServer, type Server, type AddressInfo } from 'http';
import toolsRouter from '../../server/routes/staff/tools.js';

const TENANT = `e2e-tool-test-${Date.now()}`;
let server: Server;
let port = 0;

function baseUrl(): string {
  return `http://127.0.0.1:${port}`;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url?.includes('boom')) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'boom' }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ received: body || null, method: req.method }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/staffdeck/tools', toolsRouter);
  return app;
}

describe('POST /tools/:tool_id/test — 真实执行（能力合并验证）', () => {
  it('HTTP 工具真实调用并返回结果（不复用 stub）', async () => {
    const app = makeApp();
    const created = await request(app)
      .post('/api/staffdeck/tools')
      .send({ tenant_id: TENANT, name: 'echo-tool', method: 'POST', url: `${baseUrl()}/echo`, tool_type: 'http' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const res = await request(app)
      .post(`/api/staffdeck/tools/${id}/test`)
      .send({ tenant_id: TENANT, arguments: { hello: 'world' } });

    expect(res.body.code).toBe(0);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.output.status).toBe(200);
    expect(res.body.data.output.body).toContain('hello');
    expect(res.body.data.error).toBeNull();
  });

  it('非 2xx 响应标记 success:false 并带状态码', async () => {
    const app = makeApp();
    const created = await request(app)
      .post('/api/staffdeck/tools')
      .send({ tenant_id: TENANT, name: 'boom-tool', method: 'GET', url: `${baseUrl()}/boom`, tool_type: 'http' });
    const id = created.body.data.id;

    const res = await request(app)
      .post(`/api/staffdeck/tools/${id}/test`)
      .send({ tenant_id: TENANT, arguments: {} });

    expect(res.body.data.success).toBe(false);
    expect(res.body.data.output.status).toBe(500);
    expect(res.body.data.error?.code).toBe('HTTP_500');
  });

  it('工具不存在返回 404', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/api/staffdeck/tools/nope-${Date.now()}/test`)
      .send({ tenant_id: TENANT, arguments: {} });
    expect(res.status).toBe(404);
  });
});
