/**
 * Chat Gateway Methods — Gateway 协议的聊天方法
 *
 * 架构定位：
 * - 这是 Gateway JSON-RPC 风格的聊天接口（/api/gateway/chat/*）
 * - 为第三方客户端提供标准方法调用方式访问 cdf-know 聊天能力
 * - 底层接入 dao/chat.ts 做持久化，并通过 runChatSession 触发实际执行
 * - 与 /api/chat 和 /api/agent-chat 共享同一份会话数据
 *
 * 注意：
 * - 主应用前端使用 /api/agent-chat（SSE AgentEvent 流）
 * - 本模块供 gateway 协议客户端使用（REST 风格，非流式）
 * - chat.send 异步触发 runChatSession，通过 chat.status 查询执行进度
 */

import type { GatewayMethodContext } from "./types.js";
import { registerGatewayMethod } from "./methodRegistry.js";
import { getSessionMessages, addMessage, getSessions, deleteSession } from "../dao/chat.js";
import type { Message } from "../db-chat.js";
import { runChatSession } from "../engine/runChatSession.js";
import { logger } from "../logger.js";

const activeRuns = new Map<string, {
  runId: string;
  sessionKey: string;
  status: "running" | "aborted" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  abortController?: AbortController;
  result?: { content: string; errorCode?: string; errorMessage?: string };
}>();

// ========== Chat Send ==========

async function chatSend(params: unknown, _ctx: GatewayMethodContext) {
  const {
    sessionKey,
    message,
    model,
    agent,
    mode = "standard",
  } = params as {
    sessionKey: string;
    message: string;
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

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const abortController = new AbortController();

  // 保存用户消息
  addMessage({
    sessionId: sessionKey,
    role: "user",
    content: message,
    model: model || "",
    toolCalls: undefined,
    thinking: "",
  } as Parameters<typeof addMessage>[0]);

  // 注册 run 状态
  activeRuns.set(runId, {
    runId,
    sessionKey,
    status: "running",
    startedAt: Date.now(),
    abortController,
  });

  // 异步触发 runChatSession 执行（不阻塞 gateway 响应）
  runChatSession(
    {
      sessionId: sessionKey,
      message,
      model: model || "auto",
      agentId: agent,
    },
    {
      onError: (err) => {
        const run = activeRuns.get(runId);
        if (run) {
          run.status = "failed";
          run.completedAt = Date.now();
          run.result = { content: "", errorCode: "RUNTIME_ERROR", errorMessage: err.message };
        }
        logger.error(`[Gateway chat.send] run ${runId} failed:`, err);
      },
    },
  ).then((result) => {
    const run = activeRuns.get(runId);
    if (run && run.status === "running") {
      run.status = "completed";
      run.completedAt = Date.now();
      run.result = {
        content: result.content,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      };
    }
  }).catch((err) => {
    const run = activeRuns.get(runId);
    if (run) {
      run.status = "failed";
      run.completedAt = Date.now();
      run.result = { content: "", errorCode: "RUNTIME_ERROR", errorMessage: err.message };
    }
    logger.error(`[Gateway chat.send] run ${runId} threw:`, err);
  });

  // 自动清理 30 分钟前的已完成 run（避免内存泄漏）
  if (activeRuns.size > 100) {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, run] of activeRuns) {
      if (run.completedAt && run.completedAt < cutoff) {
        activeRuns.delete(id);
      }
    }
  }

  return {
    ok: true,
    runId,
    sessionKey,
    status: "running",
    mode,
  };
}

// ========== Chat History ==========

async function chatHistoryGet(params: unknown, _ctx: GatewayMethodContext) {
  const {
    sessionKey,
    limit = 50,
    offset = 0,
  } = params as {
    sessionKey: string;
    limit?: number;
    offset?: number;
  };

  if (!sessionKey) {
    return { ok: false, error: { code: "MISSING_SESSION", message: "sessionKey is required" } };
  }

  const allMessages = getSessionMessages(sessionKey);
  const total = allMessages.length;
  const startIdx = Math.max(0, total - limit - offset);
  const endIdx = total - offset;
  const messages = allMessages.slice(startIdx, Math.max(startIdx, endIdx));

  return {
    ok: true,
    messages,
    total,
    hasMore: offset + limit < total,
  };
}

// ========== Chat Abort ==========

async function chatAbort(params: unknown, _ctx: GatewayMethodContext) {
  const { runId, sessionKey } = params as { runId?: string; sessionKey?: string };

  if (!runId && !sessionKey) {
    return { ok: false, error: { code: "MISSING_PARAMS", message: "runId or sessionKey is required" } };
  }

  let aborted = 0;

  if (runId) {
    const run = activeRuns.get(runId);
    if (run && run.status === "running") {
      run.status = "aborted";
      run.abortController?.abort();
      aborted++;
    }
  }

  if (sessionKey) {
    for (const run of activeRuns.values()) {
      if (run.sessionKey === sessionKey && run.status === "running") {
        run.status = "aborted";
        run.abortController?.abort();
        aborted++;
      }
    }
  }

  return {
    ok: true,
    aborted,
  };
}

// ========== Chat Status ==========

async function chatStatus(params: unknown, _ctx: GatewayMethodContext) {
  const { runId, sessionKey } = params as { runId?: string; sessionKey?: string };

  if (runId) {
    const run = activeRuns.get(runId);
    return { ok: true, run: run ?? null };
  }

  if (sessionKey) {
    const runs = Array.from(activeRuns.values()).filter((r) => r.sessionKey === sessionKey);
    return { ok: true, runs };
  }

  const activeCount = Array.from(activeRuns.values()).filter((r) => r.status === "running").length;
  return {
    ok: true,
    totalRuns: activeRuns.size,
    activeCount,
  };
}

// ========== Chat Inject ==========

async function chatInject(params: unknown, _ctx: GatewayMethodContext) {
  const {
    sessionKey,
    role = "system",
    content,
    metadata,
  } = params as {
    sessionKey: string;
    role?: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  };

  if (!sessionKey || !content) {
    return { ok: false, error: { code: "MISSING_PARAMS", message: "sessionKey and content are required" } };
  }

  const message = addMessage({
    sessionId: sessionKey,
    role: role as Message["role"],
    content,
    model: "",
    toolCalls: undefined,
    thinking: "",
  } as Parameters<typeof addMessage>[0]);

  return {
    ok: true,
    message,
  };
}

// ========== Chat Clear ==========

async function chatClear(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionKey } = params as { sessionKey: string };

  if (!sessionKey) {
    return { ok: false, error: { code: "MISSING_SESSION", message: "sessionKey is required" } };
  }

  const sessions = getSessions();
  const existed = sessions.some((s) => s.id === sessionKey);
  if (existed) {
    deleteSession(sessionKey);
  }

  return {
    ok: true,
    cleared: existed,
  };
}

// ========== Chat Stats ==========

async function chatStats(_params: unknown, _ctx: GatewayMethodContext) {
  const sessions = getSessions();
  let totalMessages = 0;
  for (const s of sessions) {
    totalMessages += getSessionMessages(s.id).length;
  }
  const activeCount = Array.from(activeRuns.values()).filter(
    (r) => r.status === "running",
  ).length;

  return {
    ok: true,
    totalSessions: sessions.length,
    totalMessages,
    activeRuns: activeCount,
  };
}

// ========== Chat Search ==========

async function chatSearch(params: unknown, _ctx: GatewayMethodContext) {
  const {
    sessionKey,
    query,
    limit = 20,
  } = params as {
    sessionKey: string;
    query: string;
    limit?: number;
  };

  if (!sessionKey || !query) {
    return { ok: false, error: { code: "MISSING_PARAMS", message: "sessionKey and query are required" } };
  }

  const allMessages = getSessionMessages(sessionKey);
  const lowerQuery = query.toLowerCase();
  const results = allMessages.filter((msg) =>
    msg.content.toLowerCase().includes(lowerQuery),
  ).slice(-limit);

  return {
    ok: true,
    results,
    total: results.length,
  };
}

/**
 * 注册所有 Chat 服务方法
 */
export function registerChatMethods(): void {
  registerGatewayMethod("chat.send", chatSend);
  registerGatewayMethod("chat.history", chatHistoryGet);
  registerGatewayMethod("chat.abort", chatAbort);
  registerGatewayMethod("chat.status", chatStatus);
  registerGatewayMethod("chat.inject", chatInject);
  registerGatewayMethod("chat.clear", chatClear);
  registerGatewayMethod("chat.stats", chatStats);
  registerGatewayMethod("chat.search", chatSearch);
}

export function appendChatMessage(
  sessionKey: string,
  message: { role: string; content: string; metadata?: Record<string, unknown> },
): void {
  addMessage({
    sessionId: sessionKey,
    role: message.role as Message["role"],
    content: message.content,
    model: "",
    toolCalls: undefined,
    thinking: "",
  } as Parameters<typeof addMessage>[0]);
}

export function getChatHistory(sessionKey: string) {
  return getSessionMessages(sessionKey);
}

export function getActiveRun(runId: string) {
  return activeRuns.get(runId);
}

export function updateRunStatus(runId: string, status: string) {
  const run = activeRuns.get(runId);
  if (run) {
    (run as { status: string }).status = status as "running" | "aborted" | "completed" | "failed";
  }
}
