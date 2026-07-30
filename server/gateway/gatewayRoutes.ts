/**
 * Gateway Server Routes
 * Gateway 服务端 API 路由
 */

import type { Request, Response } from "express";
import { getMethodRegistry } from "./methodRegistry.js";
import { registerCoreMethods } from "./coreMethods.js";
import { registerChatMethods } from "./chatMethods.js";
import { registerCronMethods } from "./cronMethods.js";
import { registerWorkboardMethods } from "./workboardMethods.js";
import { registerDevicesMethods } from "./devicesMethods.js";
import { registerDiagnosticsMethods } from "./diagnosticsMethods.js";
import { registerDoctorMethods } from "./doctorMethods.js";
import { registerExecApprovalsMethods } from "./execApprovalsMethods.js";
import { registerPluginApprovalMethods } from "./pluginApprovalMethods.js";
import { registerChannelsMethods } from "./channelsMethods.js";
import { registerNodeMethods } from "./nodeMethods.js";
import { registerAgentIdentityMethods } from "./agentIdentityMethods.js";
import { registerSkillsProposalsMethods } from "./skillsProposalsMethods.js";
import { registerConfigMethods } from "./configMethods.js";
import { registerSecretsMethods } from "./secretsMethods.js";
import { initSessionSync } from "./sessionSync.js";
import {
  callAIModelStream,
  AIAPIError,
  type ModelCallConfig,
  type MessageContent,
  type ToolDefinition,
  type ToolCall,
} from "../aiClient.js";
import { loadModelsConfig } from "../modelsStore.js";
import { selectKey, reportKeyResult } from "../keyRotator.js";
import { logger } from "../logger.js";

// 确保所有方法已注册
registerCoreMethods();
registerChatMethods();
registerCronMethods();
registerWorkboardMethods();

// 注册设备 / 诊断 / doctor / 审批方法（接收 registry 参数）
{
  const registry = getMethodRegistry();
  registerDevicesMethods(registry);
  registerDiagnosticsMethods(registry);
  registerDoctorMethods(registry);
  registerExecApprovalsMethods(registry);
  registerPluginApprovalMethods(registry);
}

// 注册新增的 WS RPC 方法
{
  const registry = getMethodRegistry();
  registerChannelsMethods(registry);
  registerNodeMethods(registry);
  registerAgentIdentityMethods(registry);
  registerSkillsProposalsMethods(registry);
  registerConfigMethods(registry);
  registerSecretsMethods(registry);
}

// 初始化会话同步
initSessionSync();

/**
 * Gateway JSON-RPC 风格的端点
 */
export async function gatewayRpcHandler(req: Request, res: Response): Promise<void> {
  const { method, params } = req.body as {
    method: string;
    params: unknown;
  };

  if (!method) {
    res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_METHOD",
        message: "Method is required",
      },
    });
    return;
  }

  const context = {
    requestId: req.headers["x-request-id"] as string || `req_${Date.now()}`,
    sessionKey: req.headers["x-session-key"] as string | undefined,
    userId: req.headers["x-user-id"] as string | undefined,
    apiKey: req.headers.authorization?.replace("Bearer ", ""),
    ip: req.ip,
    timestamp: Date.now(),
  };

  const registry = getMethodRegistry();
  const result = await registry.invoke(method, params ?? {}, context);

  if (!result.ok && result.error?.code === "METHOD_NOT_FOUND") {
    res.status(404).json(result);
    return;
  }

  if (!result.ok) {
    res.status(500).json(result);
    return;
  }

  res.json(result);
}

// ====== OpenAI 兼容端点辅助函数 ======

/**
 * 解析模型 ID 为 ModelCallConfig（含 API Key 轮询）。
 * 失败时返回 null 并附带错误信息。
 */
async function resolveModelCallConfig(
  modelId: string,
): Promise<{ config: ModelCallConfig; keyIndex: number } | { error: { message: string; type: string; code?: string } }> {
  let modelsFile;
  try {
    modelsFile = await loadModelsConfig();
  } catch (e) {
    return {
      error: {
        message: `Failed to load models config: ${e instanceof Error ? e.message : String(e)}`,
        type: "api_error",
      },
    };
  }

  const modelConfig = modelsFile.models.find((m) => m.id === modelId);
  if (!modelConfig) {
    return {
      error: {
        message: `Model '${modelId}' not found`,
        type: "invalid_request_error",
        param: "model",
        code: "model_not_found",
      },
    };
  }

  const keyResult = selectKey(modelConfig);
  const effectiveApiKey = keyResult ? keyResult.key : (modelConfig.apiKey || "");
  const keyIndex = keyResult ? keyResult.index : 0;

  const config: ModelCallConfig = {
    ...modelConfig,
    apiKey: effectiveApiKey,
  };

  return { config, keyIndex };
}

/** OpenAI 请求中的消息格式 */
interface OpenAIMessage {
  role: string;
  content?: unknown;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

/**
 * 将 OpenAI 消息数组归一化为 callAIModelStream 期望的格式。
 * - content: string | Array<{type:'text'|'image_url',...}> → MessageContent
 * - tool_calls: 透传并收敛为 ToolCall[]
 * - tool_call_id / name: 透传
 */
function normalizeOpenAIMessages(
  messages: OpenAIMessage[],
): Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }> {
  return messages.map((msg) => {
    const out: {
      role: string;
      content: MessageContent;
      tool_calls?: ToolCall[];
      tool_call_id?: string;
      name?: string;
    } = {
      role: msg.role,
      content: normalizeMessageContent(msg.content),
    };

    if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      out.tool_calls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }

    if (msg.tool_call_id) {
      out.tool_call_id = msg.tool_call_id;
    }

    if (msg.name) {
      out.name = msg.name;
    }

    return out;
  });
}

/** 将 OpenAI content 字段归一化为 MessageContent（string 或 vision 数组） */
function normalizeMessageContent(content: unknown): MessageContent {
  if (typeof content === "string") {
    return content;
  }
  if (content === null || content === undefined) {
    return "";
  }
  if (Array.isArray(content)) {
    // 已是 OpenAI vision 格式数组，收敛类型字段并保留 text/image_url
    const parts: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string; detail?: "auto" | "low" | "high" } }> = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") {
        parts.push({ type: "text", text: p.text });
      } else if (p.type === "image_url" && p.image_url && typeof p.image_url === "object") {
        const url = (p.image_url as Record<string, unknown>).url;
        if (typeof url === "string") {
          const detail = (p.image_url as Record<string, unknown>).detail;
          parts.push({
            type: "image_url",
            image_url: {
              url,
              detail: detail === "auto" || detail === "low" || detail === "high" ? detail : "auto",
            },
          });
        }
      }
    }
    return parts.length > 0 ? parts : "";
  }
  // 兜底：转字符串
  return String(content);
}

/** OpenAI 请求中的工具定义格式 */
interface OpenAITool {
  type: string;
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

/**
 * 将 OpenAI tools 数组转换为 callAIModelStream 期望的 ToolDefinition[]。
 * 跳过非 function 类型或缺少 function 字段的条目。
 */
function convertOpenAITools(tools: unknown): ToolDefinition[] {
  if (!Array.isArray(tools)) return [];
  const result: ToolDefinition[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const t = tool as OpenAITool;
    if (t.type !== "function" || !t.function) continue;
    result.push({
      type: "function",
      function: {
        name: t.function.name,
        description: t.function.description || "",
        parameters: t.function.parameters || { type: "object", properties: {} },
      },
    });
  }
  return result;
}

/**
 * 将 OpenAI tool_choice 转换为 callAIModelStream 的 toolChoice 参数。
 * - "auto" / "none" → 透传
 * - "required" → 'auto'（底层不支持 required，降级为 auto）
 * - { type: "function", function: { name } } → 透传
 */
function convertOpenAIToolChoice(
  toolChoice: unknown,
): "auto" | "none" | { type: "function"; function: { name: string } } | undefined {
  if (toolChoice === undefined || toolChoice === null) return undefined;
  if (toolChoice === "auto") return "auto";
  if (toolChoice === "none") return "none";
  if (toolChoice === "required") return "auto";
  if (typeof toolChoice === "object" && toolChoice !== null) {
    const tc = toolChoice as { type?: string; function?: { name?: string } };
    if (tc.type === "function" && tc.function?.name) {
      return { type: "function", function: { name: tc.function.name } };
    }
  }
  return undefined;
}

/**
 * 注册所有 Gateway 路由
 */
export function registerGatewayRoutes(app: {
  post: (path: string, handler: (req: Request, res: Response) => Promise<void> | void) => void;
  get: (path: string, handler: (req: Request, res: Response) => Promise<void> | void) => void;
  delete: (path: string, handler: (req: Request, res: Response) => Promise<void> | void) => void;
  put: (path: string, handler: (req: Request, res: Response) => Promise<void> | void) => void;
}): void {
  // JSON-RPC 端点
  app.post("/api/gateway/rpc", gatewayRpcHandler);

  // 健康检查
  app.get("/api/gateway/health", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("health.get", {}, {
      requestId: `health_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  // 系统统计
  app.get("/api/gateway/stats", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("system.stats", {}, {
      requestId: `stats_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  // 方法列表
  app.get("/api/gateway/methods", async (_req, res) => {
    const registry = getMethodRegistry();
    res.json({
      ok: true,
      result: {
        methods: registry.listMethods(),
      },
    });
  });

  // Sessions REST API
  app.get("/api/gateway/sessions", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("sessions.list", {}, {
      requestId: `sessions_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/sessions", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("sessions.create", req.body, {
      requestId: `sess_create_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  app.get("/api/gateway/sessions/:key", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("sessions.get", { key: req.params.key }, {
      requestId: `sess_get_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.result) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Session not found" } });
      return;
    }
    res.json(result);
  });

  app.delete("/api/gateway/sessions/:key", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("sessions.delete", { key: req.params.key }, {
      requestId: `sess_del_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  // Agents REST API
  app.get("/api/gateway/agents", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("agents.list", {}, {
      requestId: `agents_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/agents/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("agents.get", { id: req.params.id }, {
      requestId: `agent_get_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.result) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Agent not found" } });
      return;
    }
    res.json(result);
  });

  // Models REST API
  app.get("/api/gateway/models", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("models.list", {}, {
      requestId: `models_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/models/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("models.get", { id: req.params.id }, {
      requestId: `model_get_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.result) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Model not found" } });
      return;
    }
    res.json(result);
  });

  // Tools REST API
  app.get("/api/gateway/tools", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("tools.list", req.query, {
      requestId: `tools_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/tools/:name", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("tools.get", { name: req.params.name }, {
      requestId: `tool_get_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.result) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Tool not found" } });
      return;
    }
    res.json(result);
  });

  // Chat REST API
  app.post("/api/gateway/chat/send", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("chat.send", req.body, {
      requestId: `chat_send_${Date.now()}`,
      sessionKey: req.body.sessionKey,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.get("/api/gateway/chat/history", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("chat.history", req.query, {
      requestId: `chat_hist_${Date.now()}`,
      sessionKey: req.query.sessionKey as string,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/chat/abort", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("chat.abort", req.body, {
      requestId: `chat_abort_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/chat/status", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("chat.status", req.query, {
      requestId: `chat_status_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/chat/inject", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("chat.inject", req.body, {
      requestId: `chat_inject_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post("/api/gateway/chat/clear", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("chat.clear", req.body, {
      requestId: `chat_clear_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/chat/stats", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("chat.stats", {}, {
      requestId: `chat_stats_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  // Cron REST API
  app.get("/api/gateway/cron", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.list", {}, {
      requestId: `cron_list_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/cron/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.get", { id: req.params.id }, {
      requestId: `cron_get_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.result) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cron job not found" } });
      return;
    }
    res.json(result);
  });

  app.post("/api/gateway/cron", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.create", req.body, {
      requestId: `cron_create_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  app.put("/api/gateway/cron/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.update", { id: req.params.id, ...req.body }, {
      requestId: `cron_update_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.delete("/api/gateway/cron/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.delete", { id: req.params.id }, {
      requestId: `cron_del_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/cron/:id/enable", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.enable", { id: req.params.id, enabled: true }, {
      requestId: `cron_enable_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/cron/:id/disable", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.enable", { id: req.params.id, enabled: false }, {
      requestId: `cron_disable_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/cron/:id/trigger", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.trigger", { id: req.params.id }, {
      requestId: `cron_trigger_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/cron-stats", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("cron.stats", {}, {
      requestId: `cron_stats_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  // ====== OpenAI 兼容 API ======

  // GET /v1/models — OpenAI 兼容模型列表
  app.get("/v1/models", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("models.list", {}, {
      requestId: `openai_models_${Date.now()}`,
      timestamp: Date.now(),
    });

    if (!result.ok) {
      res.status(500).json({
        error: {
          message: result.error?.message || "Failed to list models",
          type: "api_error",
        },
      });
      return;
    }

    const models = ((result.result as Record<string, unknown> | undefined)?.models || []) as Array<{
      id: string;
      name?: string;
      description?: string;
      provider?: string;
    }>;

    res.json({
      object: "list",
      data: models.map((model) => ({
        id: model.id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: model.provider || "cdf-know",
      })),
    });
  });

  // GET /v1/models/:model — OpenAI 兼容模型详情
  app.get("/v1/models/:model", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("models.get", { id: req.params.model }, {
      requestId: `openai_model_${Date.now()}`,
      timestamp: Date.now(),
    });

    if (!result.ok || !result.result) {
      res.status(404).json({
        error: {
          message: `Model '${req.params.model}' not found`,
          type: "invalid_request_error",
          param: "model",
          code: "model_not_found",
        },
      });
      return;
    }

    const model = result.result as { id: string; provider?: string };
    res.json({
      id: model.id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: model.provider || "cdf-know",
    });
  });

  // POST /v1/chat/completions — OpenAI 兼容聊天补全
  app.post("/v1/chat/completions", async (req, res) => {
    const {
      model,
      messages,
      stream = false,
      temperature,
      max_tokens,
      max_completion_tokens,
      top_p,
      tools,
      tool_choice,
    } = req.body as {
      model?: string;
      messages?: OpenAIMessage[];
      stream?: boolean;
      temperature?: number;
      max_tokens?: number;
      max_completion_tokens?: number;
      top_p?: number;
      tools?: unknown;
      tool_choice?: unknown;
    };

    if (!model || typeof model !== "string") {
      res.status(400).json({
        error: {
          message: "Missing required parameter: 'model'",
          type: "invalid_request_error",
          param: "model",
        },
      });
      return;
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: {
          message: "Missing required parameter: 'messages'",
          type: "invalid_request_error",
          param: "messages",
        },
      });
      return;
    }

    // 解析模型配置（含 API Key 轮询）
    const resolved = await resolveModelCallConfig(model);
    if ("error" in resolved) {
      const status = resolved.error.code === "model_not_found" ? 404 : 500;
      res.status(status).json({ error: resolved.error });
      return;
    }
    const modelCallConfig = resolved.config;
    const keyIndex = resolved.keyIndex;

    // 应用请求级参数覆盖（temperature / maxTokens / topP）
    const effectiveMaxTokens = max_completion_tokens ?? max_tokens;
    const finalConfig: ModelCallConfig = {
      ...modelCallConfig,
      ...(typeof temperature === "number" ? { temperature } : {}),
      ...(typeof effectiveMaxTokens === "number" ? { maxTokens: effectiveMaxTokens } : {}),
      ...(typeof top_p === "number" ? { topP: top_p } : {}),
    };

    // 归一化消息与工具
    const normalizedMessages = normalizeOpenAIMessages(messages);
    const toolDefs = convertOpenAITools(tools);
    const effectiveToolChoice = convertOpenAIToolChoice(tool_choice);

    const completionId = `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const created = Math.floor(Date.now() / 1000);
    const abortController = new AbortController();

    // 客户端断开时取消上游请求
    const onClose = () => abortController.abort();
    req.on("close", onClose);

    // 收集 tool calls（onToolCall 在流式与非流式下都会触发）
    const collectedToolCalls: ToolCall[] = [];

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      if (req.socket) {
        req.socket.setNoDelay(true);
      }

      const writeSse = (obj: unknown) => {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      // 首个 chunk：role 占位（符合 OpenAI 流式协议）
      writeSse({
        id: completionId,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      });

      try {
        await callAIModelStream(
          finalConfig,
          normalizedMessages,
          (text) => {
            if (text) {
              writeSse({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
              });
            }
          },
          abortController.signal,
          undefined, // onThinking
          toolDefs.length > 0 ? toolDefs : undefined,
          (toolCall) => {
            collectedToolCalls.push(toolCall);
          },
          finalConfig.capabilities,
          undefined, // onRateLimit
          undefined, // thinkingLevel
          effectiveToolChoice,
        );

        // 上报 Key 使用结果
        reportKeyResult(model, keyIndex, true);

        const finishReason = collectedToolCalls.length > 0 ? "tool_calls" : "stop";

        // 若有 tool_calls，作为最终 delta 发出
        if (collectedToolCalls.length > 0) {
          writeSse({
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: collectedToolCalls.map((tc, idx) => ({
                    index: idx,
                    id: tc.id,
                    type: "function",
                    function: { name: tc.function.name, arguments: tc.function.arguments },
                  })),
                },
                finish_reason: null,
              },
            ],
          });
        }

        // 最终 finish chunk
        writeSse({
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        });

        res.write("data: [DONE]\n\n");
        res.end();
      } catch (e) {
        reportKeyResult(model, keyIndex, false);
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error(`[OpenAI compat /v1/chat/completions stream] ${errMsg}`);
        // 已开始流式输出，只能以错误 chunk 收尾
        writeSse({
          error: {
            message: errMsg,
            type: e instanceof AIAPIError ? "api_error" : "internal_error",
          },
        });
        res.write("data: [DONE]\n\n");
        res.end();
      } finally {
        req.off("close", onClose);
      }
      return;
    }

    // ====== 非流式响应 ======
    try {
      let responseText = "";
      const response = await callAIModelStream(
        finalConfig,
        normalizedMessages,
        (text) => {
          responseText += text;
        },
        abortController.signal,
        undefined, // onThinking
        toolDefs.length > 0 ? toolDefs : undefined,
        (toolCall) => {
          collectedToolCalls.push(toolCall);
        },
        finalConfig.capabilities,
        undefined, // onRateLimit
        undefined, // thinkingLevel
        effectiveToolChoice,
      );

      reportKeyResult(model, keyIndex, true);

      const finishReason = collectedToolCalls.length > 0 ? "tool_calls" : "stop";
      const usage = response.usage;
      const promptTokens = usage?.promptTokens ?? 0;
      const completionTokens = usage?.completionTokens ?? 0;
      const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;

      const assistantMessage: {
        role: string;
        content: string;
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
      } = {
        role: "assistant",
        content: responseText || "",
      };
      if (collectedToolCalls.length > 0) {
        assistantMessage.tool_calls = collectedToolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
      }

      res.json({
        id: completionId,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: assistantMessage,
            finish_reason: finishReason,
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
      });
    } catch (e) {
      reportKeyResult(model, keyIndex, false);
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error(`[OpenAI compat /v1/chat/completions] ${errMsg}`);

      if (e instanceof AIAPIError) {
        const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
        res.status(status).json({
          error: {
            message: errMsg,
            type: e.category === "auth" ? "invalid_request_error" : "api_error",
            code: e.category,
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          message: errMsg,
          type: "internal_error",
        },
      });
    } finally {
      req.off("close", onClose);
    }
  });

  // POST /v1/embeddings — OpenAI 兼容 Embedding
  app.post("/v1/embeddings", async (req, res) => {
    const { model = "text-embedding-3-small", input } = req.body;

    if (!input) {
      res.status(400).json({
        error: {
          message: "Missing required parameter: 'input'",
          type: "invalid_request_error",
          param: "input",
        },
      });
      return;
    }

    const registry = getMethodRegistry();
    const result = await registry.invoke("embeddings.create", {
      model,
      input: typeof input === "string" ? [input] : input,
    }, {
      requestId: `openai_emb_${Date.now()}`,
      timestamp: Date.now(),
    });

    if (!result.ok) {
      res.status(400).json({
        error: {
          message: result.error?.message || "Embedding creation failed",
          type: "api_error",
        },
      });
      return;
    }

    const embeddings = (result.result as Record<string, unknown>)?.embeddings as number[][] || [];
    const texts = typeof input === "string" ? [input] : input;

    res.json({
      object: "list",
      data: embeddings.map((emb: number[], index: number) => ({
        object: "embedding",
        index,
        embedding: emb,
      })),
      model,
      usage: {
        prompt_tokens: texts.join(" ").split(/\s+/).length,
        total_tokens: texts.join(" ").split(/\s+/).length,
      },
    });
  });

  // ====== Workboard REST API ======

  app.get("/api/gateway/workboard/tasks", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.tasks.list", req.query, {
      requestId: `wb_tasks_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/workboard/tasks/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.tasks.get", { id: req.params.id }, {
      requestId: `wb_task_get_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  });

  app.post("/api/gateway/workboard/tasks", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.tasks.create", req.body, {
      requestId: `wb_task_create_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  app.put("/api/gateway/workboard/tasks/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.tasks.update", { id: req.params.id, ...req.body }, {
      requestId: `wb_task_update_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.delete("/api/gateway/workboard/tasks/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.tasks.delete", { id: req.params.id }, {
      requestId: `wb_task_delete_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/workboard/tasks/:id/claim", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.task.claim", { taskId: req.params.id, ...req.body }, {
      requestId: `wb_task_claim_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post("/api/gateway/workboard/tasks/:id/release", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.task.release", { taskId: req.params.id, ...req.body }, {
      requestId: `wb_task_release_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post("/api/gateway/workboard/tasks/:id/complete", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.task.complete", { taskId: req.params.id, ...req.body }, {
      requestId: `wb_task_complete_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post("/api/gateway/workboard/tasks/:id/fail", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.task.fail", { taskId: req.params.id, ...req.body }, {
      requestId: `wb_task_fail_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.get("/api/gateway/workboard/workers", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.workers.list", req.query, {
      requestId: `wb_workers_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.get("/api/gateway/workboard/workers/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.workers.get", { id: req.params.id }, {
      requestId: `wb_worker_get_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  });

  app.post("/api/gateway/workboard/workers", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.workers.register", req.body, {
      requestId: `wb_worker_create_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  app.delete("/api/gateway/workboard/workers/:id", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.workers.unregister", { id: req.params.id }, {
      requestId: `wb_worker_delete_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  app.post("/api/gateway/workboard/workers/:id/heartbeat", async (req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.workers.heartbeat", { id: req.params.id }, {
      requestId: `wb_worker_heartbeat_${Date.now()}`,
      timestamp: Date.now(),
    });
    if (!result.ok) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  });

  app.get("/api/gateway/workboard/stats", async (_req, res) => {
    const registry = getMethodRegistry();
    const result = await registry.invoke("workboard.stats", {}, {
      requestId: `wb_stats_${Date.now()}`,
      timestamp: Date.now(),
    });
    res.json(result);
  });

  console.log("[gateway] Gateway routes registered (including OpenAI-compatible endpoints)");
}
