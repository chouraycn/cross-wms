/**
 * C3 WebSocket Hub 真实挂载测试
 *
 * 验证 webSocketHub.startGatewayWebSocket() 能真正挂在 httpServer 上，
 * 客户端连上 /gateway/ws 后能收到 hub 下发的 connected 事件。
 * 这是「WebSocket Hub 挂 httpServer」这条接入的端到端验证。
 *
 * 注意：ws 包已安装（node_modules/ws），hub 会真正创建 WebSocketServer。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { startGatewayWebSocket, stopGatewayWebSocket } from '../../server/gateway/webSocketHub.js';

const TEST_PORT = 4123;

describe('C3 WebSocket Hub 挂载 httpServer', () => {
  let server: Server | null = null;

  afterEach(() => {
    try {
      stopGatewayWebSocket();
    } catch {
      /* ignore */
    }
    if (server) {
      server.close();
      server = null;
    }
  });

  it('应能在 httpServer 上启动并响应客户端连接事件', async () => {
    server = createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });

    await new Promise<void>((resolve) => server!.listen(TEST_PORT, resolve));

    // 挂载 WS hub（同 index.ts 的接入方式）
    await startGatewayWebSocket(server!);

    // 客户端连接并等待 connected 事件
    const connected = await new Promise<boolean>((resolve) => {
      const client = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/gateway/ws`);
      const timer = setTimeout(() => resolve(false), 4000);
      client.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'event' && msg.event === 'connected') {
            clearTimeout(timer);
            client.close();
            resolve(true);
          }
        } catch {
          /* ignore parse errors */
        }
      });
      client.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });

    expect(connected).toBe(true);
  }, 10000);
});
