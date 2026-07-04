/**
 * HttpBackend — TUI 远程后端
 *
 * 通过 HTTP/SSE 连接到运行中的 Cross-WMS 服务（chatService 路由）。
 * 适用于 TUI 作为客户端、服务在另一台机器或容器内运行的场景。
 *
 * 特性：
 * - 会话管理走 /api/sessions REST
 * - 消息发送走 /api/agent-chat SSE 流式响应
 * - 自动重连与错误重试
 * - 支持 abort 取消正在进行的请求
 */

import type { TuiBackend, ChatEvent, SessionInfo } from './types.js';
import { logger } from '../logger.js';

export interface HttpBackendOptions {
  /** 服务基础 URL，如 http://127.0.0.1:3001 */
  baseUrl: string;
  /** 请求超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 用户标识（透传到后端） */
  userId?: string;
  /** 额外 HTTP 头 */
  headers?: Record<string, string>;
}

interface HttpSession {
  id: string;
  title: string;
  createdAt: string | number;
  updatedAt: string | number;
  messageCount?: number;
}

interface HttpMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts?: number;
}

export class HttpBackend implements TuiBackend {
  private abortController: AbortController | null = null;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly userId?: string;
  private readonly headers: Record<string, string>;

  constructor(options: HttpBackendOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.userId = options.userId;
    this.headers = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
  }

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...this.headers, ...(init.headers ?? {}) },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
      }

      // 204 No Content
      if (res.status === 204) return undefined as T;

      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        return (await res.text()) as unknown as T;
      }

      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`请求超时 (${this.timeoutMs}ms): ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async *sendChat(
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal,
  ): AsyncIterable<ChatEvent> {
    this.abortController = new AbortController();
    if (signal) {
      if (signal.aborted) {
        this.abortController.abort();
      } else {
        signal.addEventListener('abort', () => this.abortController?.abort(), { once: true });
      }
    }

    const lastMessage = messages[messages.length - 1];
    const sessionId = (lastMessage as any)?.sessionId;

    yield { type: 'assistant_start' };

    let buffer = '';
    let pendingEvents: ChatEvent[] = [];

    try {
      const res = await fetch(`${this.baseUrl}/api/agent-chat`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          sessionId,
          message: lastMessage?.content ?? '',
          messages: messages,
          ...(this.userId ? { userId: this.userId } : {}),
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        yield {
          type: 'error',
          error: `连接服务端失败: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
        };
        this.abortController = null;
        return;
      }

      // 读取 SSE 流
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();

      // 事件类型与字段映射
      // event: text\ndata: {"content":"..."}
      // event: thinking\ndata: {"content":"..."}
      // event: tool_call\ndata: {"toolName":"...","toolArgs":{...},"toolResult":"..."}
      // event: done\ndata: {...}
      // event: error\ndata: {"message":"..."}
      let currentEvent = '';
      let currentDataLines: string[] = [];

      const flushEvent = (): void => {
        if (!currentEvent && currentDataLines.length === 0) return;
        const data = currentDataLines.join('\n');
        currentEvent = '';
        currentDataLines = [];

        if (data === '[DONE]') return;

        let payload: any = {};
        try {
          payload = data ? JSON.parse(data) : {};
        } catch {
          payload = { content: data };
        }

        const ev = currentEvent || payload.type || '';
        const content = payload.content ?? payload.text ?? payload.delta ?? '';

        switch (ev) {
          case 'init':
          case 'assistant_start':
            pendingEvents.push({ type: 'assistant_start' });
            break;
          case 'text':
          case 'assistant_chunk':
            if (content) pendingEvents.push({ type: 'assistant_chunk', content });
            break;
          case 'thinking':
          case 'thinking.start':
          case 'thinking.delta':
            if (content) pendingEvents.push({ type: 'thinking', content });
            break;
          case 'tool_call':
            pendingEvents.push({
              type: 'tool_call',
              toolName: payload.toolName ?? payload.name,
              toolArgs: payload.toolArgs ?? payload.arguments,
              toolResult: payload.toolResult,
            });
            break;
          case 'tool_result':
            pendingEvents.push({
              type: 'tool_result',
              toolName: payload.toolName ?? payload.name,
              toolResult: payload.toolResult ?? payload.result,
            });
            break;
          case 'done':
          case 'assistant_end':
            pendingEvents.push({ type: 'assistant_end' });
            break;
          case 'error':
            pendingEvents.push({ type: 'error', error: payload.message ?? payload.error ?? '未知错误' });
            break;
          default:
            // 未知事件，忽略
            break;
        }
      };

      while (true) {
        if (this.abortController?.signal.aborted) break;

        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按 \n 切行
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          if (!line) {
            // 空行表示一个事件结束
            flushEvent();
            continue;
          }
          if (line.startsWith(':')) continue; // 注释

          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentDataLines.push(line.slice(5).trim());
          } else if (line.startsWith('id:')) {
            // ignore
          }
        }

        // 刷出已解析的事件
        if (pendingEvents.length > 0) {
          for (const ev of pendingEvents) yield ev;
          pendingEvents = [];
        }
      }

      // 处理剩余 buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
          else if (line.startsWith('data:')) currentDataLines.push(line.slice(5).trim());
        }
        flushEvent();
      }

      if (pendingEvents.length > 0) {
        for (const ev of pendingEvents) yield ev;
        pendingEvents = [];
      }

      // 兜底：若服务端未发 assistant_end，补一个
      yield { type: 'assistant_end' };
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        return;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[TUI HttpBackend] 发送消息失败: ${errMsg}`);
      yield { type: 'error', error: `网络错误: ${errMsg}` };
    } finally {
      this.abortController = null;
    }
  }

  abortChat(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async loadHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    try {
      const data = await this.fetchJson<{ messages?: HttpMessage[] }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      );
      const messages = data.messages ?? [];
      return messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content ?? '' }));
    } catch (err) {
      logger.warn(`[TUI HttpBackend] 加载历史失败: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const data = await this.fetchJson<{ sessions?: HttpSession[] }>(`/api/sessions`);
      const sessions = data.sessions ?? [];
      return sessions.map((s) => ({
        id: s.id,
        title: s.title || '新对话',
        createdAt: this.parseDate(s.createdAt),
        updatedAt: this.parseDate(s.updatedAt),
        messageCount: s.messageCount ?? 0,
      }));
    } catch (err) {
      logger.warn(`[TUI HttpBackend] 列出会话失败: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async createSession(title?: string): Promise<SessionInfo> {
    const data = await this.fetchJson<HttpSession>(`/api/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title: title || `会话 ${new Date().toLocaleString()}` }),
    });
    return {
      id: data.id,
      title: data.title,
      createdAt: this.parseDate(data.createdAt),
      updatedAt: this.parseDate(data.updatedAt),
      messageCount: 0,
    };
  }

  async deleteSession(id: string): Promise<void> {
    await this.fetchJson<void>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  private parseDate(value: string | number | undefined | null): number {
    if (!value) return Date.now();
    if (typeof value === 'number') return value;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? Date.now() : ts;
  }
}
