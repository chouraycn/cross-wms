/**
 * Subagent Target Policy — 目标策略
 *
 * 管理子代理的目标分配策略。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { listActiveSubagents } from './subagent-registry.state.js';

export type TargetPolicyType = 'round-robin' | 'least-loaded' | 'random' | 'sticky';

export interface TargetPolicy {
  type: TargetPolicyType;
  options?: Record<string, unknown>;
}

export interface TargetNode {
  id: string;
  name?: string;
  capacity: number;
  currentLoad: number;
  available: boolean;
}

const targetNodes = new Map<string, TargetNode>();
let roundRobinIndex = 0;

export function registerTargetNode(node: TargetNode): void {
  targetNodes.set(node.id, node);
  logger.debug(`[SubagentTargetPolicy] Registered target node: ${node.id}`);
}

export function unregisterTargetNode(nodeId: string): boolean {
  const removed = targetNodes.delete(nodeId);
  if (removed) {
    logger.debug(`[SubagentTargetPolicy] Unregistered target node: ${nodeId}`);
  }
  return removed;
}

export function listTargetNodes(): TargetNode[] {
  return Array.from(targetNodes.values()).filter((n) => n.available);
}

export function getTargetNode(nodeId: string): TargetNode | undefined {
  return targetNodes.get(nodeId);
}

export function selectTarget(
  policy: TargetPolicy = { type: 'round-robin' },
  instance?: SubagentInstance,
): TargetNode | null {
  const availableNodes = listTargetNodes();
  if (availableNodes.length === 0) {
    return null;
  }

  switch (policy.type) {
    case 'round-robin':
      return selectRoundRobin(availableNodes);

    case 'least-loaded':
      return selectLeastLoaded(availableNodes);

    case 'random':
      return selectRandom(availableNodes);

    case 'sticky':
      return selectSticky(availableNodes, instance);

    default:
      return selectRoundRobin(availableNodes);
  }
}

function selectRoundRobin(nodes: TargetNode[]): TargetNode {
  const node = nodes[roundRobinIndex % nodes.length];
  roundRobinIndex++;
  return node;
}

function selectLeastLoaded(nodes: TargetNode[]): TargetNode {
  return nodes.reduce((best, node) => {
    const bestLoad = best.currentLoad / best.capacity;
    const nodeLoad = node.currentLoad / node.capacity;
    return nodeLoad < bestLoad ? node : best;
  });
}

function selectRandom(nodes: TargetNode[]): TargetNode {
  return nodes[Math.floor(Math.random() * nodes.length)];
}

function selectSticky(
  nodes: TargetNode[],
  instance?: SubagentInstance,
): TargetNode {
  const assignedNodeId = instance?.metadata?.assignedNodeId as string | undefined;
  if (assignedNodeId && targetNodes.has(assignedNodeId)) {
    const node = targetNodes.get(assignedNodeId);
    if (node?.available) {
      return node;
    }
  }
  return selectRoundRobin(nodes);
}

export function updateNodeLoad(nodeId: string, load: number): boolean {
  const node = targetNodes.get(nodeId);
  if (!node) return false;

  targetNodes.set(nodeId, { ...node, currentLoad: load });
  return true;
}

export function incrementNodeLoad(nodeId: string, delta: number = 1): boolean {
  const node = targetNodes.get(nodeId);
  if (!node) return false;

  targetNodes.set(nodeId, { ...node, currentLoad: Math.max(0, node.currentLoad + delta) });
  return true;
}

export function getTargetStats(): {
  totalNodes: number;
  availableNodes: number;
  totalCapacity: number;
  totalLoad: number;
} {
  const allNodes = Array.from(targetNodes.values());
  const available = allNodes.filter((n) => n.available);

  return {
    totalNodes: allNodes.length,
    availableNodes: available.length,
    totalCapacity: available.reduce((sum, n) => sum + n.capacity, 0),
    totalLoad: available.reduce((sum, n) => sum + n.currentLoad, 0),
  };
}