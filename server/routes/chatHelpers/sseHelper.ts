import { messageQueue, type QueueEvent } from '../../engine/messageQueue.js';

// v7.0: 消息队列事件监听 — 将队列状态变化推送到活跃 SSE 连接
interface SSEConnection {
  res: import('express').Response;
  assistantMessageId: string;
  /** 连接创建时间戳 */
  createdAt: number;
  /** 最后活动时间戳（每次写入更新） */
  lastActivityAt: number;
}
const activeSSEConnections = new Map<string, SSEConnection>();

/** SSE 连接最大空闲时间（5 分钟），超时后强制关闭 */
const SSE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/** 每分钟扫描一次超时连接 */
const SSE_CLEANUP_INTERVAL_MS = 60 * 1000;

// 定时清理超时的 SSE 连接
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, conn] of activeSSEConnections) {
    const idleMs = now - conn.lastActivityAt;
    if (idleMs > SSE_IDLE_TIMEOUT_MS) {
      try {
        if (!conn.res.writableEnded) {
          conn.res.write(`data: ${JSON.stringify({
            type: 'done',
            errorCode: 'SSE_TIMEOUT',
            errorMessage: '连接超时，请重新发送消息',
          })}\n\n`);
          conn.res.end();
        }
      } catch {
        // 忽略关闭错误
      }
      activeSSEConnections.delete(sessionId);
    }
  }
}, SSE_CLEANUP_INTERVAL_MS).unref();

messageQueue.on('queue', (event: QueueEvent) => {
  // 将队列事件转发到对应的 SSE 连接
  const conn = activeSSEConnections.get(event.sessionId);
  if (conn && !conn.res.writableEnded) {
    try {
      conn.res.write(`data: ${JSON.stringify({
        ...event,
        type: 'queue_event',
      })}\n\n`);
      conn.lastActivityAt = Date.now();
    } catch {
      // SSE 连接可能已关闭
      activeSSEConnections.delete(event.sessionId);
    }
  }
});

function sendSSEEvent(res: import('express').Response, type: string, data: Record<string, unknown>): void {
  if (!res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      // 更新对应连接的最后活动时间
      for (const conn of activeSSEConnections.values()) {
        if (conn.res === res) {
          conn.lastActivityAt = Date.now();
          break;
        }
      }
    } catch {
      // SSE 连接可能已关闭
    }
  }
}

function sendDoneEvent(res: import('express').Response, content?: Record<string, unknown>): void {
  if (!res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'done',
        errorCode: null,
        errorMessage: null,
        ...content,
      })}\n\n`);
    } catch {
      // SSE 连接可能已关闭
    }
  }
}

function sendErrorEvent(res: import('express').Response, errorCode: string, errorMessage: string): void {
  if (!res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'done',
        errorCode,
        errorMessage,
        thinkingDuration: 0,
      })}\n\n`);
    } catch {
      // SSE 连接可能已关闭
    }
  }
}

export { activeSSEConnections, sendSSEEvent, sendDoneEvent, sendErrorEvent };
