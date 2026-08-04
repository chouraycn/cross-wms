/**
 * Chat API 契约测试
 *
 * 锁定 /api/chat 端点的请求/响应契约：
 * - POST /api/chat                → 200 (SSE 流式响应)
 * - GET  /api/queue-status/:id    → 200 { sessionId, state, queueLength, ... }
 * - POST /api/queue-cancel/:id    → 200 { ok, cancelledCount }
 * - GET  /api/notifications/:id   → 200 { ok, notifications, unreadCount }
 *
 * 使用 supertest 直接驱动 Express app（挂载真实路由），
 * 仅校验响应格式、状态码与必要字段，不断言业务语义。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import chatRouter from '../../server/routes/chat.js';

describe('Chat API 契约测试', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', chatRouter);
  });

  describe('POST /api/chat', () => {
    it('应返回 200 并建立 SSE 连接', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'contract-session', message: 'hello' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/queue-status/:sessionId', () => {
    it('应返回 200 及队列状态字段', async () => {
      const response = await request(app).get('/api/queue-status/contract-session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId', 'contract-session');
      expect(response.body).toHaveProperty('state');
      expect(response.body).toHaveProperty('queueLength');
    });
  });

  describe('POST /api/queue-cancel/:sessionId', () => {
    it('应返回 200 及取消结果字段', async () => {
      const response = await request(app).post('/api/queue-cancel/contract-session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('cancelledCount');
    });
  });

  describe('GET /api/notifications/:sessionId', () => {
    it('应返回 200 及通知列表字段', async () => {
      const response = await request(app).get('/api/notifications/contract-session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('notifications');
      expect(Array.isArray(response.body.notifications)).toBe(true);
      expect(response.body).toHaveProperty('unreadCount');
    });
  });
});
