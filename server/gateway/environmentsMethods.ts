/**
 * Environments Gateway Methods — 执行环境 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/environments.ts
 * - 精简版：将本地 Gateway 与已配对节点汇总为执行环境列表
 * - 复用 node.list 方法获取已配对节点
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 本地 Gateway 环境常量
const GATEWAY_ENVIRONMENT = {
  id: 'gateway',
  type: 'local',
  label: 'Gateway local',
  status: 'available',
  capabilities: ['agent.run', 'sessions', 'tools', 'workspace'],
};

// ========== Environments List ==========

async function environmentsList(_params: unknown, _ctx: GatewayMethodContext) {
  // 通过注册表复用 node.list 获取已配对节点
  const registry = getMethodRegistry();
  const nodesResult = await registry.invoke('node.list', {}, {
    requestId: `env_list_${Date.now()}`,
    timestamp: Date.now(),
  });

  const nodeEnvironments: Array<Record<string, unknown>> = [];
  if (nodesResult.ok && nodesResult.result) {
    const nodes = (nodesResult.result as { nodes?: Array<Record<string, unknown>> }).nodes ?? [];
    for (const node of nodes) {
      const capabilities = Array.isArray(node.caps) ? node.caps : [];
      const commands = Array.isArray(node.commands) ? node.commands : [];
      // 合并 caps 与 commands 作为能力清单
      const merged = Array.from(new Set([...capabilities, ...commands])) as string[];
      nodeEnvironments.push({
        id: `node:${node.nodeId}`,
        type: 'node',
        label: node.displayName ?? node.nodeId,
        status: node.paired ? 'available' : 'unavailable',
        ...(merged.length > 0 ? { capabilities: merged } : {}),
      });
    }
  }

  return {
    ok: true,
    environments: [GATEWAY_ENVIRONMENT, ...nodeEnvironments],
  };
}

// ========== Environments Status ==========

async function environmentsStatus(params: unknown, _ctx: GatewayMethodContext) {
  const { environmentId } = (params || {}) as { environmentId?: string };

  if (!environmentId || typeof environmentId !== 'string') {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'environmentId is required' } };
  }

  // 本地 Gateway 环境直接返回
  if (environmentId === 'gateway') {
    return { ok: true, ...GATEWAY_ENVIRONMENT };
  }

  // node: 前缀的环境：查询节点详情
  if (environmentId.startsWith('node:')) {
    const nodeId = environmentId.slice('node:'.length);
    const registry = getMethodRegistry();
    const describeResult = await registry.invoke('node.describe', { nodeId }, {
      requestId: `env_status_${Date.now()}`,
      timestamp: Date.now(),
    });

    if (!describeResult.ok || !describeResult.result) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `unknown environmentId: ${environmentId}` } };
    }

    const node = describeResult.result as Record<string, unknown>;
    const capabilities = Array.isArray(node.caps) ? node.caps : [];
    const commands = Array.isArray(node.commands) ? node.commands : [];
    const merged = Array.from(new Set([...capabilities, ...commands])) as string[];

    return {
      ok: true,
      id: environmentId,
      type: 'node',
      label: node.displayName ?? nodeId,
      status: 'available',
      ...(merged.length > 0 ? { capabilities: merged } : {}),
    };
  }

  return { ok: false, error: { code: 'NOT_FOUND', message: `unknown environmentId: ${environmentId}` } };
}

/**
 * 注册所有环境方法
 */
export function registerEnvironmentsMethods(registry: GatewayMethodRegistry): void {
  registry.register('environments.list', environmentsList);
  registry.register('environments.status', environmentsStatus);
}
