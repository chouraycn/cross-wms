/**
 * Gateway Server Routes
 * Gateway 服务端 API 路由
 */

import type { Request, Response } from "express";
import { getMethodRegistry } from "./methodRegistry.js";
import { registerCoreMethods } from "./coreMethods.js";
import { registerChatMethods } from "./chatMethods.js";
import { registerCronMethods } from "./cronMethods.js";

// 确保所有方法已注册
registerCoreMethods();
registerChatMethods();
registerCronMethods();

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
    const { model, messages, stream = false, temperature, max_tokens, top_p } = req.body;

    if (!model) {
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

    const registry = getMethodRegistry();

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        const result = await registry.invoke("chat.send", {
          model,
          messages,
          temperature,
          maxTokens: max_tokens,
          topP: top_p,
          stream: true,
        }, {
          requestId: `openai_chat_${Date.now()}`,
          timestamp: Date.now(),
        });

        if (!result.ok) {
          res.write(`data: ${JSON.stringify({ error: result.error })}
\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }

        // 简化流式响应
        const responseText = (result.result as Record<string, unknown> | undefined)?.text as string || "";
        const chunks = responseText.match(/.{1,20}/g) || [responseText];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: { content: chunks[i] },
                finish_reason: i === chunks.length - 1 ? "stop" : null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write("data: [DONE]\n\n");
        res.end();
      } catch (e) {
        res.write(`data: ${JSON.stringify({ error: { message: String(e) } })}
\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return;
    }

    // 非流式响应
    const result = await registry.invoke("chat.send", {
      model,
      messages,
      temperature,
      maxTokens: max_tokens,
      topP: top_p,
    }, {
      requestId: `openai_chat_${Date.now()}`,
      timestamp: Date.now(),
    });

    if (!result.ok) {
      res.status(400).json({
        error: {
          message: result.error?.message || "Chat completion failed",
          type: "api_error",
        },
      });
      return;
    }

    const responseText = (result.result as Record<string, unknown> | undefined)?.text as string || "";
    const usage = (result.result as Record<string, unknown> | undefined)?.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: responseText,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
      },
    });
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

  console.log("[gateway] Gateway routes registered (including OpenAI-compatible endpoints)");
}
