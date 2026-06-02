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
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
// Business data routes
const warehouses_js_1 = __importDefault(require("./routes/warehouses.js"));
const inventory_js_1 = __importDefault(require("./routes/inventory.js"));
const transit_js_1 = __importDefault(require("./routes/transit.js"));
const inbound_js_1 = __importDefault(require("./routes/inbound.js"));
const outbound_js_1 = __importDefault(require("./routes/outbound.js"));
const skills_js_1 = __importDefault(require("./routes/skills.js"));
const settings_js_1 = __importDefault(require("./routes/settings.js"));
const migrate_js_1 = __importDefault(require("./routes/migrate.js"));
// MEMORY.md 路径
const CROSSWMS_DIR = path_1.default.join(os_1.default.homedir(), '.crosswms');
const MEMORY_MD_PATH = path_1.default.join(CROSSWMS_DIR, 'MEMORY.md');
/** 读取 MEMORY.md 内容，不存在则返回空字符串 */
function readMemoryMd() {
    try {
        if (fs_1.default.existsSync(MEMORY_MD_PATH)) {
            return fs_1.default.readFileSync(MEMORY_MD_PATH, 'utf-8');
        }
    }
    catch (e) {
        console.error('[Memory] 读取失败:', e);
    }
    return '';
}
/** 写入 MEMORY.md 内容 */
function writeMemoryMd(content) {
    try {
        if (!fs_1.default.existsSync(CROSSWMS_DIR)) {
            fs_1.default.mkdirSync(CROSSWMS_DIR, { recursive: true });
        }
        fs_1.default.writeFileSync(MEMORY_MD_PATH, content, 'utf-8');
    }
    catch (e) {
        console.error('[Memory] 写入失败:', e);
        throw e;
    }
}
/**
 * 获取 Node.js 可执行路径，用于 agent-sdk 内部 spawn。
 * DMG 模式下 node 不在系统 PATH 中，需要从 CROSSWMS_NODE_PATH 或 process.execPath 推导。
 */
function getNodeExecutable() {
    // 1. 环境变量显式指定
    const envNode = process.env.CROSSWMS_NODE_PATH;
    if (envNode)
        return envNode;
    // 2. 如果 process.execPath 指向真正的 node（而非 PyInstaller 的 python）
    if (process.execPath.endsWith('node') || process.execPath.endsWith('node.exe')) {
        return process.execPath;
    }
    // 3. 从 PATH 中找
    return undefined;
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 健康检查
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
// ========== MEMORY.md API ==========
// 读取 MEMORY.md
app.get('/api/memory', (_req, res) => {
    const content = readMemoryMd();
    res.json({ content });
});
// 更新 MEMORY.md
app.post('/api/memory', (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') {
        res.status(400).json({ error: 'content must be a string' });
        return;
    }
    try {
        writeMemoryMd(content);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: '写入失败' });
    }
});
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
            // 构建 query 选项，DMG 模式下需指定 node 可执行路径
            const queryOptions = {
                model,
                permissionMode: 'bypassPermissions',
                cwd: process.cwd(),
            };
            const nodeExe = getNodeExecutable();
            if (nodeExe) {
                // 将 node 目录加入 PATH，确保 agent-sdk 内部 spawn('node', ...) 能找到
                const nodeDir = path_1.default.dirname(nodeExe);
                const currentPath = process.env.PATH || '';
                if (!currentPath.split(path_1.default.delimiter).includes(nodeDir)) {
                    process.env.PATH = nodeDir + path_1.default.delimiter + currentPath;
                }
            }
            // 注入 MEMORY.md 上下文到 prompt
            const memoryContent = readMemoryMd();
            let finalPrompt = message;
            if (memoryContent.trim()) {
                finalPrompt = `<memory>\n${memoryContent.trim()}\n</memory>\n\n${message}`;
            }
            const queryInstance = (0, agent_sdk_1.query)({
                prompt: finalPrompt,
                options: queryOptions,
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
// ========== Business Data API Routes ==========
app.use('/api/warehouses', warehouses_js_1.default);
app.use('/api/inventory', inventory_js_1.default);
app.use('/api/transit-orders', transit_js_1.default);
app.use('/api/inbound-records', inbound_js_1.default);
app.use('/api/outbound-records', outbound_js_1.default);
app.use('/api', skills_js_1.default); // handles /api/user-skills and /api/builtin-status-patches
app.use('/api/app-settings', settings_js_1.default);
app.use('/api/migrate', migrate_js_1.default);
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`CrossWMS Chat Server running on port ${PORT}`);
    (0, db_js_1.initDb)();
});
