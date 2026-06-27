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

  console.log("[gateway] Gateway routes registered");
}
