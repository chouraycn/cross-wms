/**
 * Agents API E2E 测试
 *
 * 契约以真实后端 server/routes/agents.ts 为准：
 * - GET    /api/agents                   → 200 { data: agents[] }
 * - GET    /api/agents/identities        → 200 { data: identities[] }
 * - GET    /api/agents/identities/:id    → 200 { data } / 404 { error }
 * - POST   /api/agents/identities        → 200 { data, message } / 400 { error }
 * - PUT    /api/agents/identities/:id    → 200 { data, message }
 * - DELETE /api/agents/identities/:id    → 200 { message }
 * - GET    /api/agents/scenarios         → 200 { data }
 * - POST   /api/agents/match-scenario    → 200 { data } / 400 { error }
 * - GET    /api/agents/lanes             → 200 { data }
 */

import { describe, it, expect } from 'vitest';
import { createTestClient } from './utils/test-client.js';
import agentsRouter from '../../server/routes/agents.js';

describe('Agents API E2E 测试', () => {
  const client = createTestClient(agentsRouter, '/api/agents');

  const testAgentId = `e2e-test-agent-${Date.now()}`;

  describe('GET /api/agents', () => {
    it('应该返回 Agent 列表', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('每个 Agent 应该包含基本字段', async () => {
      const res = await client.get('/');
      expect(res.status).toBe(200);
      const agents = res.body.data;
      if (agents.length > 0) {
        const agent = agents[0];
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('status');
      }
    });
  });

  describe('GET /api/agents/identities', () => {
    it('应该返回 Agent 身份列表', async () => {
      const res = await client.get('/identities');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/agents/identities', () => {
    it('应该返回 400 当缺少必填字段', async () => {
      const res = await client.post('/identities', { name: '测试' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('应该创建 Agent 身份', async () => {
      const res = await client.post('/identities', {
        id: testAgentId,
        name: 'E2E 测试 Agent',
        role: 'assistant',
        description: '用于 E2E 测试的 Agent',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('id', testAgentId);
      expect(res.body.data).toHaveProperty('name', 'E2E 测试 Agent');
    });
  });

  describe('GET /api/agents/identities/:id', () => {
    it('应该返回指定 Agent 身份详情', async () => {
      const res = await client.get(`/identities/${testAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('id', testAgentId);
    });

    it('应该返回 404 当 Agent 不存在', async () => {
      const res = await client.get('/identities/nonexistent-agent-xyz');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/agents/identities/:id', () => {
    it('应该更新 Agent 身份', async () => {
      const res = await client.put(`/identities/${testAgentId}`, {
        name: '更新后的 E2E 测试 Agent',
        description: '更新后的描述',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('name', '更新后的 E2E 测试 Agent');
    });
  });

  describe('DELETE /api/agents/identities/:id', () => {
    it('应该删除 Agent 身份', async () => {
      const res = await client.delete(`/identities/${testAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });

    it('删除后应该返回 404', async () => {
      const res = await client.get(`/identities/${testAgentId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/agents/scenarios', () => {
    it('应该返回场景列表', async () => {
      const res = await client.get('/scenarios');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('POST /api/agents/match-scenario', () => {
    it('应该返回 400 当缺少 message', async () => {
      const res = await client.post('/match-scenario', {});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('应该匹配场景', async () => {
      const res = await client.post('/match-scenario', {
        message: '帮我写一段代码',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('GET /api/agents/lanes', () => {
    it('应该返回所有车道状态', async () => {
      const res = await client.get('/lanes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('GET /api/agents/recommended', () => {
    it('应该返回推荐场景', async () => {
      const res = await client.get('/recommended');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });
});
