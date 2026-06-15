/**
 * Webhook Tools — 注册 3 个 webhook_* 工具到 toolRegistry
 *
 * v3.0: Webhook 监听/轮询/停止工具
 * - web_hook_listen — 启动临时 HTTP 服务器监听 webhook
 * - web_hook_poll   — 轮询获取已收到的 webhook 请求
 * - web_hook_stop   — 停止 webhook 监听
 */

import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolRegistry.js';
import {
  startWebhookListen,
  getWebhookRequests,
  stopWebhookListen,
} from '../services/webhookListen.js';

// ===================== Tool Definitions =====================

const webhookListenDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_hook_listen',
    description: '启动一个临时 HTTP 服务器来监听外部 webhook 回调请求。返回监听 URL 和 session ID。服务器默认 60 秒后自动关闭。使用 web_hook_poll 获取收到的请求。',
    parameters: {
      type: 'object',
      properties: {
        port: {
          type: 'number',
          description: '监听端口（0 = 随机可用端口，默认 0）',
          default: 0,
        },
        path: {
          type: 'string',
          description: '监听路径（默认 /webhook）',
          default: '/webhook',
        },
        ttl: {
          type: 'number',
          description: '超时时间（毫秒，默认 60000 = 60秒）',
          default: 60000,
        },
      },
      required: [],
    },
  },
};

const webhookPollDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_hook_poll',
    description: '轮询获取指定 webhook 会话已收到的请求列表。返回请求的时间戳、方法、headers、body 等信息。',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'web_hook_listen 返回的 session ID',
        },
      },
      required: ['id'],
    },
  },
};

const webhookStopDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_hook_stop',
    description: '停止指定的 webhook 监听服务器。通常在不再需要接收回调时调用，或让 TTL 自动关闭。',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'web_hook_listen 返回的 session ID',
        },
      },
      required: ['id'],
    },
  },
};

// ===================== Tool Handlers =====================

async function handleWebhookListen(args: Record<string, unknown>): Promise<string> {
  try {
    const port = typeof args.port === 'number' ? args.port : 0;
    const path = typeof args.path === 'string' ? args.path : '/webhook';
    const ttl = typeof args.ttl === 'number' ? args.ttl : 60000;

    // 限制 TTL 在 5s ~ 300s 之间
    const clampedTtl = Math.min(Math.max(ttl, 5000), 300000);

    const result = await startWebhookListen(port, path, clampedTtl);
    return JSON.stringify({
      success: true,
      sessionId: result.id,
      port: result.port,
      url: result.url,
      ttl: clampedTtl,
      message: `Webhook 监听已启动，URL: ${result.url}，将在 ${clampedTtl / 1000} 秒后自动关闭`,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: `Webhook 监听启动失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function handleWebhookPoll(args: Record<string, unknown>): Promise<string> {
  try {
    const id = String(args.id || '').trim();
    if (!id) {
      return JSON.stringify({ success: false, error: 'id 参数不能为空' });
    }

    const requests = getWebhookRequests(id);
    if (requests === null) {
      return JSON.stringify({
        success: false,
        error: `Webhook 会话不存在或已过期: ${id}`,
      });
    }

    return JSON.stringify({
      success: true,
      sessionId: id,
      requestCount: requests.length,
      requests,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: `轮询 Webhook 请求失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function handleWebhookStop(args: Record<string, unknown>): Promise<string> {
  try {
    const id = String(args.id || '').trim();
    if (!id) {
      return JSON.stringify({ success: false, error: 'id 参数不能为空' });
    }

    const stopped = stopWebhookListen(id);
    if (!stopped) {
      return JSON.stringify({
        success: false,
        error: `Webhook 会话不存在: ${id}`,
      });
    }

    return JSON.stringify({
      success: true,
      sessionId: id,
      message: `Webhook 监听已停止: ${id}`,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: `停止 Webhook 监听失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ===================== Export Helpers =====================

/** 获取所有 Webhook 工具定义 */
export function getWebhookToolDefinitions(): ToolDefinition[] {
  return [webhookListenDef, webhookPollDef, webhookStopDef];
}

/** 获取所有 Webhook 工具 handler 映射 */
export function getWebhookToolHandlers(): Map<string, ToolHandler> {
  const map = new Map<string, ToolHandler>();
  map.set('web_hook_listen', handleWebhookListen);
  map.set('web_hook_poll', handleWebhookPoll);
  map.set('web_hook_stop', handleWebhookStop);
  return map;
}

/** Webhook 工具风险等级 */
export const WEBHOOK_TOOL_RISK_LEVELS: Record<string, string> = {
  web_hook_listen: 'confirm',
  web_hook_poll: 'auto',
  web_hook_stop: 'auto',
};
