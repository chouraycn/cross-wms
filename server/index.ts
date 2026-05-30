import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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

// ============= Action 队列（供 AI 工具调用） =============

/** Action 状态 */
type ActionStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Action 操作类型 */
type ActionType = 'create_warehouse' | 'delete_warehouse' | 'update_warehouse' | 'create_shipment' | 'update_inventory';

/** Action 数据结构 */
interface Action {
  id: string;
  type: ActionType;
  /** 操作参数 */
  params: Record<string, unknown>;
  status: ActionStatus;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
}

/** 待处理/已处理的 Action 存储 */
const pendingActions = new Map<string, Action>();

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

// 中间件：CORS，允许 Vite 前端和本地后端访问
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
}));

// 中间件：服务前端静态文件（生产环境兼容 PyInstaller 打包路径）
const getFrontendDistPath = (): string => {
  // 1. 环境变量优先（由 pywebview_app.py 启动时设置）
  if (process.env.FRONTEND_DIST_PATH) {
    return process.env.FRONTEND_DIST_PATH;
  }
  // 2. 相对路径（开发环境或 PyInstaller 打包后）
  // 打包后 server_dist/ 在 Resources/，frontend_dist/ 也在 Resources/
  // ES module 中使用 import.meta.url 获取当前文件目录
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(currentDir, '../frontend_dist'),   // 开发环境
    path.join(currentDir, '../dist'),             // 开发环境（Vite 默认）
    path.join(currentDir, '../../frontend_dist'), // 打包后 Resources/server_dist/ → Resources/frontend_dist
    path.join(currentDir, '../../dist'),          // 备用
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // 3. 兜底：当前工作目录
  return path.join(process.cwd(), 'frontend_dist');
};

const frontendDistPath = getFrontendDistPath();
console.log(`[Static] 前端静态文件目录: ${frontendDistPath}`);
console.log(`[Static] 目录存在: ${fs.existsSync(frontendDistPath)}`);
if (fs.existsSync(frontendDistPath)) {
  const files = fs.readdirSync(frontendDistPath);
  console.log(`[Static] 目录内容: ${files.join(', ')}`);
}
app.use(express.static(frontendDistPath, {
  index: 'index.html',
  maxAge: '1d',
}));

// SPA fallback：所有非 API 路由返回 index.html
app.use((req, _res, next) => {
  // 跳过 API 和 WebSocket 路由
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) {
    return next();
  }

  const indexPath = path.join(frontendDistPath, 'index.html');
  console.log(`[SPA Fallback] ${req.method} ${req.path} → ${indexPath}`);
  console.log(`[SPA Fallback] index.html 存在: ${fs.existsSync(indexPath)}`);

  if (fs.existsSync(indexPath)) {
    _res.sendFile(indexPath);
  } else {
    console.error(`[SPA Fallback] index.html 未找到: ${indexPath}`);
    _res.status(404).json({ error: 'cannot GET ' + req.path, path: req.path, frontendDistPath });
  }
});

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

// ============= 上下文 API =============

/** 存储由前端提交的当前系统上下文 */
let currentSystemContext: Record<string, unknown> = {};

/**
 * 获取当前系统上下文（前端在每次发消息前提交最新数据）
 * GET /api/context
 */
app.get('/api/context', (_req, res) => {
  res.json({ context: currentSystemContext });
});

/**
 * 更新当前系统上下文
 * POST /api/context
 */
app.post('/api/context', (req, res) => {
  const { context } = req.body;
  if (context) {
    currentSystemContext = context;
  }
  res.json({ success: true });
});

// ============= 仓库数据查询 API（供 AI 工具调用） =============

/**
 * 获取仓库列表
 * GET /api/warehouses
 * 返回：{ warehouses: Array<{ id, name, location, totalItems, usedItems, totalVolume, usedVolume }> }
 * 数据来源：currentSystemContext（由前端通过 POST /api/context 提交）
 */
app.get('/api/warehouses', (_req, res) => {
  try {
    const warehouses = (currentSystemContext as Record<string, unknown>)?.warehouses as Array<Record<string, unknown>> || [];
    res.json({ code: 0, message: 'success', data: { warehouses }, timestamp: Date.now() });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '读取仓库数据失败';
    console.error('[Warehouses] 错误:', errMsg);
    res.status(500).json({ code: 500, message: errMsg, data: null, timestamp: Date.now() });
  }
});

/**
 * 获取单个仓库详情
 * GET /api/warehouses/:id
 */
app.get('/api/warehouses/:id', (req, res) => {
  try {
    const { id } = req.params;
    const warehouses = (currentSystemContext as Record<string, unknown>)?.warehouses as Array<Record<string, unknown>> || [];
    const warehouse = warehouses.find((w: any) => w.id === id || w.name === id);

    if (!warehouse) {
      return res.status(404).json({ code: 404, message: '仓库不存在', data: null, timestamp: Date.now() });
    }

    res.json({ code: 0, message: 'success', data: warehouse, timestamp: Date.now() });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '读取仓库数据失败';
    console.error('[Warehouse] 错误:', errMsg);
    res.status(500).json({ code: 500, message: errMsg, data: null, timestamp: Date.now() });
  }
});

/**
 * 获取库存列表（从 localStorage mock 数据）
 * GET /api/inventory?warehouseId=xxx
 */
app.get('/api/inventory', (req, res) => {
  try {
    // 返回 mock 库存数据（与前端 InTransitPage 中 mockInboundRecords 结构一致）
    const mockInventory = [
      { id: 'SKU-001', name: '无线蓝牙耳机', category: '电子产品', warehouse: '深圳仓', warehouseId: 'sz', quantity: 1200, value: 240000, status: '正常' },
      { id: 'SKU-002', name: '智能手表', category: '电子产品', warehouse: '深圳仓', warehouseId: 'sz', quantity: 850, value: 425000, status: '正常' },
      { id: 'SKU-003', name: '运动跑鞋', category: '服装鞋帽', warehouse: '洛杉矶仓', warehouseId: 'lax', quantity: 600, value: 180000, status: '预警' },
      { id: 'SKU-004', name: '保温杯', category: '日用品', warehouse: '法兰克福仓', warehouseId: 'fra', quantity: 2000, value: 160000, status: '正常' },
      { id: 'SKU-005', name: '机械键盘', category: '电子产品', warehouse: '大阪仓', warehouseId: 'osa', quantity: 450, value: 315000, status: '预警' },
      { id: 'SKU-006', name: 'USB-C 数据线', category: '电子产品', warehouse: '深圳仓', warehouseId: 'sz', quantity: 5000, value: 250000, status: '正常' },
      { id: 'SKU-007', name: '瑜伽垫', category: '体育用品', warehouse: '伦敦仓', warehouseId: 'lhr', quantity: 300, value: 45000, status: '正常' },
    ];

    const { warehouseId } = req.query;
    let filtered = mockInventory;
    if (warehouseId && typeof warehouseId === 'string') {
      filtered = mockInventory.filter(item => item.warehouseId === warehouseId);
    }

    res.json({ code: 0, message: 'success', data: { inventory: filtered }, timestamp: Date.now() });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '读取库存数据失败';
    console.error('[Inventory] 错误:', errMsg);
    res.status(500).json({ code: 500, message: errMsg, data: null, timestamp: Date.now() });
  }
});

/**
 * 获取在途运单列表
 * GET /api/shipments?status=pending&warehouseId=xxx
 */
app.get('/api/shipments', (req, res) => {
  try {
    const mockShipments = [
      { id: 'SHP-001', trackingNo: 'SF1234567890', origin: '深圳', destination: '洛杉矶', warehouseId: 'lax', status: '在途', items: 500, value: 150000, departure: '2026-05-10', estimatedArrival: '2026-05-28' },
      { id: 'SHP-002', trackingNo: 'SF0987654321', origin: '深圳', destination: '法兰克福', warehouseId: 'fra', items: 300, value: 90000, status: '在途', departure: '2026-05-15', estimatedArrival: '2026-06-05' },
      { id: 'SHP-003', trackingNo: 'UPS5566778899', origin: '大阪', destination: '深圳', warehouseId: 'sz', items: 800, value: 240000, status: '已到达', departure: '2026-05-08', estimatedArrival: '2026-05-25' },
      { id: 'SHP-004', trackingNo: 'DHL1122334455', origin: '深圳', destination: '伦敦', warehouseId: 'lhr', items: 450, value: 135000, status: '在途', departure: '2026-05-20', estimatedArrival: '2026-06-10' },
    ];

    const { status, warehouseId } = req.query;
    let filtered = mockShipments;
    if (status && typeof status === 'string') {
      filtered = filtered.filter(s => s.status === status);
    }
    if (warehouseId && typeof warehouseId === 'string') {
      filtered = filtered.filter(s => s.warehouseId === warehouseId);
    }

    res.json({ code: 0, message: 'success', data: { shipments: filtered }, timestamp: Date.now() });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '读取运单数据失败';
    console.error('[Shipments] 错误:', errMsg);
    res.status(500).json({ code: 500, message: errMsg, data: null, timestamp: Date.now() });
  }
});

/**
 * 获取仪表盘 KPI 数据
 * GET /api/dashboard/kpi
 */
app.get('/api/dashboard/kpi', (_req, res) => {
  try {
    const warehouses = (currentSystemContext as Record<string, unknown>)?.warehouses as Array<Record<string, unknown>> || [];

    let totalItems = 0;
    let warehouseCount = warehouses.length;

    totalItems = warehouses.reduce((sum: number, w: any) => sum + (w.usedItems || 0), 0);

    res.json({
      totalInventory: totalItems,
      totalValue: totalItems * 200, // 简化估算
      warehouseCount,
      inTransit: 2050,
      activeShipments: 4,
      lowStockAlerts: 2,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '读取 KPI 数据失败';
    console.error('[Dashboard KPI] 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// ============= Action 队列 API（供 AI 提交操作，前端执行） =============

/**
 * 提交一个操作指令
 * POST /api/actions
 * 请求体：{ type, params }
 * AI 调用此接口提交操作，前端轮询执行
 */
app.post('/api/actions', (req, res) => {
  try {
    const { type, params, sessionId } = req.body;

    if (!type || !['create_warehouse', 'delete_warehouse', 'update_warehouse', 'create_shipment', 'update_inventory'].includes(type)) {
      return res.status(400).json({ error: `无效的操作类型: ${type}` });
    }

    const action: Action = {
      id: uuidv4(),
      type: type as ActionType,
      params: params || {},
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionId: sessionId || 'unknown',
    };

    pendingActions.set(action.id, action);
    console.log(`[Actions] 创建操作: id=${action.id}, type=${action.type}`);

    res.json({ action });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '创建操作失败';
    console.error('[Actions] POST 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * 获取操作列表
 * GET /api/actions?status=pending
 * 前端轮询此接口获取待处理操作
 */
app.get('/api/actions', (req, res) => {
  try {
    const { status } = req.query;
    let actions = Array.from(pendingActions.values());

    if (status && typeof status === 'string') {
      actions = actions.filter(a => a.status === status);
    }

    // 按创建时间排序（最新的在前）
    actions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ actions });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '获取操作列表失败';
    console.error('[Actions] GET 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * 更新操作状态
 * PATCH /api/actions/:id
 * 前端执行操作后调用此接口更新状态
 */
app.patch('/api/actions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, result, error } = req.body;

    const action = pendingActions.get(id);
    if (!action) {
      return res.status(404).json({ error: '操作不存在' });
    }

    action.status = (status as ActionStatus) || action.status;
    if (result !== undefined) action.result = result;
    if (error !== undefined) action.error = error;
    action.updatedAt = new Date().toISOString();

    pendingActions.set(id, action);
    console.log(`[Actions] 更新操作: id=${id}, status=${action.status}`);

    res.json({ action });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '更新操作失败';
    console.error('[Actions] PATCH 错误:', errMsg);
    res.status(500).json({ error: errMsg });
  }
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

  // 默认系统提示词 — CrossWMS 领域定制
  const baseSystemPrompt = `你是 CrossWMS（跨境仓库管理系统）的 AI 助手。

系统背景：
- CrossWMS 是一个跨境仓库管理系统，管理多个海外仓库
- 功能模块：仪表盘、仓库管理、在途管理、库存管理、统计报表、系统设置
- 数据包括：仓库信息、运单跟踪、库存SKU、库龄预警

你的能力：
- 回答关于仓库管理、库存优化、跨境物流的问题
- 帮助分析数据、生成报表摘要
- 提供系统使用指导
- 通过工具调用帮助用户在系统内执行操作（创建/删除/更新仓库等）

## 可用 API 端点（用于工具调用）

### 1. 数据查询 API（GET 请求，返回 JSON）
- GET /api/warehouses → 获取仓库列表
  返回：{ warehouses: [{ id, name, location, usedItems, totalItems, usedVolume, totalVolume }] }
- GET /api/warehouses/:id → 获取单个仓库详情
- GET /api/inventory?warehouseId=xxx → 获取库存列表
- GET /api/shipments?status=pending&warehouseId=xxx → 获取在途运单
- GET /api/dashboard/kpi → 获取仪表盘 KPI 数据
  返回：{ totalInventory, totalValue, warehouseCount, inTransit, activeShipments, lowStockAlerts }

### 2. 操作队列 API（用于执行写操作）
- POST /api/actions → 提交操作指令
  请求体：{ type: "create_warehouse"|"delete_warehouse"|"update_warehouse", params: {...} }
  返回：{ action: { id, type, status } }
  操作类型与参数：
  - create_warehouse: { name, location, totalItems, usedItems, totalVolume, usedVolume }
  - delete_warehouse: { id: "仓库ID" }
  - update_warehouse: { id: "仓库ID", updates: { name?, location?, totalItems?, usedItems?, totalVolume?, usedVolume? } }
- GET /api/actions?status=pending → 获取待处理操作列表
- PATCH /api/actions/:id → 更新操作状态 { status: "completed"|"failed", result?: "...", error?: "..." }

## 操作执行流程
1. 当用户要求创建/删除/更新仓库时，调用 POST /api/actions 提交操作
2. 前端会轮询 GET /api/actions?status=pending 获取待处理操作并执行
3. 前端执行完后调用 PATCH /api/actions/:id 更新状态

## 回答要求
- 使用中文回答
- 涉及数据时引用具体数值
- 简洁专业，避免冗余
- 如果不确定，明确说明而不是猜测
- 提交操作后告诉用户"已提交操作，前端正在执行..."`;

  // 构建系统提示词：基础 + 当前上下文数据
  let finalSystemPrompt = baseSystemPrompt;

  // 如果有上下文数据，追加到系统提示词
  if (currentSystemContext && Object.keys(currentSystemContext).length > 0) {
    const contextStr = Object.entries(currentSystemContext)
      .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
      .join('\n');
    finalSystemPrompt += `\n\n当前系统数据：\n${contextStr}`;
  }

  const systemPromptToUse = systemPrompt || finalSystemPrompt;

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
        systemPrompt: systemPromptToUse,
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
