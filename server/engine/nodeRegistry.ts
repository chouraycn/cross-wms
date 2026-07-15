/**
 * 节点注册表 — 参考 OpenClaw gateway/node-registry.ts
 *
 * 跟踪连接的节点客户端、调用请求、广播和系统运行审批。
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';

export interface NodeSession {
  nodeId: string;
  connId: string;
  clientId?: string;
  clientMode?: string;
  displayName?: string;
  platform?: string;
  version?: string;
  remoteIp?: string;
  declaredCaps: string[];
  caps: string[];
  declaredCommands: string[];
  commands: string[];
  declaredPermissions?: Record<string, boolean>;
  permissions?: Record<string, boolean>;
  connectedAtMs: number;
  lastSeenAtMs: number;
  status?: 'connected' | 'disconnected' | 'busy' | 'unpaired';
}

export interface NodeInvokeResult {
  ok: boolean;
  payload?: unknown;
  payloadJSON?: string | null;
  error?: { code?: string; message?: string } | null;
}

export interface PendingInvoke {
  nodeId: string;
  connId: string;
  command: string;
  resolve: (value: NodeInvokeResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface AuthorizedSystemRun {
  nodeId: string;
  connId: string;
  runId: string;
  sessionKey?: string;
  expiresAtMs: number | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const nodes = new Map<string, NodeSession>();
const pendingInvokes = new Map<string, PendingInvoke>();
const authorizedSystemRuns = new Map<string, AuthorizedSystemRun>();

export function registerNode(node: NodeSession): void {
  nodes.set(node.nodeId, node);
  logger.info(`[NodeRegistry] 注册节点: ${node.nodeId} (${node.displayName})`);
}

export function unregisterNode(nodeId: string): void {
  nodes.delete(nodeId);
  logger.info(`[NodeRegistry] 注销节点: ${nodeId}`);
}

export function getNode(nodeId: string): NodeSession | undefined {
  return nodes.get(nodeId);
}

export function getNodeInfo(nodeId: string): NodeSession | undefined {
  return nodes.get(nodeId);
}

export function listNodes(): NodeSession[] {
  return Array.from(nodes.values());
}

export function updateNodeLastSeen(nodeId: string): void {
  const node = nodes.get(nodeId);
  if (node) {
    node.lastSeenAtMs = Date.now();
  }
}

export function updateNodeCapabilities(
  nodeId: string,
  caps: string[],
  commands: string[],
): void {
  const node = nodes.get(nodeId);
  if (!node) return;

  node.declaredCaps = [...caps];
  node.caps = [...caps];
  node.declaredCommands = [...commands];
  node.commands = [...commands];
  node.lastSeenAtMs = Date.now();

  logger.debug(`[NodeRegistry] 更新节点能力: ${nodeId} (${caps.length} caps, ${commands.length} commands)`);
}

export function hasNodeCapability(nodeId: string, capability: string): boolean {
  const node = nodes.get(nodeId);
  if (!node) return false;
  return node.caps.includes(capability);
}

export function canNodeExecuteCommand(nodeId: string, command: string): boolean {
  const node = nodes.get(nodeId);
  if (!node) return false;
  return node.commands.includes(command);
}

export function createPendingInvoke(
  nodeId: string,
  connId: string,
  command: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { invokeId: string; promise: Promise<NodeInvokeResult> } {
  const invokeId = randomUUID();

  let resolveFn: (value: NodeInvokeResult) => void = () => {};
  let rejectFn: (err: Error) => void = () => {};

  const promise = new Promise<NodeInvokeResult>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const timer = setTimeout(() => {
    pendingInvokes.delete(invokeId);
    rejectFn(new Error(`调用超时: ${command}`));
  }, timeoutMs);

  pendingInvokes.set(invokeId, {
    nodeId,
    connId,
    command,
    resolve: resolveFn,
    reject: rejectFn,
    timer,
  });

  return { invokeId, promise };
}

export function resolvePendingInvoke(invokeId: string, result: NodeInvokeResult): boolean {
  const pending = pendingInvokes.get(invokeId);
  if (!pending) return false;

  clearTimeout(pending.timer);
  pending.resolve(result);
  pendingInvokes.delete(invokeId);

  return true;
}

export function rejectPendingInvoke(invokeId: string, error: Error): boolean {
  const pending = pendingInvokes.get(invokeId);
  if (!pending) return false;

  clearTimeout(pending.timer);
  pending.reject(error);
  pendingInvokes.delete(invokeId);

  return true;
}

export function authorizeSystemRun(
  nodeId: string,
  connId: string,
  runId: string,
  sessionKey?: string,
  expiresAtMs?: number,
): void {
  authorizedSystemRuns.set(runId, {
    nodeId,
    connId,
    runId,
    sessionKey,
    expiresAtMs: expiresAtMs ?? null,
  });

  logger.debug(`[NodeRegistry] 授权系统运行: ${runId} (node=${nodeId})`);
}

export function deauthorizeSystemRun(runId: string): void {
  authorizedSystemRuns.delete(runId);
}

export function isSystemRunAuthorized(runId: string): boolean {
  const auth = authorizedSystemRuns.get(runId);
  if (!auth) return false;

  if (auth.expiresAtMs !== null && Date.now() > auth.expiresAtMs) {
    authorizedSystemRuns.delete(runId);
    return false;
  }

  return true;
}

export function cleanupExpiredAuthorizations(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [runId, auth] of authorizedSystemRuns) {
    if (auth.expiresAtMs !== null && now > auth.expiresAtMs) {
      authorizedSystemRuns.delete(runId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`[NodeRegistry] 清理了 ${cleaned} 个过期授权`);
  }

  return cleaned;
}

export function cleanupStaleNodes(maxAgeMs: number = 5 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [nodeId, node] of nodes) {
    if (now - node.lastSeenAtMs > maxAgeMs) {
      unregisterNode(nodeId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`[NodeRegistry] 清理了 ${cleaned} 个过期节点`);
  }

  return cleaned;
}

export function getNodeCount(): number {
  return nodes.size;
}

export function getPendingInvokeCount(): number {
  return pendingInvokes.size;
}