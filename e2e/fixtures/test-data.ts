/**
 * E2E 测试数据 fixtures
 *
 * 集中管理 mockServer 和测试用例使用的测试数据，
 * 避免在多个文件中硬编码，便于统一维护。
 */

export const mockMessages = [
  {
    id: 'msg-1',
    role: 'user' as const,
    content: '测试消息',
    timestamp: Date.now(),
  },
  {
    id: 'msg-2',
    role: 'assistant' as const,
    content: '这是 AI 的回复',
    timestamp: Date.now(),
  },
];

export const mockWikiEntries = [
  {
    id: 'wiki-1',
    title: '测试条目 1',
    content: '这是测试内容',
    tags: ['test', 'demo'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const mockMemories = [
  {
    id: 'mem-1',
    content: '测试记忆内容',
    type: 'fact' as const,
    createdAt: Date.now(),
  },
];

export const mockTools = [
  { name: 'pdf-reader', status: 'available' as const },
  { name: 'lsp-client', status: 'available' as const },
  { name: 'browser-control', status: 'available' as const },
  { name: 'file-operations', status: 'available' as const },
];

/** 流式响应测试 chunks */
export const streamingChunks = [
  'data: {"type":"text","content":"这"}\n\n',
  'data: {"type":"text","content":"是"}\n\n',
  'data: {"type":"text","content":"流"}\n\n',
  'data: {"type":"text","content":"式"}\n\n',
  'data: {"type":"text","content":"输"}\n\n',
  'data: {"type":"text","content":"出"}\n\n',
  'data: {"type":"done"}\n\n',
];

/** 测试用户 */
export const testUser = {
  id: 'test-user-1',
  name: '测试用户',
  email: 'test@example.com',
};

/** 测试会话 */
export const testSession = {
  id: 'test-session-1',
  createdAt: Date.now(),
};

/** 审批测试数据 */
export const mockApproval = {
  id: 'approval-1',
  status: 'pending' as const,
  type: 'tool_execution' as const,
  createdAt: Date.now(),
};
