import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// mock logger — 避免 E2E 测试产生真实日志副作用
vi.mock('../../server/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// mock runChatSession — 通过 mockEvents 数组控制 SSE 事件流，验证 handler 转发逻辑
const mockEvents: Array<{ type: string; [key: string]: unknown }> = [];
vi.mock('../../server/engine/runChatSession.js', () => ({
  runChatSession: vi.fn(async (
    _input: unknown,
    callbacks: { onEvent?: (event: { type: string; [key: string]: unknown }) => void },
  ) => {
    for (const evt of mockEvents) {
      callbacks.onEvent?.(evt);
    }
    return { content: '', thinkingContent: '', usage: {} };
  }),
}));

import agentChatRouter from '../../server/routes/agentChat.js';

/**
 * 解析 SSE 响应文本，提取所有 data: 行的 JSON payload
 */
function parseSSEEvents(text: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6).trim();
      if (jsonStr) {
        try {
          events.push(JSON.parse(jsonStr));
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  }
  return events;
}

/**
 * 发起 agent-chat 请求并以字符串形式收集完整 SSE 响应
 */
async function postAgentChatAndCollectEvents(
  app: express.Express,
  body: Record<string, unknown> = { sessionId: 'test-session', message: 'hello' },
): Promise<{ events: Array<Record<string, unknown>> }> {
  const response = await request(app)
    .post('/api/agent-chat')
    .send(body)
    .set('Content-Type', 'application/json')
    .buffer(true)
    .parse((res: any, cb: any) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk: any) => { data += chunk; });
      res.on('end', () => cb(null, data));
    });

  const text = typeof response.body === 'string' ? response.body : '';
  const events = parseSSEEvents(text);
  return { events };
}

describe('Agent Chat SSE E2E 测试', () => {
  let app: express.Express;

  beforeEach(() => {
    // 重置 mock 事件，每个测试独立控制事件流
    mockEvents.length = 0;
    app = express();
    app.use(express.json());
    app.use('/api', agentChatRouter);
  });

  describe('POST /api/agent-chat', () => {
    it('Agent chat SSE endpoint 存在 — 应返回 200 且 Content-Type 为 text/event-stream', async () => {
      mockEvents.push({ type: 'done' });

      const response = await request(app)
        .post('/api/agent-chat')
        .send({ sessionId: 'test-session', message: 'hello' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    it('SSE event types — 应发射 lifecycle.start / text / thinking / tool / lifecycle.done 事件', async () => {
      mockEvents.push(
        { type: 'init', assistantMessageId: 'msg-1', model: 'test-model', modelName: 'Test' },
        { type: 'text', content: '你好' },
        { type: 'thinking', content: '思考中' },
        { type: 'tool_call', id: 'tc-1', toolName: 'search', toolArgs: '{}', toolResult: 'ok' },
        { type: 'done', thinkingDuration: 100, usage: {} },
      );

      const { events } = await postAgentChatAndCollectEvents(app);

      // lifecycle.start（handler 在调用 runChatSession 前直接发送）
      const lifecycleStart = events.find(
        (e) => e.stream === 'lifecycle' && (e.data as { phase?: string })?.phase === 'start',
      );
      expect(lifecycleStart).toBeDefined();

      // assistant/text 流
      const assistantEvent = events.find((e) => e.stream === 'assistant');
      expect(assistantEvent).toBeDefined();
      expect((assistantEvent!.data as { content?: string }).content).toBe('你好');

      // thinking 流
      const thinkingEvent = events.find((e) => e.stream === 'thinking');
      expect(thinkingEvent).toBeDefined();
      expect((thinkingEvent!.data as { content?: string }).content).toBe('思考中');

      // tool 流
      const toolEvent = events.find((e) => e.stream === 'tool');
      expect(toolEvent).toBeDefined();
      expect((toolEvent!.data as { name?: string }).name).toBe('search');

      // lifecycle.done
      const lifecycleDone = events.find(
        (e) => e.stream === 'lifecycle' && (e.data as { phase?: string })?.phase === 'done',
      );
      expect(lifecycleDone).toBeDefined();
    });

    it('Plan event visibility — plan / plan_revised 事件应转发到客户端（不被默认处理吞掉）', async () => {
      mockEvents.push(
        { type: 'plan', steps: ['step1', 'step2'] },
        { type: 'plan_revised', steps: ['step1-revised'], reason: 'updated' },
        { type: 'done' },
      );

      const { events } = await postAgentChatAndCollectEvents(app);

      // plan / plan_revised 落入 default 分支，作为 debug 流转发到客户端
      const planEvent = events.find(
        (e) => (e.data as { type?: string })?.type === 'plan',
      );
      expect(planEvent).toBeDefined();

      const planRevisedEvent = events.find(
        (e) => (e.data as { type?: string })?.type === 'plan_revised',
      );
      expect(planRevisedEvent).toBeDefined();
    });

    it('Command output event — command_output 事件应到达客户端', async () => {
      mockEvents.push(
        { type: 'command_output', command: 'ls -la', output: 'file1.txt' },
        { type: 'done' },
      );

      const { events } = await postAgentChatAndCollectEvents(app);

      const cmdEvent = events.find(
        (e) => (e.data as { type?: string })?.type === 'command_output',
      );
      expect(cmdEvent).toBeDefined();
    });

    it('Patch event — patch 事件应到达客户端', async () => {
      mockEvents.push(
        { type: 'patch', path: '/src/index.ts', content: 'export const x = 1;' },
        { type: 'done' },
      );

      const { events } = await postAgentChatAndCollectEvents(app);

      const patchEvent = events.find(
        (e) => (e.data as { type?: string })?.type === 'patch',
      );
      expect(patchEvent).toBeDefined();
    });

    it('Heartbeat — heartbeat 事件应被转发（不被吞掉）', async () => {
      mockEvents.push(
        { type: 'heartbeat', ts: 1234567890 },
        { type: 'done' },
      );

      const { events } = await postAgentChatAndCollectEvents(app);

      const heartbeatEvent = events.find(
        (e) => (e.data as { type?: string })?.type === 'heartbeat',
      );
      expect(heartbeatEvent).toBeDefined();
    });
  });
});
