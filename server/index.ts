import express from 'express';
import cors from 'cors';
import { initDb, getSessions, createSession, getSessionMessages, addMessage, deleteSession } from './db';
import { v4 as uuidv4 } from 'uuid';
import { Agent } from '@tencent-ai/agent-sdk';

// 创建 Agent 实例
const agent = new Agent({
  model: process.env.MODEL || 'claude-sonnet-4',
  systemPrompt: '你是一个专业的 CrossWMS 仓储管理系统智能助手，帮助用户管理仓库、库存、在途货物等。',
});

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

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 保存用户消息
    const userMsg = addMessage({ sessionId, role: 'user', content: message, model });
    res.write(`data: ${JSON.stringify({ type: 'text', content: userMsg.content })}\n\n`);

    // 发送初始化事件
    const assistantId = uuidv4();
    res.write(`data: ${JSON.stringify({ type: 'init', sessionId, assistantMessageId: assistantId, model })}\n\n`);

    // 调用 Agent SDK 进行流式对话
    let fullContent = '';
    try {
      const stream = await agent.chat({
        message,
        sessionId,
        model,
        stream: true,
      });

      // 处理流式响应
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`);
        }
      }

      // 保存完整的助手回复
      addMessage({ sessionId, role: 'assistant', content: fullContent, model });
    } catch (sdkError) {
      console.error('Agent SDK error:', sdkError);
      const errorMsg = `抱歉，AI 服务暂时不可用，请稍后重试。\n错误：${sdkError instanceof Error ? sdkError.message : '未知错误'}`;
      res.write(`data: ${JSON.stringify({ type: 'text', content: errorMsg })}\n\n`);
      addMessage({ sessionId, role: 'assistant', content: errorMsg, model });
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Chat API error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '服务器内部错误' })}\n\n`);
      res.end();
    }
  }
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
