/**
 * Webhook Listen Service — 临时 HTTP 服务器
 *
 * v3.0: 创建临时 HTTP 服务器监听指定端口，
 * 接收外部 webhook 请求，供 AI 轮询获取。
 * TTL 机制: 默认 60s 后自动关闭。
 */

import http from 'http';
import { v4 as uuidv4 } from 'uuid';

// ===================== Types =====================

export interface WebhookRequest {
  timestamp: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  path: string;
  query: Record<string, string>;
}

interface WebhookSession {
  id: string;
  port: number;
  server: http.Server;
  requests: WebhookRequest[];
  ttl: number; // ms
  createdAt: number;
  timer: NodeJS.Timeout;
}

// ===================== Active Webhooks Registry =====================

const activeWebhooks = new Map<string, WebhookSession>();

// ===================== Public Functions =====================

/**
 * 启动一个临时 Webhook 监听服务器。
 *
 * @param port 监听端口（0 = 随机可用端口）
 * @param path 监听路径（默认 /webhook）
 * @param ttlMs TTL 毫秒数（默认 60000 = 60s）
 * @returns { id, port, url } — 服务器信息
 */
export async function startWebhookListen(
  port: number = 0,
  path: string = '/webhook',
  ttlMs: number = 60000,
): Promise<{ id: string; port: number; url: string }> {
  const id = uuidv4();

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // 先检查请求路径是否匹配 webhookPath
      const urlObj = new URL(req.url || '/', `http://localhost`);
      if (!urlObj.pathname.startsWith(path)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // 收集请求体
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        // 解析 headers
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(', ');
          }
        }

        // 解析 query 参数
        const query: Record<string, string> = {};
        for (const [key, value] of urlObj.searchParams.entries()) {
          query[key] = value;
        }

        // 存储请求
        const session = activeWebhooks.get(id);
        if (session) {
          session.requests.push({
            timestamp: new Date().toISOString(),
            method: req.method || 'GET',
            headers,
            body,
            path: urlObj.pathname,
            query,
          });
        }

        // 返回 200 OK
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Webhook received' }));
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(`Webhook 服务器启动失败: ${err.message}`));
    });

    server.listen(port, '0.0.0.0', () => {
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' ? addr.port : port;

      // 设置 TTL 定时器
      const timer = setTimeout(() => {
        stopWebhookListen(id);
      }, ttlMs);

      const session: WebhookSession = {
        id,
        port: actualPort,
        server,
        requests: [],
        ttl: ttlMs,
        createdAt: Date.now(),
        timer,
      };

      activeWebhooks.set(id, session);

      resolve({
        id,
        port: actualPort,
        url: `http://localhost:${actualPort}${path}`,
      });
    });
  });
}

/**
 * 获取指定 Webhook 会话收到的所有请求。
 *
 * @param id Webhook 会话 ID
 * @returns 请求列表，或 null（会话不存在）
 */
export function getWebhookRequests(id: string): WebhookRequest[] | null {
  const session = activeWebhooks.get(id);
  if (!session) return null;
  return [...session.requests];
}

/**
 * 停止指定 Webhook 监听服务器。
 *
 * @param id Webhook 会话 ID
 * @returns 是否成功停止
 */
export function stopWebhookListen(id: string): boolean {
  const session = activeWebhooks.get(id);
  if (!session) return false;

  clearTimeout(session.timer);

  return new Promise<boolean>((resolve) => {
    session.server.close(() => {
      activeWebhooks.delete(id);
      resolve(true);
    });
    // 如果服务器没有活跃连接，close 会立即完成
    // 否则给 2 秒超时强制关闭
    setTimeout(() => {
      activeWebhooks.delete(id);
      resolve(true);
    }, 2000);
  }) as unknown as boolean; // 同步返回，异步关闭
}

/**
 * 停止所有 Webhook 监听服务器。
 */
export function stopAllWebhooks(): void {
  for (const [id] of activeWebhooks) {
    stopWebhookListen(id);
  }
}

/**
 * 获取所有活跃的 Webhook 会话 ID。
 */
export function listActiveWebhooks(): string[] {
  return Array.from(activeWebhooks.keys());
}
