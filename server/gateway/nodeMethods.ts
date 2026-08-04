/**
 * Node Gateway Methods — 节点配对与管理 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/nodes.ts
 * - 精简版：实现 pair.request / list / approve / reject / remove / verify /
 *   rename / describe 八个核心方法
 * - 内存存储配对请求与已配对节点（生产环境应使用数据库）
 * - node.list 与 devices.list 语义对齐，可作为节点视角的别名
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getWebSocketHub } from './webSocketHub.js';
import { GATEWAY_EVENT_TYPES } from './gatewayEventTypes.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 配对请求状态
type PairRequestStatus = 'pending' | 'approved' | 'rejected';

// 配对请求记录
interface NodePairRequest {
  requestId: string;
  nodeId: string;
  displayName?: string;
  platform?: string;
  deviceFamily?: string;
  version?: string;
  caps?: string[];
  commands?: string[];
  remoteIp?: string;
  status: PairRequestStatus;
  createdAt: number;
  resolvedAt?: number;
}

// 已配对节点记录
interface PairedNode {
  nodeId: string;
  displayName: string;
  platform?: string;
  deviceFamily?: string;
  version?: string;
  caps: string[];
  commands: string[];
  token: string;
  pairedAt: number;
  lastSeenAt?: number;
  metadata?: Record<string, unknown>;
}

// 内存存储
const pairRequests = new Map<string, NodePairRequest>();
const pairedNodes = new Map<string, PairedNode>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateToken(): string {
  return `ntok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 16)}`;
}

// ========== Node Pair Request ==========

async function nodePairRequest(params: unknown, _ctx: GatewayMethodContext) {
  const {
    nodeId,
    displayName,
    platform,
    deviceFamily,
    version,
    caps,
    commands,
    remoteIp,
  } = params as {
    nodeId: string;
    displayName?: string;
    platform?: string;
    deviceFamily?: string;
    version?: string;
    caps?: string[];
    commands?: string[];
    remoteIp?: string;
  };

  if (!nodeId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'nodeId is required' } };
  }

  // 已配对节点直接返回已批准状态
  const existing = pairedNodes.get(nodeId);
  if (existing) {
    existing.lastSeenAt = Date.now();
    return {
      ok: true,
      status: 'approved' as const,
      requestId: null,
      node: existing,
    };
  }

  const requestId = generateId('preq');
  const request: NodePairRequest = {
    requestId,
    nodeId,
    displayName,
    platform,
    deviceFamily,
    version,
    caps,
    commands,
    remoteIp,
    status: 'pending',
    createdAt: Date.now(),
  };
  pairRequests.set(requestId, request);

  // 广播 node.pair.requested 事件，通知 WS 客户端有新的配对请求待审批
  try {
    getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.NODE_PAIR_REQUESTED, {
      requestId,
      nodeId,
      displayName: request.displayName,
      platform: request.platform,
      deviceFamily: request.deviceFamily,
      remoteIp: request.remoteIp,
      requestedAt: request.createdAt,
    });
  } catch {
    // ignore broadcast errors
  }

  return {
    ok: true,
    status: 'pending' as const,
    requestId,
    request,
  };
}

// ========== Node List ==========

async function nodeList(_params: unknown, _ctx: GatewayMethodContext) {
  const nodes = Array.from(pairedNodes.values()).sort((a, b) => b.pairedAt - a.pairedAt);
  const pending = Array.from(pairRequests.values()).filter((r) => r.status === 'pending');

  return {
    ok: true,
    ts: Date.now(),
    nodes: nodes.map((n) => ({
      nodeId: n.nodeId,
      displayName: n.displayName,
      platform: n.platform,
      deviceFamily: n.deviceFamily,
      paired: true,
      connected: false,
      pairedAt: n.pairedAt,
      lastSeenAt: n.lastSeenAt ?? null,
      caps: n.caps,
      commands: n.commands,
    })),
    pendingCount: pending.length,
  };
}

// ========== Node Approve ==========

async function nodeApprove(params: unknown, _ctx: GatewayMethodContext) {
  const { requestId } = params as { requestId: string };

  if (!requestId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'requestId is required' } };
  }

  const request = pairRequests.get(requestId);
  if (!request) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'unknown requestId' } };
  }
  if (request.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `request already ${request.status}` },
    };
  }

  request.status = 'approved';
  request.resolvedAt = Date.now();

  const node: PairedNode = {
    nodeId: request.nodeId,
    displayName: request.displayName ?? request.nodeId,
    platform: request.platform,
    deviceFamily: request.deviceFamily,
    version: request.version,
    caps: request.caps ?? [],
    commands: request.commands ?? [],
    token: generateToken(),
    pairedAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  pairedNodes.set(node.nodeId, node);

  // 广播 node.pair.resolved 事件（decision=approve）
  try {
    getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.NODE_PAIR_RESOLVED, {
      requestId,
      nodeId: node.nodeId,
      decision: 'approve' as const,
      resolvedAt: request.resolvedAt ?? Date.now(),
    });
  } catch {
    // ignore broadcast errors
  }

  return {
    ok: true,
    requestId,
    nodeId: node.nodeId,
    node,
  };
}

// ========== Node Reject ==========

async function nodeReject(params: unknown, _ctx: GatewayMethodContext) {
  const { requestId } = params as { requestId: string };

  if (!requestId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'requestId is required' } };
  }

  const request = pairRequests.get(requestId);
  if (!request) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'unknown requestId' } };
  }
  if (request.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `request already ${request.status}` },
    };
  }

  request.status = 'rejected';
  request.resolvedAt = Date.now();

  // 广播 node.pair.resolved 事件（decision=reject）
  try {
    getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.NODE_PAIR_RESOLVED, {
      requestId,
      nodeId: request.nodeId,
      decision: 'reject' as const,
      resolvedAt: request.resolvedAt,
    });
  } catch {
    // ignore broadcast errors
  }

  return {
    ok: true,
    requestId,
    nodeId: request.nodeId,
  };
}

// ========== Node Remove ==========

async function nodeRemove(params: unknown, _ctx: GatewayMethodContext) {
  const { nodeId } = params as { nodeId: string };

  if (!nodeId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'nodeId is required' } };
  }

  const removed = pairedNodes.delete(nodeId);
  // 同时清理该节点的待处理请求
  for (const [reqId, req] of pairRequests) {
    if (req.nodeId === nodeId && req.status === 'pending') {
      pairRequests.delete(reqId);
    }
  }

  if (!removed) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'unknown nodeId' } };
  }

  return {
    ok: true,
    nodeId,
  };
}

// ========== Node Verify ==========

async function nodeVerify(params: unknown, _ctx: GatewayMethodContext) {
  const { nodeId, token } = params as { nodeId: string; token: string };

  if (!nodeId || !token) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'nodeId and token are required' } };
  }

  const node = pairedNodes.get(nodeId);
  if (!node) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'unknown nodeId' } };
  }

  const valid = node.token === token;
  if (valid) {
    node.lastSeenAt = Date.now();
  }

  return {
    ok: true,
    valid,
    nodeId,
  };
}

// ========== Node Rename ==========

async function nodeRename(params: unknown, _ctx: GatewayMethodContext) {
  const { nodeId, displayName } = params as { nodeId: string; displayName: string };

  if (!nodeId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'nodeId is required' } };
  }
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'displayName required' } };
  }

  const node = pairedNodes.get(nodeId);
  if (!node) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'unknown nodeId' } };
  }

  node.displayName = trimmed;

  return {
    ok: true,
    nodeId: node.nodeId,
    displayName: node.displayName,
  };
}

// ========== Node Describe ==========

async function nodeDescribe(params: unknown, _ctx: GatewayMethodContext) {
  const { nodeId } = params as { nodeId: string };

  if (!nodeId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'nodeId is required' } };
  }

  const node = pairedNodes.get(nodeId);
  if (!node) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'unknown nodeId' } };
  }

  return {
    ok: true,
    ts: Date.now(),
    nodeId: node.nodeId,
    displayName: node.displayName,
    platform: node.platform,
    deviceFamily: node.deviceFamily,
    version: node.version,
    caps: node.caps,
    commands: node.commands,
    pairedAt: node.pairedAt,
    lastSeenAt: node.lastSeenAt ?? null,
    metadata: node.metadata ?? {},
  };
}

// ========== Node Invoke ==========

async function nodeInvoke(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    nodeId?: string;
    kind?: string;
    args?: unknown;
  };

  const nodeId = typeof p.nodeId === 'string' ? p.nodeId.trim() : '';
  const kind = typeof p.kind === 'string' ? p.kind.trim() : '';

  if (!nodeId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'nodeId is required' } };
  }
  if (!kind) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'kind is required' } };
  }

  const node = pairedNodes.get(nodeId);
  if (!node) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'unknown nodeId' } };
  }

  const invokeId = generateId('inv');
  const requestedAt = Date.now();

  // 广播 node.invoke.request 事件，通知节点宿主执行调用
  // 精简版不等待节点返回；由外部 node-host 监听该事件并异步回执
  try {
    getWebSocketHub().broadcastEvent(GATEWAY_EVENT_TYPES.NODE_INVOKE_REQUEST, {
      invokeId,
      nodeId,
      kind,
      args: p.args,
      requestedAt,
    });
  } catch {
    // ignore broadcast errors
  }

  return {
    ok: true,
    invokeId,
    nodeId,
    kind,
    requestedAt,
    status: 'dispatched' as const,
  };
}

/**
 * 注册所有节点方法
 */
export function registerNodeMethods(registry: GatewayMethodRegistry): void {
  registry.register('node.pair.request', nodePairRequest);
  registry.register('node.list', nodeList);
  registry.register('node.approve', nodeApprove);
  registry.register('node.reject', nodeReject);
  registry.register('node.remove', nodeRemove);
  registry.register('node.verify', nodeVerify);
  registry.register('node.rename', nodeRename);
  registry.register('node.describe', nodeDescribe);
  registry.register('node.invoke', nodeInvoke);

  // ---- 兼容别名（openclaw 命名，复用现有处理函数）----
  registry.register('node.pair.approve', nodeApprove);   // node.pair.approve = node.approve 别名
  registry.register('node.pair.reject', nodeReject);     // node.pair.reject = node.reject 别名
  registry.register('node.pair.verify', nodeVerify);     // node.pair.verify = node.verify 别名
  registry.register('node.pair.remove', nodeRemove);     // node.pair.remove = node.remove 别名
}
