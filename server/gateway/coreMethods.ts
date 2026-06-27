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
import { registerGatewayMethod } from "./methodRegistry.js";
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

  // 默认 Models
  const defaultModels: GatewayModel[] = [
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      provider: "deepseek",
      type: "chat",
      maxTokens: 32768,
      capabilities: ["streaming", "tool_calls", "thinking"],
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "chat",
      maxTokens: 128000,
      capabilities: ["streaming", "tool_calls", "vision", "thinking"],
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: "openai",
      type: "chat",
      maxTokens: 128000,
      capabilities: ["streaming", "tool_calls"],
    },
  ];

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

async function sessionsList(params: unknown, _ctx: GatewayMethodContext) {
  const { limit = 50, offset = 0 } = params as { limit?: number; offset?: number };
  const allSessions = Array.from(sessions.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(offset, offset + limit);
  return {
    sessions: allSessions,
    total: sessions.size,
  };
}

async function sessionsGet(params: unknown, _ctx: GatewayMethodContext) {
  const { key } = params as { key: string };
  return sessions.get(key) ?? null;
}

async function sessionsCreate(params: unknown, _ctx: GatewayMethodContext) {
  const { key, label, meta } = params as { key: string; label?: string; meta?: Record<string, unknown> };
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

async function sessionsDelete(params: unknown, _ctx: GatewayMethodContext) {
  const { key } = params as { key: string };
  return { deleted: sessions.delete(key) };
}

async function sessionsResolve(params: unknown, _ctx: GatewayMethodContext) {
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

async function agentsList(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    agents: Array.from(agents.values()),
    total: agents.size,
  };
}

async function agentsGet(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  return agents.get(id) ?? null;
}

// ========== Models Methods ==========

async function modelsList(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    models: Array.from(models.values()),
    total: models.size,
  };
}

async function modelsGet(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  return models.get(id) ?? null;
}

// ========== Tools Methods ==========

async function toolsList(params: unknown, _ctx: GatewayMethodContext) {
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

async function toolsGet(params: unknown, _ctx: GatewayMethodContext) {
  const { name } = params as { name: string };
  return tools.get(name) ?? null;
}

// ========== Health Methods ==========

async function healthGet(_params: unknown, _ctx: GatewayMethodContext): Promise<GatewayHealth> {
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

async function systemStats(_params: unknown, _ctx: GatewayMethodContext): Promise<GatewayStats> {
  return {
    totalSessions: sessions.size,
    totalMessages,
    activeSessions: getActiveTurnCount(),
    uptimeMs: Date.now() - serverStartedAt,
    avgResponseTimeMs: 1500,
  };
}

async function systemMethodsList(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    methods: [
      "sessions.list",
      "sessions.get",
      "sessions.create",
      "sessions.delete",
      "sessions.resolve",
      "agents.list",
      "agents.get",
      "models.list",
      "models.get",
      "tools.list",
      "tools.get",
      "health.get",
      "system.stats",
      "system.methods.list",
    ],
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
  registerGatewayMethod("agents.list", agentsList);
  registerGatewayMethod("agents.get", agentsGet);
  registerGatewayMethod("models.list", modelsList);
  registerGatewayMethod("models.get", modelsGet);
  registerGatewayMethod("tools.list", toolsList);
  registerGatewayMethod("tools.get", toolsGet);
  registerGatewayMethod("health.get", healthGet);
  registerGatewayMethod("system.stats", systemStats);
  registerGatewayMethod("system.methods.list", systemMethodsList);
}
