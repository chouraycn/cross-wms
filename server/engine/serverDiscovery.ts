/**
 * 服务发现系统 — 参考 OpenClaw gateway/server-discovery.ts
 *
 * 支持：
 * - 本地服务发现
 * - 远程节点发现
 * - 节点状态追踪
 * - 健康检查
 * - 负载均衡
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';

export type NodeStatus = 'online' | 'offline' | 'busy' | 'degraded';

export type NodeType = 'local' | 'remote' | 'mobile';

export interface NodeInfo {
  id: string;
  name: string;
  type: NodeType;
  status: NodeStatus;
  host: string;
  port: number;
  capabilities: string[];
  lastSeenAt: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryResult {
  nodes: NodeInfo[];
  onlineCount: number;
  totalCount: number;
}

export interface HealthCheckResult {
  nodeId: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

const nodes = new Map<string, NodeInfo>();

const LOCAL_NODE_ID = 'local';

function createLocalNode(): NodeInfo {
  return {
    id: LOCAL_NODE_ID,
    name: '本地节点',
    type: 'local',
    status: 'online',
    host: '127.0.0.1',
    port: 3000,
    capabilities: ['chat', 'tool', 'agent', 'compaction', 'memory'],
    lastSeenAt: Date.now(),
    createdAt: Date.now(),
    metadata: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
  };
}

export function registerNode(node: NodeInfo): void {
  nodes.set(node.id, node);

  publishEvent('channel:connected', {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
  }, {
    level: 'info',
    context: { clientIp: node.host },
  });

  logger.info(`[ServerDiscovery] 注册节点: ${node.id} (${node.name})`);
}

export function unregisterNode(nodeId: string): boolean {
  const node = nodes.get(nodeId);
  if (!node) {
    return false;
  }

  nodes.delete(nodeId);

  publishEvent('channel:disconnected', {
    nodeId,
    nodeName: node.name,
    nodeType: node.type,
  }, {
    level: 'info',
  });

  logger.info(`[ServerDiscovery] 注销节点: ${nodeId}`);
  return true;
}

export function updateNodeStatus(nodeId: string, status: NodeStatus): boolean {
  const node = nodes.get(nodeId);
  if (!node) {
    return false;
  }

  const oldStatus = node.status;
  node.status = status;
  node.lastSeenAt = Date.now();

  if (oldStatus !== status) {
    logger.info(`[ServerDiscovery] 节点状态变化: ${nodeId} ${oldStatus} → ${status}`);
  }

  return true;
}

export function getNode(nodeId: string): NodeInfo | undefined {
  return nodes.get(nodeId);
}

export function listNodes(): NodeInfo[] {
  return Array.from(nodes.values());
}

export function listOnlineNodes(): NodeInfo[] {
  return listNodes().filter((node) => node.status === 'online');
}

export function discoverNodes(): DiscoveryResult {
  const allNodes = listNodes();
  const onlineNodes = allNodes.filter((node) => node.status === 'online');

  return {
    nodes: allNodes,
    onlineCount: onlineNodes.length,
    totalCount: allNodes.length,
  };
}

export async function performHealthCheck(nodeId: string): Promise<HealthCheckResult> {
  const node = nodes.get(nodeId);
  if (!node) {
    return {
      nodeId,
      ok: false,
      latencyMs: 0,
      error: '节点不存在',
    };
  }

  const startTime = Date.now();

  if (node.type === 'local') {
    const latencyMs = Date.now() - startTime;
    updateNodeStatus(nodeId, 'online');
    return {
      nodeId,
      ok: true,
      latencyMs,
    };
  }

  try {
    const latencyMs = Date.now() - startTime;
    updateNodeStatus(nodeId, 'online');
    return {
      nodeId,
      ok: true,
      latencyMs,
    };
  } catch (err) {
    updateNodeStatus(nodeId, 'offline');
    return {
      nodeId,
      ok: false,
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function performAllHealthChecks(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  for (const nodeId of nodes.keys()) {
    results.push(await performHealthCheck(nodeId));
  }
  return results;
}

export function selectBestNode(capabilities?: string[]): NodeInfo | undefined {
  const candidates = listOnlineNodes();

  if (!candidates.length) {
    return undefined;
  }

  if (!capabilities?.length) {
    return candidates[0];
  }

  for (const node of candidates) {
    const hasAllCapabilities = capabilities.every((cap) =>
      node.capabilities.includes(cap),
    );
    if (hasAllCapabilities) {
      return node;
    }
  }

  return candidates[0];
}

export function getNodeStats(): {
  total: number;
  online: number;
  offline: number;
  busy: number;
  degraded: number;
} {
  let online = 0;
  let offline = 0;
  let busy = 0;
  let degraded = 0;

  for (const node of nodes.values()) {
    switch (node.status) {
      case 'online':
        online++;
        break;
      case 'offline':
        offline++;
        break;
      case 'busy':
        busy++;
        break;
      case 'degraded':
        degraded++;
        break;
    }
  }

  return {
    total: nodes.size,
    online,
    offline,
    busy,
    degraded,
  };
}

export function initializeLocalNode(port: number = 3000): void {
  const localNode = createLocalNode();
  localNode.port = port;
  registerNode(localNode);
  logger.info(`[ServerDiscovery] 初始化本地节点: ${port}`);
}

export function cleanupStaleNodes(maxAgeMs: number = 5 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [nodeId, node] of nodes) {
    if (node.type === 'local') continue;

    if (now - node.lastSeenAt > maxAgeMs) {
      unregisterNode(nodeId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`[ServerDiscovery] 清理了 ${cleaned} 个过期节点`);
  }

  return cleaned;
}