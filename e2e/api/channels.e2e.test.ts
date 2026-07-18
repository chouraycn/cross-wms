/**
 * Channels API E2E 测试
 *
 * 契约以真实后端 server/routes/channels.ts 为准：
 * - GET    /api/channels/types        → 200 { types: [] }
 * - GET    /api/channels              → 200 { channels: [] }
 * - POST   /api/channels              → 201 { channel, status } / 400 / 409
 * - GET    /api/channels/:name        → 200 详情 / 404
 * - PUT    /api/channels/:name        → 200 / 404
 * - DELETE /api/channels/:name        → 200 { ok: true } / 404
 * - POST   /api/channels/:name/send   → 200 { ok } / 400 / 404
 * - POST   /api/channels/:name/enable  → 200 { ok, status } / 404
 * - POST   /api/channels/:name/disable → 200 { ok, status } / 404
 * - GET    /api/channels/:name/status → 200 { name, status } / 500
 */

import { describe, it, expect } from 'vitest';
import { createTestClient } from './utils/test-client.js';
import channelsRouter from '../../server/routes/channels.js';

describe('Channels API E2E 测试', () => {
  const client = createTestClient(channelsRouter, '/api/channels');

  const testChannelName = `e2e-test-channel-${Date.now()}`;

  describe('GET /api/channels/types', () => {
    it('应该返回支持的通道类型列表', async () => {
      const res = await client.get('/types');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('types');
      expect(Array.isArray(res.body.types)).toBe(true);
      expect(res.body.types.length).toBeGreaterThan(0);
    });

    it('每个通道类型应该包含基本字段', async () => {
      const res = await client.get('/types');
      const types = res.body.types;
      if (types.length > 0) {
        const t = types[0];
        expect(t).toHaveProperty('type');
        expect(t).toHaveProperty('label');
        expect(t).toHaveProperty('description');
        expect(t).toHaveProperty('bidirectional');
      }
    });
  });

  describe('GET /api/channels', () => {
    it('应该返回通道列表', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('channels');
      expect(Array.isArray(res.body.channels)).toBe(true);
    });
  });

  describe('POST /api/channels', () => {
    it('应该返回 400 当缺少必填字段', async () => {
      const res = await client.post('/', { name: 'test' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('应该返回 400 当通道类型不支持', async () => {
      const res = await client.post('/', {
        name: testChannelName,
        type: 'invalid-type-xyz',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('应该注册（创建）新通道', async () => {
      const res = await client.post('/', {
        name: testChannelName,
        type: 'webhook',
        enabled: true,
        credentials: {
          webhookUrl: 'https://example.com/webhook',
        },
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('channel');
      expect(res.body.channel).toHaveProperty('name', testChannelName);
      expect(res.body).toHaveProperty('status');
    });

    it('应该返回 409 当通道已存在', async () => {
      const res = await client.post('/', {
        name: testChannelName,
        type: 'webhook',
      });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/channels/:name', () => {
    it('应该返回通道详情', async () => {
      const res = await client.get(`/${testChannelName}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', testChannelName);
      expect(res.body).toHaveProperty('status');
    });

    it('应该返回 404 当通道不存在', async () => {
      const res = await client.get('/nonexistent-channel-xyz');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/channels/:name', () => {
    it('应该更新通道配置', async () => {
      const res = await client.put(`/${testChannelName}`, {
        enabled: false,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('channel');
    });

    it('应该返回 404 当更新不存在的通道', async () => {
      const res = await client.put('/nonexistent-channel-xyz', {
        enabled: false,
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/channels/:name/send', () => {
    it('应该返回 400 当缺少 content 字段', async () => {
      const res = await client.post(`/${testChannelName}/send`, {});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('应该广播消息到通道', async () => {
      const res = await client.post(`/${testChannelName}/send`, {
        content: 'E2E 测试消息',
        contentType: 'text',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('channelName', testChannelName);
    });
  });

  describe('POST /api/channels/:name/enable', () => {
    it('应该启用通道', async () => {
      const res = await client.post(`/${testChannelName}/enable`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('status');
    });

    it('应该返回 404 当启用不存在的通道', async () => {
      const res = await client.post('/nonexistent-channel-xyz/enable');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/channels/:name/disable', () => {
    it('应该禁用通道', async () => {
      const res = await client.post(`/${testChannelName}/disable`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('status');
    });

    it('应该返回 404 当禁用不存在的通道', async () => {
      const res = await client.post('/nonexistent-channel-xyz/disable');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/channels/:name/status', () => {
    it('应该返回通道状态', async () => {
      const res = await client.get(`/${testChannelName}/status`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', testChannelName);
      expect(res.body).toHaveProperty('status');
    });
  });

  describe('DELETE /api/channels/:name', () => {
    it('应该取消注册（删除）通道', async () => {
      const res = await client.delete(`/${testChannelName}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
    });

    it('应该返回 404 当删除不存在的通道', async () => {
      const res = await client.delete('/nonexistent-channel-xyz');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('删除后应该查询不到', async () => {
      const res = await client.get(`/${testChannelName}`);
      expect(res.status).toBe(404);
    });
  });
});
