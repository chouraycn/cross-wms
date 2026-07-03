import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import chatRouter from '../../server/routes/chat.js';

describe('Chat API E2E 测试', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', chatRouter);
  });

  describe('POST /api/chat', () => {
    it('应该返回 200 并建立 SSE 连接', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          sessionId: 'test-session',
          message: 'hello',
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/queue-status/:sessionId', () => {
    it('应该返回队列状态', async () => {
      const response = await request(app)
        .get('/api/queue-status/test-session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId', 'test-session');
      expect(response.body).toHaveProperty('state');
      expect(response.body).toHaveProperty('queueLength');
    });
  });

  describe('POST /api/queue-cancel/:sessionId', () => {
    it('应该取消队列中的消息', async () => {
      const response = await request(app)
        .post('/api/queue-cancel/test-session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('cancelledCount');
    });
  });
});