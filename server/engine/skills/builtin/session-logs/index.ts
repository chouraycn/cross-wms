import { logger } from '../../../../logger.js';

interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  tags: string[];
  durationMs: number;
  status: 'active' | 'archived';
}

interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens: number;
}

interface SessionStats {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  avgDurationMs: number;
  avgMessagesPerSession: number;
  topTags: Array<{ tag: string; count: number }>;
  sessionsByDay: Array<{ date: string; count: number }>;
}

const mockSessions: Session[] = [
  { id: 'sess-001', title: '项目架构讨论', createdAt: '2024-01-15T09:00:00Z', updatedAt: '2024-01-15T10:30:00Z', messageCount: 45, tags: ['项目', '架构'], durationMs: 5400000, status: 'archived' },
  { id: 'sess-002', title: 'Bug 修复记录', createdAt: '2024-01-14T14:00:00Z', updatedAt: '2024-01-14T16:00:00Z', messageCount: 32, tags: ['bug', '修复'], durationMs: 7200000, status: 'archived' },
  { id: 'sess-003', title: '代码审查', createdAt: '2024-01-13T11:00:00Z', updatedAt: '2024-01-13T12:15:00Z', messageCount: 28, tags: ['代码审查'], durationMs: 4500000, status: 'archived' },
  { id: 'sess-004', title: '需求分析', createdAt: '2024-01-12T10:00:00Z', updatedAt: '2024-01-12T11:30:00Z', messageCount: 56, tags: ['需求', '产品'], durationMs: 5400000, status: 'archived' },
  { id: 'sess-005', title: '当前会话', createdAt: '2024-01-15T14:00:00Z', updatedAt: '2024-01-15T14:30:00Z', messageCount: 12, tags: ['当前'], durationMs: 1800000, status: 'active' },
];

const mockMessages: Message[] = [
  { id: 'msg-001', sessionId: 'sess-001', role: 'user', content: '我们来讨论一下项目的架构设计', timestamp: '2024-01-15T09:00:00Z', tokens: 15 },
  { id: 'msg-002', sessionId: 'sess-001', role: 'assistant', content: '好的，我们可以从整体架构开始讨论。请问项目的主要功能是什么？', timestamp: '2024-01-15T09:01:00Z', tokens: 28 },
  { id: 'msg-003', sessionId: 'sess-001', role: 'user', content: '这是一个电商平台，需要支持用户管理、商品管理和订单处理', timestamp: '2024-01-15T09:02:00Z', tokens: 32 },
];

export function listSessions(limit: number = 20, offset: number = 0): { sessions: Session[]; total: number } {
  logger.debug('[session-logs] listSessions limit:', limit, 'offset:', offset);
  const sorted = [...mockSessions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return {
    sessions: sorted.slice(offset, offset + limit),
    total: sorted.length,
  };
}

export function getSession(sessionId: string): { session: Session | null; messages: Message[] } {
  logger.debug('[session-logs] getSession:', sessionId);
  const session = mockSessions.find((s) => s.id === sessionId) || null;
  const messages = mockMessages.filter((m) => m.sessionId === sessionId);
  return { session, messages };
}

export function searchSessions(
  query: string,
  dateFrom?: string,
  dateTo?: string,
): Session[] {
  logger.debug('[session-logs] searchSessions query:', query);
  const lowerQuery = query.toLowerCase();

  return mockSessions.filter((s) => {
    const matchesQuery =
      s.title.toLowerCase().includes(lowerQuery) ||
      s.tags.some((t) => t.toLowerCase().includes(lowerQuery));

    const createdAt = new Date(s.createdAt).getTime();
    const matchesFrom = !dateFrom || createdAt >= new Date(dateFrom).getTime();
    const matchesTo = !dateTo || createdAt <= new Date(dateTo).getTime();

    return matchesQuery && matchesFrom && matchesTo;
  });
}

export function getSessionStats(dateFrom?: string, dateTo?: string): SessionStats {
  logger.debug('[session-logs] getSessionStats');

  const filtered = mockSessions.filter((s) => {
    const createdAt = new Date(s.createdAt).getTime();
    const matchesFrom = !dateFrom || createdAt >= new Date(dateFrom).getTime();
    const matchesTo = !dateTo || createdAt <= new Date(dateTo).getTime();
    return matchesFrom && matchesTo;
  });

  const totalMessages = filtered.reduce((sum, s) => sum + s.messageCount, 0);
  const avgDuration = filtered.length > 0
    ? filtered.reduce((sum, s) => sum + s.durationMs, 0) / filtered.length
    : 0;

  const tagCount: Record<string, number> = {};
  for (const s of filtered) {
    for (const tag of s.tags) {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCount)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const sessionsByDay: Array<{ date: string; count: number }> = [];
  const dayCount: Record<string, number> = {};
  for (const s of filtered) {
    const date = s.createdAt.split('T')[0];
    dayCount[date] = (dayCount[date] || 0) + 1;
  }
  for (const [date, count] of Object.entries(dayCount)) {
    sessionsByDay.push({ date, count });
  }
  sessionsByDay.sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalSessions: filtered.length,
    totalMessages,
    totalTokens: totalMessages * 50,
    avgDurationMs: Math.round(avgDuration),
    avgMessagesPerSession: filtered.length > 0 ? Math.round(totalMessages / filtered.length) : 0,
    topTags,
    sessionsByDay,
  };
}

export function exportSession(sessionId: string, format: string = 'markdown'): { success: boolean; content?: string; format: string } {
  logger.debug('[session-logs] exportSession:', sessionId, 'format:', format);
  const { session, messages } = getSession(sessionId);

  if (!session) {
    return { success: false, format };
  }

  let content = '';
  if (format === 'markdown') {
    content = `# ${session.title}\n\n`;
    content += `创建时间：${session.createdAt}\n\n`;
    content += `---\n\n`;
    for (const msg of messages) {
      content += `**${msg.role}**: ${msg.content}\n\n`;
    }
  } else if (format === 'json') {
    content = JSON.stringify({ session, messages }, null, 2);
  } else if (format === 'txt') {
    content = `${session.title}\n${'='.repeat(40)}\n\n`;
    for (const msg of messages) {
      content += `[${msg.timestamp}] ${msg.role}: ${msg.content}\n\n`;
    }
  }

  return { success: true, content, format };
}

export default {
  name: 'session-logs',
  description: '查看和分析历史会话日志',
  tools: [
    {
      name: 'session_logs_list',
      description: '列出历史会话',
      handler: (args: { limit?: number; offset?: number }) =>
        listSessions(args.limit, args.offset),
    },
    {
      name: 'session_logs_get',
      description: '获取会话详情',
      handler: (args: { sessionId: string }) => getSession(args.sessionId),
    },
    {
      name: 'session_logs_search',
      description: '搜索会话',
      handler: (args: { query: string; dateFrom?: string; dateTo?: string }) =>
        searchSessions(args.query, args.dateFrom, args.dateTo),
    },
    {
      name: 'session_logs_stats',
      description: '会话统计',
      handler: (args: { dateFrom?: string; dateTo?: string }) =>
        getSessionStats(args.dateFrom, args.dateTo),
    },
    {
      name: 'session_logs_export',
      description: '导出会话',
      handler: (args: { sessionId: string; format?: string }) =>
        exportSession(args.sessionId, args.format),
    },
  ],
};
