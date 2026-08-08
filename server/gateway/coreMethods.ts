/**
 * Core Gateway Server Methods
 * 核心 Gateway 服务方法实现
 */

import type {
  GatewayAgent,
  GatewayModel,
  GatewaySession,
  GatewayStats,
  GatewayTool,
  GatewayHealth,
  GatewayMethodContext,
} from "./types.js";
import { registerGatewayMethod, getMethodRegistry } from "./methodRegistry.js";
import { AcpSessionManager } from "../engine/acp/sessionManager.js";
import { getActiveTurnCount } from "../engine/acp/activeTurns.js";

// 内存存储（生产环境应使用数据库）
const sessions = new Map<string, GatewaySession>();
const agents = new Map<string, GatewayAgent>();
const models = new Map<string, GatewayModel>();
const tools = new Map<string, GatewayTool>();

const serverStartedAt = Date.now();
const totalMessages = 0;

/**
 * 初始化默认数据
 */
function initializeDefaults(): void {
  // 默认 Agents
  const defaultAgents: GatewayAgent[] = [
    {
      id: "wms-expert",
      name: "WMS 专家",
      description: "WMS 系统专家，精通仓库管理系统",
      systemPrompt: "你是 WMS 系统专家...",
      tools: ["web_search", "memory_search"],
      capabilities: ["code", "analysis", "planning"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "wms-analyst",
      name: "WMS 分析师",
      description: "数据分析专家，擅长报表和趋势分析",
      tools: ["web_search", "memory_search"],
      capabilities: ["analysis", "reporting"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "wms-operator",
      name: "WMS 操作员",
      description: "日常操作助手，执行具体任务",
      tools: ["web_search", "memory_search"],
      capabilities: ["execution", "automation"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "general",
      name: "通用助手",
      description: "通用对话助手",
      tools: ["web_search", "memory_search"],
      capabilities: ["chat"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "debugger",
      name: "调试专家",
      description: "问题诊断和调试专家",
      tools: ["web_search", "memory_search"],
      capabilities: ["debug", "analysis"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  for (const agent of defaultAgents) {
    agents.set(agent.id, agent);
  }

  // 默认 Models - 为空，等待用户通过模型管理添加并配置 API Key
  // v2.8.7: 不再预置默认模型，避免新安装时出现无 API Key 的模型导致调用失败
  const defaultModels: GatewayModel[] = [];

  for (const model of defaultModels) {
    models.set(model.id, model);
  }

  // 默认 Tools
  const defaultTools: GatewayTool[] = [
    {
      name: "web_search",
      description: "搜索网页内容",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询" },
        },
        required: ["query"],
      },
      tags: ["web", "search"],
      category: "search",
    },
    {
      name: "memory_search",
      description: "搜索记忆内容",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询" },
          limit: { type: "number", description: "结果数量" },
        },
        required: ["query"],
      },
      tags: ["memory", "search"],
      category: "memory",
    },
    {
      name: "wms_inventory_query",
      description: "查询 WMS 库存",
      inputSchema: {
        type: "object",
        properties: {
          sku: { type: "string", description: "SKU 编码" },
          warehouse: { type: "string", description: "仓库编码" },
        },
      },
      tags: ["wms", "inventory"],
      category: "wms",
    },
  ];

  for (const tool of defaultTools) {
    tools.set(tool.name, tool);
  }
}

initializeDefaults();

// ========== Sessions Methods ==========

async function sessionsList(params: any, _ctx: GatewayMethodContext) {
  const { limit = 50, offset = 0 } = params as { limit?: number; offset?: number };
  const allSessions = Array.from(sessions.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(offset, offset + limit);
  return {
    sessions: allSessions,
    total: sessions.size,
  };
}

async function sessionsGet(params: any, _ctx: GatewayMethodContext) {
  const { key } = params as { key: string };
  return sessions.get(key) ?? null;
}

async function sessionsCreate(params: any, _ctx: GatewayMethodContext) {
  const { key, label, meta } = params as { key: string; label?: string; meta?: Record<string, any> };
  const now = Date.now();
  const session: GatewaySession = {
    id: `sess_${now}_${Math.random().toString(36).slice(2, 8)}`,
    key,
    label,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    meta,
  };
  sessions.set(key, session);
  return session;
}

async function sessionsDelete(params: any, _ctx: GatewayMethodContext) {
  const { key } = params as { key: string };
  return { deleted: sessions.delete(key) };
}

async function sessionsResolve(params: any, _ctx: GatewayMethodContext) {
  const { key, label } = params as { key?: string; label?: string };
  if (key && sessions.has(key)) {
    return { ok: true, key };
  }
  if (label) {
    for (const session of sessions.values()) {
      if (session.label === label) {
        return { ok: true, key: session.key };
      }
    }
  }
  return { ok: false };
}

// ========== Agents Methods ==========

async function agentsList(_params: any, _ctx: GatewayMethodContext) {
  return {
    agents: Array.from(agents.values()),
    total: agents.size,
  };
}

async function agentsGet(params: any, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  return agents.get(id) ?? null;
}

// ========== Models Methods ==========

async function modelsList(_params: any, _ctx: GatewayMethodContext) {
  return {
    models: Array.from(models.values()),
    total: models.size,
  };
}

async function modelsGet(params: any, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  return models.get(id) ?? null;
}

// ========== Tools Methods ==========

async function toolsList(params: any, _ctx: GatewayMethodContext) {
  const { category, search } = params as { category?: string; search?: string };
  let result = Array.from(tools.values());
  if (category) {
    result = result.filter((t) => t.category === category);
  }
  if (search) {
    const lower = search.toLowerCase();
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower),
    );
  }
  return { tools: result, total: result.length };
}

async function toolsGet(params: any, _ctx: GatewayMethodContext) {
  const { name } = params as { name: string };
  return tools.get(name) ?? null;
}

// ========== Health Methods ==========

async function healthGet(_params: any, _ctx: GatewayMethodContext): Promise<GatewayHealth> {
  return {
    status: "healthy",
    timestamp: Date.now(),
    version: "1.0.0",
    services: {
      database: true,
      llm: true,
      mcp: true,
    },
  };
}

// ========== System Methods ==========

async function systemStats(_params: any, _ctx: GatewayMethodContext): Promise<GatewayStats> {
  return {
    totalSessions: sessions.size,
    totalMessages,
    activeSessions: getActiveTurnCount(),
    uptimeMs: Date.now() - serverStartedAt,
    avgResponseTimeMs: 1500,
  };
}

async function systemMethodsList(_params: any, _ctx: GatewayMethodContext) {
  return {
    methods: [
      "sessions.list",
      "sessions.get",
      "sessions.create",
      "sessions.delete",
      "sessions.resolve",
      "sessions.send",
      "sessions.steer",
      "agents.list",
      "agents.get",
      "models.list",
      "models.get",
      "models.authStatus",
      "models.authLogout",
      "tools.list",
      "tools.get",
      "health.get",
      "system.stats",
      "system.methods.list",
    ],
  };
}

// ========== Sessions Send / Steer ==========

// 会话引导（steer）注入的待处理引导消息
interface SteerInjection {
  sessionKey: string;
  message: string;
  injectedAt: number;
  consumed: boolean;
}
const steerQueue = new Map<string, SteerInjection[]>();

/**
 * sessions.send — 发送消息到会话，等价于 chat.send 的会话语义别名。
 * 与 openclaw 一致：内部转发到 chat.send，复用其 runChatSession 执行路径。
 */
async function sessionsSend(params: any, ctx: GatewayMethodContext) {
  const { sessionKey, message, model, agent, mode } = params as {
    sessionKey?: string;
    message?: string;
    model?: string;
    agent?: string;
    mode?: "standard" | "fast";
  };

  if (!sessionKey) {
    return { ok: false, error: { code: "MISSING_SESSION", message: "sessionKey is required" } };
  }
  if (!message) {
    return { ok: false, error: { code: "MISSING_MESSAGE", message: "message is required" } };
  }

  const registry = getMethodRegistry();
  const result = await registry.invoke(
    "chat.send",
    { sessionKey, message, model, agent, mode },
    ctx,
  );

  return result;
}

/**
 * sessions.steer — 引导会话，向会话注入一条系统级引导消息，不影响用户消息历史。
 * 与 openclaw 一致：steer 是非破坏性的方向引导，排队等待下一次 run 消费。
 */
async function sessionsSteer(params: any, _ctx: GatewayMethodContext) {
  const { sessionKey, message, role = "system" } = params as {
    sessionKey?: string;
    message?: string;
    role?: "system" | "user" | "assistant";
  };

  if (!sessionKey) {
    return { ok: false, error: { code: "MISSING_SESSION", message: "sessionKey is required" } };
  }
  if (!message) {
    return { ok: false, error: { code: "MISSING_MESSAGE", message: "message is required" } };
  }

  const injection: SteerInjection = {
    sessionKey,
    message,
    injectedAt: Date.now(),
    consumed: false,
  };

  const queue = steerQueue.get(sessionKey) ?? [];
  queue.push(injection);
  // 限制队列长度，避免无限增长
  if (queue.length > 50) queue.splice(0, queue.length - 50);
  steerQueue.set(sessionKey, queue);

  return {
    ok: true,
    sessionKey,
    role,
    queued: queue.length,
  };
}

// ========== Models Auth Status / Logout ==========

// 模型 provider 认证状态（内存存储）
interface ModelAuthState {
  provider: string;
  authenticated: boolean;
  authType: "api_key" | "oauth" | "none";
  lastCheckedAt: number;
  reason?: string;
}
const modelAuthStates = new Map<string, ModelAuthState>();

/**
 * models.authStatus — 返回模型 provider 的认证状态。
 * 参考 openclaw models-auth-status.ts，精简为基于内存状态 + models.list 的聚合。
 */
async function modelsAuthStatus(params: any, _ctx: GatewayMethodContext) {
  const { provider, refresh = false } = params as { provider?: string; refresh?: boolean };

  const registry = getMethodRegistry();
  const modelsResult = await registry.invoke("models.list", {}, {
    requestId: `models_auth_${Date.now()}`,
    timestamp: Date.now(),
  });

  const allModels = (modelsResult.ok && modelsResult.result
    ? (modelsResult.result as Record<string, any>).models
    : []) as Array<{ id: string; provider?: string }>;

  // 聚合 provider 列表（从已注册模型推导）
  const providerSet = new Set<string>();
  for (const model of allModels) {
    if (model.provider) providerSet.add(model.provider);
  }
  if (provider) {
    providerSet.clear();
    providerSet.add(provider);
  }

  const now = Date.now();
  const providers: Array<Record<string, any>> = [];
  for (const p of providerSet) {
    const state = modelAuthStates.get(p);
    // refresh=true 时重新校验（此处刷新 lastCheckedAt）
    if (refresh || !state) {
      const nextState: ModelAuthState = {
        provider: p,
        authenticated: state?.authenticated ?? false,
        authType: state?.authType ?? "none",
        lastCheckedAt: now,
        reason: state?.reason,
      };
      modelAuthStates.set(p, nextState);
    }
    const current = modelAuthStates.get(p)!;
    providers.push({
      provider: p,
      authenticated: current.authenticated,
      authType: current.authType,
      lastCheckedAt: current.lastCheckedAt,
      reason: current.reason ?? null,
    });
  }

  return {
    ok: true,
    ts: now,
    providers,
    expectsOAuth: providers.some((p) => p.authType === "oauth"),
  };
}

/**
 * models.authLogout — 登出指定 provider 的模型认证。
 * 参考 openclaw models-auth-status.ts，清除内存认证状态。
 */
async function modelsAuthLogout(params: any, _ctx: GatewayMethodContext) {
  const { provider } = params as { provider?: string };

  if (!provider) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "provider is required" } };
  }

  const removed = modelAuthStates.delete(provider);
  // 主动标记为未认证，确保后续 authStatus 反映登出结果
  modelAuthStates.set(provider, {
    provider,
    authenticated: false,
    authType: "none",
    lastCheckedAt: Date.now(),
    reason: "logged out",
  });

  return {
    ok: true,
    provider,
    removedProfiles: removed ? 1 : 0,
    abortedRunIds: [] as string[],
  };
}

/**
 * 注册所有核心方法
 */
export function registerCoreMethods(): void {
  registerGatewayMethod("sessions.list", sessionsList);
  registerGatewayMethod("sessions.get", sessionsGet);
  registerGatewayMethod("sessions.create", sessionsCreate);
  registerGatewayMethod("sessions.delete", sessionsDelete);
  registerGatewayMethod("sessions.resolve", sessionsResolve);
  registerGatewayMethod("sessions.send", sessionsSend);
  registerGatewayMethod("sessions.steer", sessionsSteer);
  registerGatewayMethod("agents.list", agentsList);
  registerGatewayMethod("agents.get", agentsGet);
  registerGatewayMethod("models.list", modelsList);
  registerGatewayMethod("models.get", modelsGet);
  registerGatewayMethod("models.authStatus", modelsAuthStatus);
  registerGatewayMethod("models.authLogout", modelsAuthLogout);
  registerGatewayMethod("tools.list", toolsList);
  registerGatewayMethod("tools.get", toolsGet);
  registerGatewayMethod("health.get", healthGet);
  registerGatewayMethod("system.stats", systemStats);
  registerGatewayMethod("system.methods.list", systemMethodsList);
}
