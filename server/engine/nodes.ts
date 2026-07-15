/**
 * Nodes Gateway Methods — 参考 OpenClaw gateway/server-methods/nodes.ts
 *
 * 实现 nodes.invoke/status/pair/unpair 等核心节点管理功能。
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';
import { registerNode, unregisterNode, getNodeInfo, listNodes, canNodeExecuteCommand } from './nodeRegistry.js';

export interface NodeInfo {
  nodeId: string;
  name: string;
  platform: 'macos' | 'windows' | 'linux' | 'android' | 'ios';
  status: 'connected' | 'disconnected' | 'busy' | 'unpaired';
  capabilities: string[];
  lastSeenAt: number;
  metadata?: Record<string, unknown>;
}

export interface NodeInvokeParams {
  nodeId: string;
  command: string;
  args?: string[];
  timeoutMs?: number;
}

export interface NodeInvokeResult {
  invokeId: string;
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface NodePairParams {
  nodeId: string;
  name?: string;
  platform?: string;
  capabilities?: string[];
}

export interface NodePairResult {
  success: boolean;
  nodeId: string;
  status: 'paired' | 'pending' | 'rejected';
}

export interface NodeStatusResult {
  nodeId: string;
  status: NodeInfo['status'];
  capabilities: string[];
}

export interface NodeListResult {
  nodes: NodeInfo[];
  total: number;
}

export async function nodeInvoke(params: NodeInvokeParams): Promise<NodeInvokeResult> {
  logger.info(`[Nodes] 调用节点命令: ${params.nodeId} ${params.command}`);

  const node = getNodeInfo(params.nodeId);
  if (!node) {
    return {
      invokeId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nodeId: params.nodeId,
      status: 'failed',
      error: '节点不存在',
    };
  }

  if (!canNodeExecuteCommand(params.nodeId, params.command)) {
    return {
      invokeId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nodeId: params.nodeId,
      status: 'failed',
      error: '命令不被允许',
    };
  }

  await publishEvent('system:info', {
    nodeId: params.nodeId,
    command: params.command,
    action: 'invoke_started',
  });

  return {
    invokeId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    nodeId: params.nodeId,
    status: 'running',
  };
}

export async function nodeStatus(nodeId: string): Promise<NodeStatusResult | null> {
  const node = getNodeInfo(nodeId);
  if (!node) {
    return null;
  }

  return {
    nodeId: node.nodeId,
    status: node.status ?? 'connected',
    capabilities: node.caps,
  };
}

export async function nodePair(params: NodePairParams): Promise<NodePairResult> {
  logger.info(`[Nodes] 配对节点: ${params.nodeId}`);

  registerNode({
    nodeId: params.nodeId,
    connId: `${Date.now()}`,
    displayName: params.name ?? 'Unknown',
    platform: params.platform,
    declaredCaps: params.capabilities ?? [],
    caps: params.capabilities ?? [],
    declaredCommands: [],
    commands: [],
    connectedAtMs: Date.now(),
    lastSeenAtMs: Date.now(),
  });

  await publishEvent('system:info', {
    nodeId: params.nodeId,
    action: 'paired',
  });

  return {
    success: true,
    nodeId: params.nodeId,
    status: 'paired',
  };
}

export async function nodeUnpair(nodeId: string): Promise<{ success: boolean }> {
  logger.info(`[Nodes] 取消配对节点: ${nodeId}`);

  unregisterNode(nodeId);

  await publishEvent('system:info', {
    nodeId,
    action: 'unpaired',
  });

  return { success: true };
}

export async function nodeList(): Promise<NodeListResult> {
  const sessions = listNodes();

  const nodes: NodeInfo[] = sessions.map((session) => ({
    nodeId: session.nodeId,
    name: session.displayName ?? 'Unknown',
    platform: (session.platform as NodeInfo['platform']) ?? 'macos',
    status: session.status ?? 'connected',
    capabilities: session.caps,
    lastSeenAt: session.lastSeenAtMs,
  }));

  return {
    nodes,
    total: nodes.length,
  };
}