/**
 * Mock API 服务器
 * 用于 E2E 测试中模拟后端 API 响应
 */

import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';

// Mock 数据
const mockMessages = [
  {
    id: 'msg-1',
    role: 'user',
    content: '测试消息',
    timestamp: Date.now(),
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: '这是 AI 的回复',
    timestamp: Date.now(),
  },
];

const mockWikiEntries = [
  {
    id: 'wiki-1',
    title: '测试条目 1',
    content: '这是测试内容',
    tags: ['test', 'demo'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockMemories = [
  {
    id: 'mem-1',
    content: '测试记忆内容',
    type: 'fact',
    createdAt: Date.now(),
  },
];

// API 处理器
const handlers = [
  // 聊天相关 API
  http.post('/api/chat', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: {
        message: mockMessages[1],
        streaming: false,
      },
    });
  }),

  http.post('/api/chat/stream', async () => {
    // 模拟流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const chunks = [
          'data: {"type":"text","content":"这"}\n\n',
          'data: {"type":"text","content":"是"}\n\n',
          'data: {"type":"text","content":"流"}\n\n',
          'data: {"type":"text","content":"式"}\n\n',
          'data: {"type":"text","content":"输"}\n\n',
          'data: {"type":"text","content":"出"}\n\n',
          'data: {"type":"done"}\n\n',
        ];

        for (const chunk of chunks) {
          await delay(50);
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
      },
    });
  }),

  http.get('/api/chat/history', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: mockMessages,
    });
  }),

  // Wiki 相关 API
  http.get('/api/wiki', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: mockWikiEntries,
    });
  }),

  http.post('/api/wiki', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: {
        id: 'wiki-new',
        title: '新条目',
        content: '新内容',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
  }),

  http.put('/api/wiki/:id', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: {
        id: 'wiki-1',
        title: '更新后的标题',
        content: '更新后的内容',
        tags: ['updated'],
        updatedAt: Date.now(),
      },
    });
  }),

  http.delete('/api/wiki/:id', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
    });
  }),

  http.get('/api/wiki/search', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: mockWikiEntries,
    });
  }),

  // 记忆相关 API
  http.get('/api/memory', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: mockMemories,
    });
  }),

  http.post('/api/memory', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: {
        id: 'mem-new',
        content: '新记忆',
        type: 'fact',
        createdAt: Date.now(),
      },
    });
  }),

  http.delete('/api/memory/:id', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
    });
  }),

  http.post('/api/memory/search', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: mockMemories,
    });
  }),

  // 工具相关 API
  http.get('/api/tools', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: [
        { name: 'pdf-reader', status: 'available' },
        { name: 'lsp-client', status: 'available' },
        { name: 'browser-control', status: 'available' },
        { name: 'file-operations', status: 'available' },
      ],
    });
  }),

  http.post('/api/tools/execute', async () => {
    await delay(200);
    return HttpResponse.json({
      success: true,
      data: {
        result: '工具执行成功',
        metadata: {},
      },
    });
  }),

  // 审批相关 API
  http.post('/api/approval/request', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: {
        id: 'approval-1',
        status: 'pending',
        type: 'tool_execution',
        createdAt: Date.now(),
      },
    });
  }),

  http.post('/api/approval/:id/approve', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: {
        id: 'approval-1',
        status: 'approved',
        approvedAt: Date.now(),
      },
    });
  }),

  http.post('/api/approval/:id/reject', async () => {
    await delay(100);
    return HttpResponse.json({
      success: true,
      data: {
        id: 'approval-1',
        status: 'rejected',
        rejectedAt: Date.now(),
      },
    });
  }),
];

// 创建 Mock 服务器
export const mockServer = setupServer(...handlers);

// 启动/停止服务器
export function startMockServer() {
  mockServer.listen({
    onUnhandledRequest: 'warn',
  });
}

export function stopMockServer() {
  mockServer.close();
}

export function resetMockServer() {
  mockServer.resetHandlers();
}