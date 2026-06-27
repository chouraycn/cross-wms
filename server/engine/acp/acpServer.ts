/**
 * ACP Server
 * ACP 服务器核心 - 处理 ACP 协议的服务端实现
 */

import type {
  AcpTurnEvent,
  AcpTurnRequest,
  AcpSessionCreateRequest,
  AcpSessionCloseRequest,
} from "./acpTypes.js";
import { AcpRuntimeError } from "./types.js";

export type AcpMethod =
  | "sessions/create"
  | "sessions/close"
  | "sessions/list"
  | "sessions/get"
  | "turns/run"
  | "turns/cancel"
  | "turns/status"
  | "tools/list"
  | "models/list"
  | "health";

export interface AcpRequestEnvelope {
  jsonrpc: "2.0";
  id: string | number;
  method: AcpMethod | string;
  params?: Record<string, unknown>;
}

export interface AcpResponseEnvelope {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface AcpSession {
  id: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface AcpTurn {
  id: string;
  sessionId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

type AcpHandler = (
  params: Record<string, unknown>,
  context: AcpServerContext,
) => Promise<unknown>;

export interface AcpServerContext {
  requestId: string;
  timestamp: number;
  sessionId?: string;
  turnId?: string;
}

class AcpServer {
  private readonly handlers = new Map<string, AcpHandler>();
  private readonly sessions = new Map<string, AcpSession>();
  private readonly turns = new Map<string, AcpTurn>();
  private readonly eventStreams = new Map<string, Array<{ event: AcpTurnEvent; timestamp: number }>>();
  private isRunning = false;

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // Session handlers
    this.handler("sessions/create", async (params) => {
      return this.handleSessionCreate(params as AcpSessionCreateRequest);
    });

    this.handler("sessions/close", async (params) => {
      return this.handleSessionClose(params as unknown as AcpSessionCloseRequest);
    });

    this.handler("sessions/list", async () => {
      return {
        sessions: Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt),
        total: this.sessions.size,
      };
    });

    this.handler("sessions/get", async (params) => {
      const sessionId = params.sessionId as string;
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new AcpRuntimeError("NOT_FOUND", `Session not found: ${sessionId}`);
      }
      return session;
    });

    // Turn handlers
    this.handler("turns/cancel", async (params) => {
      const turnId = params.turnId as string;
      const turn = this.turns.get(turnId);
      if (!turn) {
        throw new AcpRuntimeError("NOT_FOUND", `Turn not found: ${turnId}`);
      }
      turn.status = "cancelled";
      turn.completedAt = Date.now();
      return { cancelled: true, turnId };
    });

    this.handler("turns/status", async (params) => {
      const turnId = params.turnId as string;
      const turn = this.turns.get(turnId);
      if (!turn) {
        throw new AcpRuntimeError("NOT_FOUND", `Turn not found: ${turnId}`);
      }
      return turn;
    });

    // Tools & Models
    this.handler("tools/list", async () => {
      return {
        tools: [
          { name: "web_search", description: "搜索网页内容" },
          { name: "memory_search", description: "搜索记忆内容" },
          { name: "wms_inventory_query", description: "查询 WMS 库存" },
        ],
      };
    });

    this.handler("models/list", async () => {
      return {
        models: [
          { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek" },
          { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
          { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
        ],
      };
    });

    // Health
    this.handler("health", async () => {
      return {
        status: "healthy",
        version: "1.0.0",
        sessions: this.sessions.size,
        activeTurns: Array.from(this.turns.values()).filter((t) => t.status === "running").length,
        timestamp: Date.now(),
      };
    });
  }

  handler(method: string, handler: AcpHandler): void {
    this.handlers.set(method, handler);
  }

  unregisterHandler(method: string): boolean {
    return this.handlers.delete(method);
  }

  async handleRequest(request: AcpRequestEnvelope): Promise<AcpResponseEnvelope> {
    const context: AcpServerContext = {
      requestId: String(request.id),
      timestamp: Date.now(),
    };

    try {
      const handler = this.handlers.get(request.method);
      if (!handler) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
        };
      }

      const result = await handler(request.params ?? {}, context);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private handleSessionCreate(params: AcpSessionCreateRequest): AcpSession {
    const id = params.sessionId ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const session: AcpSession = {
      id,
      name: params.name,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
    };

    this.sessions.set(id, session);
    return session;
  }

  private handleSessionClose(params: AcpSessionCloseRequest): { closed: boolean; sessionId: string } {
    const sessionId = params.sessionId;
    if (!this.sessions.has(sessionId)) {
      throw new AcpRuntimeError("NOT_FOUND", `Session not found: ${sessionId}`);
    }
    this.sessions.delete(sessionId);

    // 清理相关的回合和事件流
    for (const [turnId, turn] of this.turns) {
      if (turn.sessionId === sessionId) {
        this.turns.delete(turnId);
      }
    }
    this.eventStreams.delete(sessionId);

    return { closed: true, sessionId };
  }

  // Turn management
  createTurn(sessionId: string, metadata?: Record<string, unknown>): AcpTurn {
    const id = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const turn: AcpTurn = {
      id,
      sessionId,
      status: "pending",
      metadata,
    };
    this.turns.set(id, turn);
    return turn;
  }

  updateTurnStatus(turnId: string, status: AcpTurn["status"], error?: string): void {
    const turn = this.turns.get(turnId);
    if (!turn) return;

    turn.status = status;
    if (status === "running" && !turn.startedAt) {
      turn.startedAt = Date.now();
    }
    if ((status === "completed" || status === "failed" || status === "cancelled") && !turn.completedAt) {
      turn.completedAt = Date.now();
    }
    if (error) {
      turn.error = error;
    }
  }

  // Event stream management
  appendEvent(sessionId: string, event: AcpTurnEvent): void {
    let stream = this.eventStreams.get(sessionId);
    if (!stream) {
      stream = [];
      this.eventStreams.set(sessionId, stream);
    }
    stream.push({ event, timestamp: Date.now() });

    // 限制事件流大小
    if (stream.length > 10000) {
      stream.splice(0, stream.length - 10000);
    }
  }

  getEventStream(sessionId: string, fromIndex = 0): Array<{ event: AcpTurnEvent; timestamp: number }> {
    const stream = this.eventStreams.get(sessionId) ?? [];
    return stream.slice(fromIndex);
  }

  // Lifecycle
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[acp-server] ACP server started");
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log("[acp-server] ACP server stopped");
  }

  getStats(): {
    sessions: number;
    turns: number;
    activeTurns: number;
    eventStreams: number;
    handlers: number;
  } {
    return {
      sessions: this.sessions.size,
      turns: this.turns.size,
      activeTurns: Array.from(this.turns.values()).filter((t) => t.status === "running").length,
      eventStreams: this.eventStreams.size,
      handlers: this.handlers.size,
    };
  }

  clear(): void {
    this.stop();
    this.sessions.clear();
    this.turns.clear();
    this.eventStreams.clear();
    this.handlers.clear();
  }
}

const ACP_SERVER_INSTANCE = new AcpServer();

export function getAcpServer(): AcpServer {
  return ACP_SERVER_INSTANCE;
}

export function startAcpServer(): void {
  ACP_SERVER_INSTANCE.start();
}

export function stopAcpServer(): void {
  ACP_SERVER_INSTANCE.stop();
}

export async function handleAcpRequest(
  request: AcpRequestEnvelope,
): Promise<AcpResponseEnvelope> {
  return ACP_SERVER_INSTANCE.handleRequest(request);
}

export function resetAcpServerForTests(): void {
  ACP_SERVER_INSTANCE.clear();
}

export type { AcpServer };
