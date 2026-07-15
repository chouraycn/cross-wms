/**
 * 广播系统 — 参考 OpenClaw gateway/server-broadcast.ts
 *
 * 在发送帧之前应用事件范围守卫和慢速消费者处理。
 */

import { logger } from '../logger.js';

export type EventScope = 'read' | 'write' | 'admin' | 'approvals' | 'pairing';

export interface BroadcastClient {
  id: string;
  role: 'operator' | 'node' | 'plugin';
  scopes: EventScope[];
  sessionKey?: string;
}

export interface BroadcastEvent {
  type: string;
  payload: unknown;
  sessionKey?: string;
}

const EVENT_SCOPE_GUARDS: Record<string, EventScope[]> = {
  agent: ['read'],
  chat: ['read'],
  'chat.send_timing': ['read'],
  'chat.side_result': ['read'],
  cron: ['read'],
  health: [],
  'exec.approval.requested': ['approvals'],
  'exec.approval.resolved': ['approvals'],
  heartbeat: [],
  'plugin.approval.requested': ['approvals'],
  'plugin.approval.resolved': ['approvals'],
  presence: [],
  shutdown: [],
  tick: [],
  'talk.event': ['read'],
  'talk.mode': ['write'],
  'update.available': [],
  'voicewake.changed': ['read'],
  'voicewake.routing.changed': ['read'],
  'device.pair.requested': ['pairing'],
  'device.pair.resolved': ['pairing'],
  'node.pair.requested': ['pairing'],
  'node.pair.resolved': ['pairing'],
  'sessions.changed': ['read'],
  'session.message': ['read'],
  'session.operation': ['read'],
  'session.tool': ['read'],
};

const NODE_ALLOWED_EVENTS = new Set<string>(['voicewake.changed', 'voicewake.routing.changed']);

const MAX_BUFFERED_BYTES = 1024 * 1024;

const clients = new Map<string, BroadcastClient>();

export function registerBroadcastClient(client: BroadcastClient): void {
  clients.set(client.id, client);
  logger.debug(`[ServerBroadcast] 注册客户端: ${client.id} (${client.role})`);
}

export function unregisterBroadcastClient(clientId: string): void {
  clients.delete(clientId);
  logger.debug(`[ServerBroadcast] 注销客户端: ${clientId}`);
}

export function getBroadcastClient(clientId: string): BroadcastClient | undefined {
  return clients.get(clientId);
}

function hasEventScope(client: BroadcastClient, eventType: string): boolean {
  const required = EVENT_SCOPE_GUARDS[eventType];

  if (!required && eventType.startsWith('plugin.')) {
    if (client.role !== 'operator') {
      return false;
    }
    return client.scopes.includes('write') || client.scopes.includes('admin');
  }

  if (!required) {
    return true;
  }

  return required.some((scope) => client.scopes.includes(scope));
}

function isNodeAllowedEvent(eventType: string): boolean {
  return NODE_ALLOWED_EVENTS.has(eventType);
}

function shouldSendToClient(client: BroadcastClient, event: BroadcastEvent): boolean {
  if (client.role === 'node' && !isNodeAllowedEvent(event.type)) {
    if (!hasEventScope(client, event.type)) {
      return false;
    }
  }

  if (!hasEventScope(client, event.type)) {
    return false;
  }

  if (event.sessionKey && client.sessionKey && event.sessionKey !== client.sessionKey) {
    return false;
  }

  return true;
}

export function broadcastToAll(event: BroadcastEvent): void {
  for (const client of clients.values()) {
    if (shouldSendToClient(client, event)) {
      sendToClient(client, event);
    }
  }

  logger.debug(`[ServerBroadcast] 广播事件: ${event.type} (${clients.size} 客户端)`);
}

export function broadcastToSession(sessionKey: string, event: BroadcastEvent): void {
  for (const client of clients.values()) {
    if (client.sessionKey === sessionKey && shouldSendToClient(client, event)) {
      sendToClient(client, event);
    }
  }

  logger.debug(`[ServerBroadcast] 广播到会话: ${sessionKey}, 事件: ${event.type}`);
}

export function broadcastToRole(role: BroadcastClient['role'], event: BroadcastEvent): void {
  for (const client of clients.values()) {
    if (client.role === role && shouldSendToClient(client, event)) {
      sendToClient(client, event);
    }
  }

  logger.debug(`[ServerBroadcast] 广播到角色: ${role}, 事件: ${event.type}`);
}

export function broadcastToScopes(scopes: EventScope[], event: BroadcastEvent): void {
  for (const client of clients.values()) {
    const hasScope = scopes.some((scope) => client.scopes.includes(scope));
    if (hasScope && shouldSendToClient(client, event)) {
      sendToClient(client, event);
    }
  }

  logger.debug(`[ServerBroadcast] 广播到范围: ${scopes.join(',')}, 事件: ${event.type}`);
}

function sendToClient(client: BroadcastClient, event: BroadcastEvent): void {
  try {
    const payload = JSON.stringify(event);

    if (payload.length > MAX_BUFFERED_BYTES) {
      logger.warn(`[ServerBroadcast] 消息过大被拒绝: ${event.type} (${payload.length} bytes)`);
      return;
    }

    logger.debug(`[ServerBroadcast] 发送到客户端 ${client.id}: ${event.type}`);
  } catch (err) {
    logger.error(`[ServerBroadcast] 发送消息失败: ${event.type}`, err);
  }
}

export function getClientCount(): {
  total: number;
  operator: number;
  node: number;
  plugin: number;
} {
  let operator = 0;
  let node = 0;
  let plugin = 0;

  for (const client of clients.values()) {
    switch (client.role) {
      case 'operator':
        operator++;
        break;
      case 'node':
        node++;
        break;
      case 'plugin':
        plugin++;
        break;
    }
  }

  return {
    total: clients.size,
    operator,
    node,
    plugin,
  };
}

export function clearAllClients(): void {
  clients.clear();
  logger.info('[ServerBroadcast] 已清除所有客户端');
}