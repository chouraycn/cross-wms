import express from 'express';
import cors from 'cors';
import { query, unstable_v2_createSession, unstable_v2_authenticate, PermissionResult, CanUseTool } from '@tencent-ai/agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as db from './db.js';

// ============= 类型定义 =============

/** 待处理的权限请求 */
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

/** 登录方式 */
type LoginMethod = 'env' | 'cli' | 'none';

/** 登录状态响应 */
interface LoginStatusResponse {
  isLoggedIn: boolean;
  method?: LoginMethod;
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
  apiKey?: string;
  envVars?: {
    apiKey?: string;
    authToken?: string;
    internetEnv?: string;
    baseUrl?: string;
  };
}

// ============= 全局状态 =============

/** 待处理的权限请求映射表 */
const pendingPermissions = new Map<string, PendingPermission>();

/** 权限请求超时时间（5 分钟） */
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

/** 缓存可用模型列表 */
let cachedModels: Array<{ modelId: string; name: string; description?: string }> = [];

/** 默认模型 */
const defaultModel = 'claude-sonnet-4';

// ============= Express 应用初始化 =============

const app = express();
const PORT = 3001;

// 中间件：JSON 解析
app.use(express.json());

// 中间件：CORS，允许 Vite 前端和 file:// 协议访问
app.use(cors({
  origin: ['http://localhost:5173', 'file://'],
  credentials: true,
}));

// ============= 健康检查 API =============

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============= 版本信息 API =============

app.get('/api/version', (_req, res) => {
  const packageJson = require('../package.json');
  res.json({
    version: packageJson.version,
    name: packageJson.name,
    buildDate: new Date().toISOString().split('T')[0],
  });
});

// ============= 登录状态 API =============

app.get('/api/check-login', async (_req, res) => {
  const response: LoginStatusResponse = {
    isLoggedIn: false,
    envConfigured: false,
    cliConfigured: false,
    envVars: {},
  };

  // 1. 检查环境变量配置
  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;

  if (apiKey || authToken) {
    response.envConfigured = true;
    // 脱敏显示密钥
    if (apiKey) {
      response.envVars!.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4);
      response.apiKey = response.envVars!.apiKey;
    }
    if (authToken) {
      response.envVars!.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
    }
    if (internetEnv) {
      response.envVars!.internetEnv = internetEnv;
    }
    if (baseUrl) {
      response.envVars!.baseUrl = baseUrl;
    }
  }

  // 2. 使用 unstable_v2_authenticate 检查 CLI 登录状态
  try {
    let needsLogin = false;

    const result = await unstable_v2_authenticate({
      environment: 'external',
      onAuthUrl: async (authState) => {
        // 触发此回调说明未登录
        needsLogin = true;
        console.log('[Check Login] 需要登录，认证 URL:', authState.authUrl);
        response.error = '未登录，请先登录 CodeBuddy CLI';
      }
    });

    // 如果没有触发 onAuthUrl 回调，说明已登录
    if (!needsLogin && result?.userinfo) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
      console.log('[Check Login] 已登录用户:', result.userinfo.userName);
    } else if (!needsLogin) {
      // result 存在但没有 userinfo，仍然认为已登录
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Check Login] SDK 错误:', errMsg);

    // 如果有环境变量配置，仍然认为是登录状态
    if (response.envConfigured) {
      response.isLoggedIn = true;
      response.method = 'env';
    } else {
      response.error = errMsg;
      response.method = 'none';
    }
  }

  res.json(response);
});

// ============= 环境变量配置 API =============

app.post('/api/save-env-config', (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;

  if (!apiKey && !authToken) {
    return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  }

  const configuredVars: string[] = [];

  // 设置环境变量（仅在当前进程有效）
  if (apiKey) {
    process.env.CODEBUDDY_API_KEY = apiKey;
    configuredVars.push('CODEBUDDY_API_KEY');
  }
  if (authToken) {
    process.env.CODEBUDDY_AUTH_TOKEN = authToken;
    configuredVars.push('CODEBUDDY_AUTH_TOKEN');
  }
  if (internetEnv) {
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
    configuredVars.push('CODEBUDDY_INTERNET_ENVIRONMENT');
  }
  if (baseUrl) {
    process.env.CODEBUDDY_BASE_URL = baseUrl;
    configuredVars.push('CODEBUDDY_BASE_URL');
  }

  // 清除模型缓存，以便重新获取
  cachedModels = [];

  res.json({
    success: true,
    message: `已设置: ${configuredVars.join(', ')}`,
    note: '环境变量仅在当前服务器进程有效，重启后需要重新设置'
  });
});

// ============= 模型列表 API =============

app.get('/api/models', async (_req, res) => {
  try {
    if (cachedModels.length === 0) {
      console.log('[Models] 创建临时会话以获取可用模型列表...');

      const session = await unstable_v2_createSession({
        cwd: process.cwd()
      });

      console.log('[Models] 会话已创建，调用 getAvailableModels()...');
      const models = await session.getAvailableModels();
      console.log('[Models] 获取到', models.length, '个模型');

      if (models && Array.isArray(models)) {
        cachedModels = models;
      }
    }

    res.json({
      models: cachedModels.length > 0 ? cachedModels : [
        { modelId: 'claude-sonnet-4', name: 'Claude Sonnet 4' }
      ],
      defaultModel
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Models] 获取模型列表失败:', errMsg);
    res.json({
      models: [
        { modelId: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
        { modelId: 'claude-opus-4', name: 'Claude Opus 4' }
      ],
      defaultModel,
      error: errMsg
    });
  }
});

// ============= 会话 CRUD API =============

/** 获取所有会话（包含消息数量） */
app.get('/api/sessions', (_req, res) => {
  try {
    const sessions = db.getAllSessions();
    const sessionsWithMessages = sessions.map(session => {
      const messages = db.getMessagesBySession(session.id);
      return {
        ...session,
        messageCount: messages.length
      };
    });
    res.json({ sessions: sessionsWithMessages });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '获取会话失败';
    console.error('[Sessions] 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/** 获取单个会话及其消息 */
app.get('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: '会话不存在' });
    }

    const messages = db.getMessagesBySession(sessionId);

    // 解析 tool_calls JSON 字段
    const parsedMessages = messages.map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));

    res.json({ session, messages: parsedMessages });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '获取会话失败';
    console.error('[Session] 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/** 创建新会话 */
app.post('/api/sessions', (req, res) => {
  try {
    const { model = defaultModel, title = '新对话' } = req.body;
    const now = new Date().toISOString();

    const session = db.createSession({
      id: uuidv4(),
      title,
      model,
      sdk_session_id: null,
      created_at: now,
      updated_at: now
    });

    res.json({ session });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '创建会话失败';
    console.error('[Create Session] 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/** 更新会话 */
app.patch('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, model } = req.body;

    const success = db.updateSession(sessionId, { title, model });

    if (!success) {
      return res.status(404).json({ error: '会话不存在' });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '更新会话失败';
    console.error('[Update Session] 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/** 删除会话 */
app.delete('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.deleteSession(sessionId);

    if (!success) {
      return res.status(404).json({ error: '会话不存在' });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '删除会话失败';
    console.error('[Delete Session] 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// ============= 权限响应 API =============

app.post('/api/permission-response', (req, res) => {
  const { requestId, behavior, message } = req.body;

  console.log(`[Permission] 收到权限响应: requestId=${requestId}, behavior=${behavior}`);

  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    console.log(`[Permission] 请求不存在: ${requestId}`);
    return res.status(404).json({ error: '权限请求不存在或已超时' });
  }

  // 移除已处理的请求
  pendingPermissions.delete(requestId);

  if (behavior === 'allow') {
    pending.resolve({
      behavior: 'allow',
      updatedInput: pending.input
    });
  } else {
    pending.resolve({
      behavior: 'deny',
      message: message || '用户拒绝了此操作'
    });
  }

  res.json({ success: true });
});

// ============= 聊天 API（SSE 流式响应） =============

app.post('/api/chat', async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;

  // 请求日志
  console.log('\n[Chat] ========== 新请求 ==========');
  console.log(`[Chat] SessionId: ${sessionId}`);
  console.log(`[Chat] Model: ${model}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}${message?.length > 100 ? '...' : ''}`);
  console.log(`[Chat] CWD: ${cwd || '默认'}`);
  console.log(`[Chat] PermissionMode: ${permissionMode || '默认'}`);

  if (!message) {
    console.log('[Chat] 错误: 消息为空');
    return res.status(400).json({ error: '消息不能为空' });
  }

  // 获取或创建会话
  let session = sessionId ? db.getSession(sessionId) : null;
  const now = new Date().toISOString();

  if (!session) {
    // 创建新会话
    console.log('[Chat] 创建新会话');
    session = db.createSession({
      id: sessionId || uuidv4(),
      title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
      model: model || defaultModel,
      sdk_session_id: null,
      created_at: now,
      updated_at: now
    });
  } else {
    console.log(`[Chat] 使用现有会话, SDK Session: ${session.sdk_session_id || '无'}`);
  }

  const selectedModel = model || session.model;
  const sdkSessionId = session.sdk_session_id;

  // 生成消息 ID
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();

  // 保存用户消息到数据库
  try {
    db.createMessage({
      id: userMessageId,
      session_id: session.id,
      role: 'user',
      content: message,
      model: null,
      created_at: now,
      tool_calls: null
    });
    console.log(`[Chat] 用户消息已保存: ${userMessageId}`);
  } catch (dbError: unknown) {
    const errMsg = dbError instanceof Error ? dbError.message : '保存消息失败';
    console.error('[Chat] 保存用户消息失败:', errMsg);
    return res.status(500).json({ error: '保存消息失败', detail: errMsg });
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 默认系统提示词
  const defaultSystemPrompt = '你是一个专业的 AI 助手，善于帮助用户解决各种问题。请用简洁清晰的方式回答问题。';

  // 工作目录：优先使用请求中的 cwd，否则使用当前目录
  const workingDir = cwd || process.cwd();

  try {
    console.log('[Chat] 调用 SDK query...');
    console.log(`[Chat] - Model: ${selectedModel}`);
    console.log(`[Chat] - Resume: ${sdkSessionId || '无'}`);
    console.log(`[Chat] - CWD: ${workingDir}`);
    console.log(`[Chat] - PermissionMode: ${permissionMode || '默认'}`);

    // 创建 canUseTool 回调，处理权限请求
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      console.log(`[Permission] 工具请求: ${toolName}`);
      console.log(`[Permission] 输入:`, JSON.stringify(input, null, 2));

      // bypassPermissions 模式直接放行
      if (permissionMode === 'bypassPermissions') {
        console.log(`[Permission] 跳过权限检查: ${toolName}`);
        return { behavior: 'allow', updatedInput: input };
      }

      // 创建权限请求 ID
      const requestId = uuidv4();
      const permissionRequest = {
        requestId,
        toolUseId: options.toolUseID,
        toolName,
        input,
        sessionId: session!.id,
        timestamp: Date.now()
      };

      // 发送权限请求事件到前端
      res.write(`data: ${JSON.stringify({
        type: 'permission_request',
        ...permissionRequest
      })}\n\n`);

      // 创建 Promise 等待用户响应
      return new Promise<PermissionResult>((resolve, reject) => {
        const pending: PendingPermission = {
          resolve,
          reject,
          toolName,
          input,
          sessionId: session!.id,
          timestamp: Date.now()
        };

        pendingPermissions.set(requestId, pending);

        // 设置超时，超时后自动拒绝
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            console.log(`[Permission] 请求超时: ${requestId}`);
            resolve({
              behavior: 'deny',
              message: '权限请求超时'
            });
          }
        }, PERMISSION_TIMEOUT);
      });
    };

    // 使用 Query API 发送消息
    // 如果有 sdk_session_id，使用 resume 恢复对话上下文
    const stream = query({
      prompt: message,
      options: {
        cwd: workingDir,
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: systemPrompt || defaultSystemPrompt,
        permissionMode: permissionMode || 'default',
        canUseTool,
        ...(sdkSessionId ? { resume: sdkSessionId } : {})
      }
    });

    let fullResponse = '';
    let toolCalls: Array<{
      id: string;
      name: string;
      input?: Record<string, unknown>;
      status: string;
      result?: string;
      isError?: boolean;
    }> = [];
    let newSdkSessionId: string | null = null;

    // 发送初始化事件，包含会话和消息 ID
    res.write(`data: ${JSON.stringify({
      type: 'init',
      sessionId: session.id,
      userMessageId,
      assistantMessageId,
      model: selectedModel
    })}\n\n`);

    // 当前正在执行的工具 ID（用于匹配 tool_result）
    let currentToolId: string | null = null;

    // 处理流式响应
    for await (const msg of stream) {
      console.log('[Stream] 消息类型:', msg.type, msg);

      // 处理 system 消息，获取 SDK 的 session_id
      if (msg.type === 'system' && (msg as Record<string, unknown>).subtype === 'init') {
        newSdkSessionId = (msg as Record<string, unknown>).session_id as string;
        console.log(`[Stream] 获取到 SDK session_id: ${newSdkSessionId}`);

        // 保存 SDK session_id 到数据库（如果是新的）
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
          console.log('[Stream] SDK session_id 已保存到数据库');
        }
      } else if (msg.type === 'assistant') {
        const content = (msg as { message: { content: unknown } }).message.content;

        if (typeof content === 'string') {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: 'text', content })}\n\n`);
        } else if (Array.isArray(content)) {
          for (const block of content as Array<Record<string, unknown>>) {
            if (block.type === 'text') {
              const text = (block as { text: string }).text;
              fullResponse += text;
              res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
            } else if (block.type === 'tool_use') {
              currentToolId = (block.id as string) || uuidv4();
              const toolInput = (block as Record<string, unknown>).input as Record<string, unknown> || {};
              console.log(`[Stream] 工具调用: id=${currentToolId}, name=${block.name}`);
              console.log(`[Stream] 工具输入:`, JSON.stringify(toolInput, null, 2));

              const toolCall = {
                id: currentToolId,
                name: block.name as string,
                input: toolInput,
                status: 'running'
              };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({
                type: 'tool',
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input,
                status: toolCall.status
              })}\n\n`);
            }
          }
        }
      } else if (msg.type === 'tool_result') {
        // 处理工具执行结果
        const msgAny = msg as Record<string, unknown>;
        const toolId = (msgAny.tool_use_id as string) || currentToolId;
        const isError = (msgAny.is_error as boolean) || false;
        const content = msgAny.content;

        console.log(`[Stream] 工具结果: tool_use_id=${toolId}, is_error=${isError}`);

        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? 'error' : 'completed';
          tool.isError = isError;
          tool.result = typeof content === 'string'
            ? content
            : JSON.stringify(content);
          res.write(`data: ${JSON.stringify({
            type: 'tool_result',
            toolId: tool.id,
            content: tool.result,
            isError
          })}\n\n`);
        }
        currentToolId = null;
      } else if (msg.type === 'result') {
        // 完成时确保所有工具都标记为完成
        toolCalls.forEach(tool => {
          if (tool.status === 'running') {
            tool.status = 'completed';
            res.write(`data: ${JSON.stringify({ type: 'tool_result', toolId: tool.id, content: tool.result || '已完成' })}\n\n`);
          }
        });
        res.write(`data: ${JSON.stringify({ type: 'done', duration: (msg as { duration: number }).duration, cost: (msg as { cost: unknown }).cost })}\n\n`);
      }
    }

    // 保存助手消息到数据库
    db.createMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: 'assistant',
      content: fullResponse,
      model: selectedModel,
      created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
    });

    // 更新会话标题（如果是前几条消息）
    const messages = db.getMessagesBySession(session.id);
    if (messages.length <= 2) {
      db.updateSession(session.id, {
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: selectedModel
      });
    }

    console.log('[Chat] 请求完成 ✓');
    res.end();
  } catch (error: unknown) {
    console.error('\n[Chat] ========== 错误 ==========');
    if (error instanceof Error) {
      console.error('[Chat] Error Name:', error.name);
      console.error('[Chat] Error Message:', error.message);
      console.error('[Chat] Error Stack:', error.stack);
    } else {
      console.error('[Chat] Error:', error);
    }

    const errorMessage = error instanceof Error ? error.message : '处理请求时发生错误';
    res.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
    res.end();
  }
});

// ============= 启动服务器 =============

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║                                            ║
║     ◉ CrossWMS API 服务器已启动            ║
║                                            ║
║     地址: http://localhost:${PORT}            ║
║     数据库: ~/.crosswms/chat.db            ║
║                                            ║
╚════════════════════════════════════════════╝
  `);
});
