/**
 * 数字员工 HTTP 工具接入（Gap 1）端到端测试
 *
 * 覆盖两层：
 *
 * 1) 集成层（不依赖 LLM，直接验证 staffHttpToolBridge 真实能力）
 *    - getStaffHttpToolDefinitions 从 sd_tools 读取 tool_type='http' 且 enabled=1 的工具，
 *      生成带 http_tool_ 前缀的 ToolDefinition（定义生成）。
 *    - executeStaffHttpTool 真实发起 HTTP 请求（复用 fetchWithSsrFGuard），
 *      验证成功路径 body 回显、Bearer 鉴权注入、非 2xx 处理、未注册工具 notFound。
 *
 * 2) 链路层（mock AI 客户端，跑完整 runStaffChatTurn 闭环）
 *    - 通过 /chat/turn 端点（先建 session 再调 runStaffChatTurn），
 *      让真实执行链路 executeChat → ReAct → actionPhase 跑起来。
 *    - mock callAIModelStream：第一圈返回 http_tool_echo_tool 的 tool_calls（证明 LLM 在对话中
 *      能看到该工具，firstCallTools 断言），第二圈返回最终文本。
 *    - 验证：HTTP 工具被 actionPhaseExecutor 真实分发执行（本地 target server 收到请求），
 *      最终结果回填到对话（content 含最终文本，且非演示模式兜底）。
 *
 * 隔离：通过 ./utils/staff-e2e-env.js 将 SQLite 重定向到临时目录；
 * 每个测试组使用唯一 tenant，避免跨用例 UNIQUE(tenant_id,name) 冲突。
 * 真实 LLM 被 mock，保证确定性、可在 CI 离线跑通。
 */

// 必须首先导入，确保 server/db-core 加载前 CDF_DATA_DIR 已指向临时目录
import './utils/staff-e2e-env.js';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server, type AddressInfo } from 'http';
import * as staffToolDao from '../../server/dao/staff/staffToolDao.js';
import {
  getStaffHttpToolDefinitions,
  executeStaffHttpTool,
} from '../../server/staff/staffHttpToolBridge.js';
import * as agentDao from '../../server/dao/staff/staffAgentDao.js';
import express from 'express';
import request from 'supertest';
import chatStreamRouter from '../../server/routes/staff/chatStream.js';

/** 跨文件唯一的租户名，避免 UNIQUE(tenant_id,name) 冲突 */
function uniqueTenant(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ===================== Mock 状态（hoisted，供 mock 工厂引用） =====================
// ReActExecutor 的 Planner 阶段也会调用 callAIModelStream，因此不能用「第几圈」做假设，
// 而是累积所有圈传给 LLM 的 tools 名称，并在某圈 tools 含目标工具时触发一次 tool_calls。
const mockState = vi.hoisted(() => ({
  callCount: 0,
  seenTools: [] as string[],
  toolTriggered: false,
}));

// ===================== 目标 HTTP server（模拟被调用远端 API） =====================
let targetServer: Server;
let targetPort = 0;
let targetUrl = '';
const lastRequest: { method: string; headers: Record<string, string>; body: string } = {
  method: '',
  headers: {},
  body: '',
};

beforeAll(async () => {
  targetServer = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : String(v ?? '');
      }
      lastRequest.method = req.method || '';
      lastRequest.headers = headers;
      lastRequest.body = body;

      if (req.url?.includes('boom')) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'boom' }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      // 回显收到的请求，供断言校验：method + body + authorization
      res.end(
        JSON.stringify({
          method: req.method,
          received: body || null,
          auth: headers['authorization'] || null,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
  targetPort = (targetServer.address() as AddressInfo).port;
  targetUrl = `http://127.0.0.1:${targetPort}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => targetServer.close(() => resolve()));
});

// ===================== Mock 模型配置：返回本地 ollama 模型（isLocal=true） =====================
vi.mock('../../server/modelsStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    loadModelsConfig: async () => ({
      models: [
        {
          id: 'local-test',
          name: 'Local Test',
          provider: 'ollama',
          apiEndpoint: 'http://127.0.0.1:11434/v1',
          capabilities: ['tool_call'],
          temperature: 0.7,
          topP: 1,
          maxTokens: 4096,
          contextWindow: 128000,
          defaultThinkingLevel: 'none',
          isLocal: true,
        },
      ],
    }),
  };
});

// ===================== Mock AI 客户端：第一圈返回 tool_calls，第二圈返回文本 =====================
vi.mock('../../server/aiClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    callAIModelStream: async (
      _modelConfig: unknown,
      _messages: unknown,
      onChunk?: (text: string) => void,
      _signal?: unknown,
      _onThinking?: unknown,
      tools?: Array<{ function?: { name?: string } }>,
    ) => {
      mockState.callCount++;
      const toolNames = (tools || [])
        .map((t) => t.function?.name)
        .filter((n): n is string => Boolean(n));
      // 累积所有圈传给 LLM 的工具名（证明 http 工具被注入到推理阶段）
      for (const n of toolNames) {
        if (!mockState.seenTools.includes(n)) mockState.seenTools.push(n);
      }
      // 当某一圈 tools 含目标 HTTP 工具且尚未触发过 → 返回 tool_calls 让模型调用它
      if (toolNames.includes('http_tool_echo_tool') && !mockState.toolTriggered) {
        mockState.toolTriggered = true;
        const tc = {
          id: 'call_1',
          type: 'function' as const,
          function: {
            name: 'http_tool_echo_tool',
            arguments: JSON.stringify({ hello: 'world' }),
          },
        };
        return { content: '', toolCalls: [tc] };
      }
      // 其余圈（Planner / 收尾）返回纯文本，不触发工具
      const text = mockState.toolTriggered
        ? '工具调用成功，已获取远程数据并汇总。'
        : '计划：直接调用可用工具完成任务。';
      if (onChunk) onChunk(text);
      return { content: text, toolCalls: undefined };
    },
  };
});

// ===================== 集成层：定义生成 + 真实执行 =====================
describe('HTTP 工具桥接 — 定义生成与真实执行（集成层）', () => {
  const tenant = uniqueTenant('int-http');

  it('getStaffHttpToolDefinitions 从 sd_tools 生成带 http_tool_ 前缀的 ToolDefinition', () => {
    staffToolDao.createTool({
      tenant_id: tenant,
      name: 'int_echo',
      method: 'POST',
      url: `${targetUrl}/echo`,
      tool_type: 'http',
      input_schema: {
        type: 'object',
        properties: { hello: { type: 'string' } },
        required: ['hello'],
      },
    });

    const defs = getStaffHttpToolDefinitions(tenant);
    expect(defs.length).toBe(1);
    expect(defs[0].function?.name).toBe('http_tool_int_echo');
    expect(defs[0].function?.description).toBeTruthy();
    expect(defs[0].function?.parameters).toHaveProperty('properties');
    expect((defs[0].function?.parameters as { properties?: unknown }).properties).toHaveProperty('hello');
  });

  it('executeStaffHttpTool 真实发起 HTTP 请求并返回回显结果', async () => {
    const res = await executeStaffHttpTool('http_tool_int_echo', { hello: 'world' });
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe(200);
    // target server 回显收到的 body（JSON 字符串），应含参数值
    expect(parsed.body).toContain('world');
    // 证明真实打到本地 target server
    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.body).toContain('world');
  });

  it('Bearer 鉴权从 auth_json 注入到请求头', async () => {
    staffToolDao.createTool({
      tenant_id: tenant,
      name: 'int_bearer',
      method: 'GET',
      url: `${targetUrl}/secure`,
      tool_type: 'http',
      auth: { type: 'bearer', token: 'secret-token' },
    });
    // 重新加载以注册新工具到 registry
    getStaffHttpToolDefinitions(tenant);

    const res = await executeStaffHttpTool('http_tool_int_bearer', {});
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(true);
    expect(lastRequest.headers['authorization']).toBe('Bearer secret-token');
  });

  it('非 2xx 响应标记 success:false 并带状态码', async () => {
    staffToolDao.createTool({
      tenant_id: tenant,
      name: 'int_boom',
      method: 'GET',
      url: `${targetUrl}/boom`,
      tool_type: 'http',
    });
    getStaffHttpToolDefinitions(tenant);

    const res = await executeStaffHttpTool('http_tool_int_boom', {});
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(false);
    expect(parsed.status).toBe(500);
  });

  it('未注册工具返回 notFound', async () => {
    const res = await executeStaffHttpTool('http_tool_not_registered', {});
    const parsed = JSON.parse(res);
    expect(parsed.notFound).toBe(true);
  });
});

// ===================== 链路层：完整闭环（mock AI，真实执行） =====================
describe('HTTP 工具接入数字员工执行链路 — 端到端闭环', () => {
  const tenant = uniqueTenant('e2e-http');

  it('LLM 在对话中看到并调用 HTTP 工具 → 真实执行 → 结果回填', async () => {
    // 1. 插入一个 enabled 的 HTTP 工具（被 staffChatExecutor 自动读取并注入）
    staffToolDao.createTool({
      tenant_id: tenant,
      name: 'echo_tool',
      method: 'POST',
      url: `${targetUrl}/echo`,
      tool_type: 'http',
    });

    // 2. 创建数字员工
    const agent = agentDao.createAgent({
      tenant_id: tenant,
      name: `http-agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      persona_prompt: '你是测试数字员工，能够调用 HTTP 工具获取远程数据。',
    });

    // 3. 通过 /chat/turn 端点走真实 runStaffChatTurn 链路
    const app = express();
    app.use(express.json());
    app.use('/chat', chatStreamRouter);

    mockState.callCount = 0;
    lastRequest.body = '';
    lastRequest.method = '';

    const res = await request(app)
      .post('/chat/turn')
      .send({
        tenant_id: tenant,
        agent_id: agent.id,
        message: '请调用 echo 工具查询 hello=world',
        model: 'local-test',
      })
      .expect(200);

    // 4. 断言
    expect(res.body.code).toBe(0);
    const content: string = res.body.data.content;
    expect(content).toBeTruthy();
    // 走真实 LLM 路径（非演示模式兜底）
    expect(content.startsWith('（演示模式')).toBe(false);
    // 工具执行后的最终文本被回填
    expect(content).toContain('工具调用成功');

    // 推理阶段某圈传给 LLM 的工具列表中包含该 HTTP 工具（证明注入成功）
    expect(mockState.seenTools).toContain('http_tool_echo_tool');
    // 模型确实发起了对该 HTTP 工具的调用（tool_calls 被触发）
    expect(mockState.toolTriggered).toBe(true);

    // HTTP 工具被真实分发执行：本地 target server 收到请求且 body 含模拟参数
    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.body).toContain('world');
  });
});
