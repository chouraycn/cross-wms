"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_js_1 = require("./db.js");
const uuid_1 = require("uuid");
const agent_sdk_1 = require("@tencent-ai/agent-sdk");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 健康检查
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
// 获取会话列表
app.get('/api/sessions', (_req, res) => {
    const sessions = (0, db_js_1.getSessions)();
    res.json({ sessions });
});
// 创建会话
app.post('/api/sessions', (req, res) => {
    const { title, model, agentId } = req.body;
    const session = (0, db_js_1.createSession)((0, uuid_1.v4)(), title || '新对话', model || 'claude-sonnet-4', agentId);
    res.json({ session });
});
// 获取会话消息
app.get('/api/sessions/:id', (req, res) => {
    const messages = (0, db_js_1.getSessionMessages)(req.params.id);
    res.json({ messages });
});
// 删除会话
app.delete('/api/sessions/:id', (req, res) => {
    (0, db_js_1.deleteSession)(req.params.id);
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
        // 确保会话存在，如果不存在则自动创建
        const sessions = (0, db_js_1.getSessions)();
        const sessionExists = sessions.some(s => s.id === sessionId);
        if (!sessionExists) {
            (0, db_js_1.createSession)(sessionId, '新对话', model, undefined);
        }
        // 保存用户消息
        const userMsg = (0, db_js_1.addMessage)({ sessionId, role: 'user', content: message, model });
        res.write(`data: ${JSON.stringify({ type: 'text', content: userMsg.content })}\n\n`);
        // 发送初始化事件
        const assistantId = (0, uuid_1.v4)();
        res.write(`data: ${JSON.stringify({ type: 'init', sessionId, assistantMessageId: assistantId, model })}\n\n`);
        // 调用 Agent SDK 进行流式对话
        let fullContent = '';
        try {
            const queryInstance = (0, agent_sdk_1.query)({
                prompt: message,
                options: {
                    model,
                    permissionMode: 'bypassPermissions',
                    cwd: process.cwd(),
                },
            });
            // 处理流式响应
            for await (const msg of queryInstance) {
                if (msg.type === 'assistant') {
                    for (const block of msg.message.content) {
                        if (block.type === 'text') {
                            fullContent += block.text;
                            res.write(`data: ${JSON.stringify({ type: 'text', content: block.text })}\n\n`);
                        }
                    }
                }
            }
            // 保存完整的助手回复
            (0, db_js_1.addMessage)({ sessionId, role: 'assistant', content: fullContent, model });
        }
        catch (sdkError) {
            console.error('[Chat API] Agent SDK error:', sdkError);
            console.error('[Chat API] Stack trace:', sdkError instanceof Error ? sdkError.stack : 'N/A');
            const errorMsg = `抱歉，AI 服务暂时不可用，请稍后重试。\n错误：${sdkError instanceof Error ? sdkError.message : '未知错误'}`;
            res.write(`data: ${JSON.stringify({ type: 'text', content: errorMsg })}\n\n`);
            (0, db_js_1.addMessage)({ sessionId, role: 'assistant', content: errorMsg, model });
        }
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }
    catch (error) {
        console.error('Chat API error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
        else {
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
        ] });
});
// Agent 列表（占位）
app.get('/api/agents', (_req, res) => {
    res.json({ agents: [
            { id: 'default', name: '通用助手', description: '一个通用的 AI 助手', systemPrompt: '你是一个专业的AI助手' }
        ] });
});
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`CrossWMS Chat Server running on port ${PORT}`);
    (0, db_js_1.initDb)();
});
