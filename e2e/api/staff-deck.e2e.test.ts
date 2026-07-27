/**
 * StaffDeck 管理平面 API E2E 测试
 *
 * 契约以真实后端 server/routes/staff/*.ts 为准（管理平面，DB 驱动、不依赖 LLM）：
 * - GET    /api/staffdeck/ui-config         → 200 { code:0, data: UiConfigRead }
 * - PUT    /api/staffdeck/ui-config         → 200 { code:0, data: UiConfigRead }
 * - GET    /api/staffdeck/persona           → 200 { code:0, data }
 * - PUT    /api/staffdeck/persona           → 200 { code:0 }
 * - GET    /api/staffdeck/model-configs     → 200 { code:0, data: ModelConfigRead[] }
 * - POST   /api/staffdeck/model-configs     → 201 { code:0, data: ModelConfigRead }
 * - GET    /api/staffdeck/agents             → 200 { code:0, data: AgentProfileRead[] }
 * - POST   /api/staffdeck/agents            → 201 { code:0, data: AgentProfileRead }
 * - GET    /api/staffdeck/tools             → 200 { code:0, data: ToolRead[] }
 * - GET    /api/staffdeck/knowledge-bases   → 200 { code:0, data: KnowledgeBaseRead[] }
 * - GET    /api/staffdeck/skills            → 200 { code:0, data: SkillRead[] }
 * - GET    /api/staffdeck/general-skills    → 200 { code:0, data: GeneralSkillRead[] }
 * - GET    /api/staffdeck/traces            → 200 { code:0, data: TraceSummary[] }
 * - GET    /api/staffdeck/feedback/summary  → 200 { code:0, data }
 *
 * 隔离：通过 ./utils/staff-e2e-env.js 将 SQLite 重定向到临时目录，
 * 不污染真实数据文件。覆盖范围为「管理平面」——执行平面（对话流式 / 定时任务执行 /
 * 蒸馏）依赖 LLM，不在本 e2e 范围内。
 */

// 必须首先导入，确保 server/db-core 加载前 CDF_DATA_DIR 已指向临时目录
import './utils/staff-e2e-env.js';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Router } from 'express';
import fs from 'fs';
import { createTestClient, type TestApiClient } from './utils/test-client.js';
import { STAFF_E2E_TMP_DIR } from './utils/staff-e2e-env.js';

/** 与 server 响应信封对齐：{ code, data, message } */
interface StaffResp<T = unknown> {
  code: number;
  data: T;
  message?: string;
}

describe('StaffDeck 管理平面 API E2E', () => {
  let client: TestApiClient;
  const createdAgentIds: string[] = [];

  beforeAll(async () => {
    const agentsRouter = (await import('../../server/routes/staff/agents.js')).default;
    const modelConfigsRouter = (await import('../../server/routes/staff/modelConfigs.js')).default;
    const toolsRouter = (await import('../../server/routes/staff/tools.js')).default;
    const kbRouter = (await import('../../server/routes/staff/knowledgeBases.js')).default;
    const skillsRouter = (await import('../../server/routes/staff/skills.js')).default;
    const gsRouter = (await import('../../server/routes/staff/generalSkills.js')).default;
    const uiConfigRouter = (await import('../../server/routes/staff/uiConfig.js')).default;
    const personaRouter = (await import('../../server/routes/staff/persona.js')).default;
    const tracesRouter = (await import('../../server/routes/staff/traces.js')).default;
    const feedbackRouter = (await import('../../server/routes/staff/feedback.js')).default;

    const staffRouter: Router = express.Router();
    staffRouter.use('/agents', agentsRouter);
    staffRouter.use('/model-configs', modelConfigsRouter);
    staffRouter.use('/tools', toolsRouter);
    staffRouter.use('/knowledge-bases', kbRouter);
    staffRouter.use('/skills', skillsRouter);
    staffRouter.use('/general-skills', gsRouter);
    staffRouter.use('/ui-config', uiConfigRouter);
    staffRouter.use('/persona', personaRouter);
    staffRouter.use('/traces', tracesRouter);
    staffRouter.use('/feedback', feedbackRouter);

    client = createTestClient(staffRouter, '/api/staffdeck');
  });

  afterAll(() => {
    try {
      fs.rmSync(STAFF_E2E_TMP_DIR, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  describe('UI 配置', () => {
    it('GET /ui-config 返回配置（含展示开关）', async () => {
      const res = await client.get<StaffResp<{ show_thinking_trace: boolean }>>('/ui-config');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('show_thinking_trace');
      expect(typeof res.body.data.show_thinking_trace).toBe('boolean');
    });

    it('PUT /ui-config 更新展示开关', async () => {
      const res = await client.put<StaffResp<{ show_thinking_trace: boolean }>>('/ui-config', {
        show_thinking_trace: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.show_thinking_trace).toBe(false);
    });
  });

  describe('岗位人设', () => {
    it('GET /persona 返回组织默认人设', async () => {
      const res = await client.get<StaffResp<Record<string, unknown>>>('/persona');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('PUT /persona 更新人设', async () => {
      const res = await client.put<StaffResp<unknown>>('/persona', {
        system_prompt: '你是一个用于 E2E 测试的数字员工。',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });
  });

  describe('模型配置', () => {
    it('GET /model-configs 返回数组', async () => {
      const res = await client.get<StaffResp<unknown[]>>('/model-configs');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /model-configs 创建配置', async () => {
      const res = await client.post<StaffResp<{ id: string }>>('/model-configs', {
        name: `e2e-model-${Date.now()}`,
        protocol: 'openai',
        base_url: 'https://api.example.com/v1',
        model: 'gpt-test',
        api_key: 'sk-e2e-test',
      });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('数字员工', () => {
    it('GET /agents 返回数组（含 overall）', async () => {
      const res = await client.get<StaffResp<unknown[]>>('/agents');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /agents 创建员工', async () => {
      const res = await client.post<StaffResp<{ id: string }>>('/agents', {
        name: `E2E Agent ${Date.now()}`,
        description: 'StaffDeck E2E 测试员工',
        persona_prompt: 'You are an E2E test agent.',
      });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
      createdAgentIds.push(res.body.data.id);
    });
  });

  describe('资源列表', () => {
    it('GET /tools 返回数组', async () => {
      const res = await client.get<StaffResp<unknown[]>>('/tools');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /knowledge-bases 返回数组', async () => {
      const res = await client.get<StaffResp<unknown[]>>('/knowledge-bases');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /skills 返回数组', async () => {
      const res = await client.get<StaffResp<unknown[]>>('/skills');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /general-skills 返回数组', async () => {
      const res = await client.get<StaffResp<unknown[]>>('/general-skills');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('观测与治理', () => {
    it('GET /traces 返回数组', async () => {
      const res = await client.get<StaffResp<unknown[]>>('/traces');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /feedback/summary 返回汇总', async () => {
      const res = await client.get<StaffResp<Record<string, unknown>>>('/feedback/summary');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });
  });
});
