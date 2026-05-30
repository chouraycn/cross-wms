import express from 'express';
import cors from 'cors';
import { initDb, getSessions, createSession, getSessionMessages, addMessage, deleteSession } from './db';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 获取会话列表
app.get('/api/sessions', (_req, res) => {
  const sessions = getSessions();
  res.json({ sessions });
});

// 创建会话
app.post('/api/sessions', (req, res) => {
  const { title, model, agentId } = req.body;
  const session = createSession(uuidv4(), title || '新对话', model || 'claude-sonnet-4', agentId);
  res.json({ session });
});

// 获取会话消息
app.get('/api/sessions/:id', (req, res) => {
  const messages = getSessionMessages(req.params.id);
  res.json({ messages });
});

// 删除会话
app.delete('/api/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// 发送消息（SSE）
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, model = 'claude-sonnet-4' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const userMsg = addMessage({ sessionId, role: 'user', content: message, model });
  res.write(`data: ${JSON.stringify({ type: 'text', content: userMsg.content })}\n\n`);

  // Assistant 回复（模拟，实际应调用 @tencent-ai/agent-sdk）
  const assistantId = uuidv4();
  res.write(`data: ${JSON.stringify({ type: 'init', sessionId, assistantMessageId: assistantId, model })}\n\n`);

  // 模拟流式回复
  const reply = `收到你的消息：「${message}」\n\n我是 CrossWMS 智能助手，当前为 MVP 版本，完整 SDK 集成即将上线。`;
  res.write(`data: ${JSON.stringify({ type: 'text', content: reply })}\n\n`);
  addMessage({ sessionId, role: 'assistant', content: reply, model });

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});

// 权限响应（占位）
app.post('/api/permission-response', (_req, res) => res.json({ ok: true }));

// 模型列表（占位）
app.get('/api/models', (_req, res) => {
  res.json({ models: [
    { modelId: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
    { modelId: 'gpt-4o', name: 'GPT-4o' },
  ]});
});

// Agent 列表（占位）
app.get('/api/agents', (_req, res) => {
  res.json({ agents: [
    { id: 'default', name: '通用助手', description: '一个通用的 AI 助手', systemPrompt: '你是一个专业的AI助手' }
  ]});
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`CrossWMS Chat Server running on port ${PORT}`);
  initDb();
});
