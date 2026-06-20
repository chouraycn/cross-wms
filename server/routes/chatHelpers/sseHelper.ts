import { messageQueue, type QueueEvent } from '../../engine/messageQueue.js';

// v7.0: 消息队列事件监听 — 将队列状态变化推送到活跃 SSE 连接
const activeSSEConnections = new Map<string, { res: import('express').Response; assistantMessageId: string }>();

messageQueue.on('queue', (event: QueueEvent) => {
  // 将队列事件转发到对应的 SSE 连接
  const conn = activeSSEConnections.get(event.sessionId);
  if (conn && !conn.res.writableEnded) {
    try {
      conn.res.write(`data: ${JSON.stringify({
        ...event,
        type: 'queue_event',
      })}\n\n`);
    } catch {
      // SSE 连接可能已关闭
    }
  }
});

function sendSSEEvent(res: import('express').Response, type: string, data: Record<string, unknown>): void {
  if (!res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
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
