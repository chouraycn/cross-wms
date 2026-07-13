/**
 * agentChat `file` SSE 事件端到端回归测试
 *
 * 覆盖第 10 轮「技能/工具产出文件实时回写」T1-T4 中**唯一缺 e2e 的链路**：
 *   runChatSession → emitFileEvent({type:'file',...}) → agentChat.ts `case 'file'`
 *     → send('file', {...}) → SSE 线 `data: {stream:'file', data:{...}}`
 *
 * 关键断言：
 * 1. POST /api/agent-chat 返回 200，且响应体含一条 `stream === 'file'` 的 SSE 事件；
 * 2. 该事件 data 中包含 fileId / fileName / source / skillId / downloadUrl / fileSize
 *    （即 agentChat.ts 把 SSEFileEvent 字段完整透传，前端 GeneratedFileArtifactCard 能收到）；
 * 3. 反向：当会话不产生 file 事件时，响应体不应出现 `stream === 'file'`（证明 file 分支独立、不污染常规流）。
 *
 * 不依赖真实 LLM：用 vi.mock 替掉 runChatSession，由 mock 直接经 onEvent 发出 file 事件。
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import agentChatRouter from '../../server/routes/agentChat.js';
import { runChatSession } from '../../server/engine/runChatSession.js';

// 替掉 runChatSession：经 onEvent 实时 emit 一个 file 事件（不触发真实 LLM/工具执行）
vi.mock('../../server/engine/runChatSession.js', () => ({
  runChatSession: vi.fn(async (_input: any, opts: any) => {
    opts.onEvent({
      type: 'file',
      fileId: 'file-abc123',
      toolCallId: 'tc_1',
      source: 'skill',
      skillId: 'skill-resume',
      fileName: 'resume.html',
      mimeType: 'text/html',
      fileSize: 1234,
      downloadUrl: '/api/file/generated/sess-x/resume.html',
      previewUrl: '/api/file/generated/sess-x/resume.html?preview=1',
      description: '个人简历',
      sessionId: 'sess-x',
      createdAt: new Date().toISOString(),
    });
    opts.onEvent({ type: 'done', thinkingDuration: 10, usage: {} });
  }),
}));

/** 解析 SSE 响应体为事件对象数组（每行 `data: {...}`） */
function parseSSE(body: string): any[] {
  return body
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)));
}

describe('agentChat `file` SSE 事件 E2E', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', agentChatRouter);
  });

  it('应经 /api/agent-chat 透传 file 事件为 stream=file 的 SSE', async () => {
    const res = await request(app)
      .post('/api/agent-chat')
      .set('Content-Type', 'application/json')
      .send({ sessionId: 'sess-x', message: '帮我生成简历', skillId: 'skill-resume' });

    expect(res.status).toBe(200);

    const events = parseSSE(res.text || '');
    const fileEvents = events.filter((e) => e.stream === 'file');

    // 1. 确实透传出一条 file 事件
    expect(fileEvents.length).toBe(1);

    // 2. data 字段完整（与 SSEFileEvent 契约对齐）
    const d = fileEvents[0].data;
    expect(d.fileName).toBe('resume.html');
    expect(d.fileId).toBe('file-abc123');
    expect(d.source).toBe('skill');
    expect(d.skillId).toBe('skill-resume');
    expect(d.fileSize).toBe(1234);
    expect(d.downloadUrl).toContain('/api/file/generated/sess-x/resume.html');
    expect(d.previewUrl).toContain('preview=1');
  });

  it('无 file 事件时不应出现 stream=file（分支独立、不污染常规流）', async () => {
    // 仅发 text + done，不发 file
    vi.mocked(runChatSession).mockImplementationOnce(async (_i: any, opts: any) => {
      opts.onEvent({ type: 'text', content: '好的，这是回答' });
      opts.onEvent({ type: 'done', thinkingDuration: 5, usage: {} });
    });

    const res = await request(app)
      .post('/api/agent-chat')
      .set('Content-Type', 'application/json')
      .send({ sessionId: 'sess-y', message: '你好' });

    expect(res.status).toBe(200);

    const events = parseSSE(res.text || '');
    expect(events.filter((e) => e.stream === 'file').length).toBe(0);
    // 常规流仍然正常
    expect(events.some((e) => e.stream === 'assistant')).toBe(true);
  });
});
