/**
 * Streaming Handler
 * 流式响应处理器 - SSE / WebSocket 流式输出
 */

export type StreamEventType =
  | "message.start"
  | "message.delta"
  | "message.complete"
  | "message.error"
  | "tool.call.started"
  | "tool.call.delta"
  | "tool.call.completed"
  | "tool.call.failed"
  | "thinking.start"
  | "thinking.delta"
  | "thinking.complete"
  | "turn.started"
  | "turn.completed"
  | "turn.failed"
  | "heartbeat"
  | "custom";

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  timestamp: number;
  data: Record<string, unknown>;
  runId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface StreamMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    content: string;
  }>;
  thinking?: string;
  metadata?: Record<string, unknown>;
}

export interface StreamSession {
  id: string;
  sessionId: string;
  runId?: string;
  status: "connecting" | "active" | "paused" | "completed" | "error" | "cancelled";
  startedAt: number;
  endedAt?: number;
  events: StreamEvent[];
  messageBuffer: string;
  thinkingBuffer: string;
  toolCallBuffer: Map<string, { name: string; arguments: string }>;
  eventCount: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface StreamSubscriber {
  id: string;
  sessionId: string;
  createdAt: number;
  lastEventId?: string;
  active: boolean;
}

type EventHandler = (event: StreamEvent) => void;
type SessionEventHandler = (session: StreamSession) => void;

class StreamingHandler {
  private readonly sessions = new Map<string, StreamSession>();
  private readonly subscribers = new Map<string, Set<string>>();
  private readonly eventHandlers = new Map<StreamEventType, Set<EventHandler>>();
  private readonly sessionHandlers = new Set<SessionEventHandler>();
  private heartbeatIntervalMs = 30000;
  private maxBufferSize = 1000;

  constructor() {
    // 空构造函数
  }

  // ========== Session Management ==========

  createSession(sessionId: string, runId?: string, metadata?: Record<string, unknown>): StreamSession {
    const id = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const session: StreamSession = {
      id,
      sessionId,
      runId,
      status: "connecting",
      startedAt: now,
      events: [],
      messageBuffer: "",
      thinkingBuffer: "",
      toolCallBuffer: new Map(),
      eventCount: 0,
      metadata,
    };

    this.sessions.set(id, session);

    return session;
  }

  startSession(streamId: string): StreamSession | undefined {
    const session = this.sessions.get(streamId);
    if (!session) return undefined;

    session.status = "active";
    this.sessions.set(streamId, session);
    this.emitSessionEvent(session);

    // 发送消息开始事件
    this.sendEvent(streamId, "message.start", { role: "assistant" });

    return session;
  }

  endSession(streamId: string, reason: "complete" | "error" | "cancel" = "complete", error?: string): boolean {
    const session = this.sessions.get(streamId);
    if (!session) return false;

    session.endedAt = Date.now();
    session.status = reason === "complete" ? "completed" : reason === "error" ? "error" : "cancelled";
    if (error) session.errorMessage = error;

    // 发送完成/错误事件
    if (reason === "complete") {
      this.sendEvent(streamId, "message.complete", {
        content: session.messageBuffer,
        thinking: session.thinkingBuffer || undefined,
      });
    } else if (reason === "error") {
      this.sendEvent(streamId, "message.error", { error: error ?? "Unknown error" });
    }

    this.sessions.set(streamId, session);
    this.emitSessionEvent(session);
    return true;
  }

  getSession(streamId: string): StreamSession | undefined {
    return this.sessions.get(streamId);
  }

  listSessions(sessionId?: string): StreamSession[] {
    let sessions = Array.from(this.sessions.values());
    if (sessionId) {
      sessions = sessions.filter((s) => s.sessionId === sessionId);
    }
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  }

  cancelSession(streamId: string): boolean {
    const session = this.sessions.get(streamId);
    if (!session) return false;
    if (session.status === "completed" || session.status === "cancelled") return true;

    session.status = "cancelled";
    session.endedAt = Date.now();
    this.sessions.set(streamId, session);
    this.emitSessionEvent(session);

    return true;
  }

  // ========== Event Sending ==========

  sendEvent(streamId: string, type: StreamEventType, data: Record<string, unknown>): StreamEvent | null {
    const session = this.sessions.get(streamId);
    if (!session) return null;

    const event: StreamEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      timestamp: Date.now(),
      data,
      runId: session.runId,
      sessionId: session.sessionId,
    };

    // 更新缓冲区
    this.updateBuffers(session, event);

    // 存储事件
    session.events.push(event);
    session.eventCount++;
    if (session.events.length > this.maxBufferSize) {
      session.events = session.events.slice(-this.maxBufferSize);
    }

    this.sessions.set(streamId, session);

    // 通知订阅者
    this.notifySubscribers(streamId, event);

    // 调用全局处理器
    this.emitEvent(event);

    return event;
  }

  private updateBuffers(session: StreamSession, event: StreamEvent): void {
    switch (event.type) {
      case "message.delta":
        if (typeof event.data.content === "string") {
          session.messageBuffer += event.data.content;
        }
        break;
      case "thinking.delta":
        if (typeof event.data.content === "string") {
          session.thinkingBuffer += event.data.content;
        }
        break;
      case "tool.call.delta": {
        const toolCallId = event.data.id as string;
        if (toolCallId) {
          const existing = session.toolCallBuffer.get(toolCallId);
          if (existing && typeof event.data.delta === "string") {
            existing.arguments += event.data.delta;
            session.toolCallBuffer.set(toolCallId, existing);
          }
        }
        break;
      }
      case "tool.call.started": {
        const toolCallId = event.data.id as string;
        const name = event.data.name as string;
        if (toolCallId) {
          session.toolCallBuffer.set(toolCallId, { name: name ?? "", arguments: "" });
        }
        break;
      }
    }
  }

  // ========== Convenience Methods ==========

  sendMessageDelta(streamId: string, content: string): StreamEvent | null {
    return this.sendEvent(streamId, "message.delta", { content });
  }

  sendThinkingDelta(streamId: string, content: string): StreamEvent | null {
    return this.sendEvent(streamId, "thinking.delta", { content });
  }

  sendToolCallStart(streamId: string, toolCallId: string, toolName: string): StreamEvent | null {
    return this.sendEvent(streamId, "tool.call.started", { id: toolCallId, name: toolName });
  }

  sendToolCallDelta(streamId: string, toolCallId: string, delta: string): StreamEvent | null {
    return this.sendEvent(streamId, "tool.call.delta", { id: toolCallId, delta });
  }

  sendToolCallComplete(streamId: string, toolCallId: string, result: string): StreamEvent | null {
    return this.sendEvent(streamId, "tool.call.completed", { id: toolCallId, result });
  }

  sendToolCallFailed(streamId: string, toolCallId: string, error: string): StreamEvent | null {
    return this.sendEvent(streamId, "tool.call.failed", { id: toolCallId, error });
  }

  sendHeartbeat(streamId: string): StreamEvent | null {
    return this.sendEvent(streamId, "heartbeat", { seq: Date.now() });
  }

  sendTurnStart(streamId: string, model: string): StreamEvent | null {
    return this.sendEvent(streamId, "turn.started", { model });
  }

  sendTurnComplete(streamId: string, stats: Record<string, unknown>): StreamEvent | null {
    return this.sendEvent(streamId, "turn.completed", stats);
  }

  sendTurnFailed(streamId: string, error: string): StreamEvent | null {
    return this.sendEvent(streamId, "turn.failed", { error });
  }

  // ========== Subscription ==========

  subscribe(streamId: string, handler: EventHandler): string {
    const subscriberId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    let subscribers = this.subscribers.get(streamId);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(streamId, subscribers);
    }

    // 存储处理器（使用 id 映射）
    this.handlerCache.set(subscriberId, handler);
    subscribers.add(subscriberId);

    return subscriberId;
  }

  private handlerCache = new Map<string, EventHandler>();

  unsubscribe(subscriberId: string): boolean {
    for (const [streamId, subscribers] of this.subscribers) {
      if (subscribers.has(subscriberId)) {
        subscribers.delete(subscriberId);
        this.handlerCache.delete(subscriberId);
        return true;
      }
    }
    return false;
  }

  private notifySubscribers(streamId: string, event: StreamEvent): void {
    const subscribers = this.subscribers.get(streamId);
    if (!subscribers) return;

    for (const subscriberId of subscribers) {
      const handler = this.handlerCache.get(subscriberId);
      if (handler) {
        try {
          handler(event);
        } catch (e) {
          console.error("[stream] Subscriber error:", e);
        }
      }
    }
  }

  // ========== Global Event Handlers ==========

  on(type: StreamEventType, handler: EventHandler): () => void {
    let handlers = this.eventHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(type, handlers);
    }

    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
    };
  }

  onSessionUpdate(handler: SessionEventHandler): () => void {
    this.sessionHandlers.add(handler);
    return () => {
      this.sessionHandlers.delete(handler);
    };
  }

  private emitEvent(event: StreamEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (e) {
          console.error("[stream] Event handler error:", e);
        }
      }
    }
  }

  private emitSessionEvent(session: StreamSession): void {
    for (const handler of this.sessionHandlers) {
      try {
        handler(session);
      } catch (e) {
        console.error("[stream] Session handler error:", e);
      }
    }
  }

  // ========== SSE Format ==========

  formatSseEvent(event: StreamEvent): string {
    const lines: string[] = [];
    lines.push(`id: ${event.id}`);
    lines.push(`event: ${event.type}`);
    lines.push(`data: ${JSON.stringify(event.data)}`);
    lines.push("");
    return lines.join("\n");
  }

  formatSseHeartbeat(): string {
    return ": heartbeat\n\n";
  }

  // ========== Stats ==========

  getStats(): {
    activeSessions: number;
    totalSessions: number;
    completedSessions: number;
    errorSessions: number;
    cancelledSessions: number;
    totalEvents: number;
    activeSubscribers: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const totalSubs = Array.from(this.subscribers.values()).reduce((sum, s) => sum + s.size, 0);

    return {
      activeSessions: sessions.filter((s) => s.status === "active").length,
      totalSessions: sessions.length,
      completedSessions: sessions.filter((s) => s.status === "completed").length,
      errorSessions: sessions.filter((s) => s.status === "error").length,
      cancelledSessions: sessions.filter((s) => s.status === "cancelled").length,
      totalEvents: sessions.reduce((sum, s) => sum + s.eventCount, 0),
      activeSubscribers: totalSubs,
    };
  }

  clear(): void {
    this.sessions.clear();
    this.subscribers.clear();
    this.handlerCache.clear();
    this.eventHandlers.clear();
    this.sessionHandlers.clear();
  }
}

const STREAMING_INSTANCE = new StreamingHandler();

export function getStreamingHandler(): StreamingHandler {
  return STREAMING_INSTANCE;
}

export function createStreamSession(
  sessionId: string,
  runId?: string,
  metadata?: Record<string, unknown>,
): StreamSession {
  return STREAMING_INSTANCE.createSession(sessionId, runId, metadata);
}

export function sendStreamEvent(
  streamId: string,
  type: StreamEventType,
  data: Record<string, unknown>,
): StreamEvent | null {
  return STREAMING_INSTANCE.sendEvent(streamId, type, data);
}

export function resetStreamingHandlerForTests(): void {
  STREAMING_INSTANCE.clear();
}

export type { StreamingHandler };
