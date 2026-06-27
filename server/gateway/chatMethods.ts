/**
 * Chat Gateway Methods
 * Chat 服务方法 - Gateway 的聊天相关服务方法
 */

import type { GatewayMethodContext } from "./types.js";
import { registerGatewayMethod } from "./methodRegistry.js";

// 内存中的聊天历史存储（生产环境应使用数据库）
const chatHistory = new Map<string, Array<{
  id: string;
  role: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}>>();

// 活跃的运行中会话
const activeRuns = new Map<string, {
  runId: string;
  sessionKey: string;
  status: "running" | "aborted" | "completed" | "failed";
  startedAt: number;
  abortController?: AbortController;
}>();

// ========== Chat Send ==========

async function chatSend(params: unknown, ctx: GatewayMethodContext) {
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

  activeRuns.set(runId, {
    runId,
    sessionKey,
    status: "running",
    startedAt: Date.now(),
    abortController,
  });

  // 添加用户消息到历史
  const history = chatHistory.get(sessionKey) ?? [];
  history.push({
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: "user",
    content: message,
    timestamp: Date.now(),
    metadata: { runId },
  });
  chatHistory.set(sessionKey, history);

  // 注意：实际的 LLM 调用由 chatService 处理
  // 这里只是 Gateway 层面的会话管理入口

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

  const history = chatHistory.get(sessionKey) ?? [];
  const sliced = history.slice(-limit - offset, history.length - offset > 0 ? undefined : 0);

  return {
    ok: true,
    messages: sliced,
    total: history.length,
    hasMore: offset + limit < history.length,
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

  const history = chatHistory.get(sessionKey) ?? [];
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    content,
    timestamp: Date.now(),
    metadata,
  };
  history.push(message);
  chatHistory.set(sessionKey, history);

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

  const existed = chatHistory.has(sessionKey);
  chatHistory.set(sessionKey, []);

  return {
    ok: true,
    cleared: existed,
  };
}

// ========== Chat Stats ==========

async function chatStats(_params: unknown, _ctx: GatewayMethodContext) {
  const totalMessages = Array.from(chatHistory.values()).reduce(
    (sum, msgs) => sum + msgs.length,
    0,
  );
  const activeCount = Array.from(activeRuns.values()).filter(
    (r) => r.status === "running",
  ).length;

  return {
    ok: true,
    totalSessions: chatHistory.size,
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

  const history = chatHistory.get(sessionKey) ?? [];
  const lowerQuery = query.toLowerCase();
  const results = history.filter((msg) =>
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

// 导出用于在其他地方管理历史
export function appendChatMessage(
  sessionKey: string,
  message: { role: string; content: string; metadata?: Record<string, unknown> },
): void {
  const history = chatHistory.get(sessionKey) ?? [];
  history.push({
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...message,
    timestamp: Date.now(),
  });
  chatHistory.set(sessionKey, history);
}

export function getChatHistory(sessionKey: string) {
  return chatHistory.get(sessionKey) ?? [];
}

export function getActiveRun(runId: string) {
  return activeRuns.get(runId);
}

export function updateRunStatus(runId: string, status: string) {
  const run = activeRuns.get(runId);
  if (run) {
    (run as { status: string }).status = status;
  }
}
