/**
 * Agent Identity Gateway Methods — Agent 身份信息 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/agent.ts 的 agent.identity.get
 * - 精简版：根据 agentId / sessionKey 返回 agent 的身份信息
 * - 复用 coreMethods 注册的 agents.get 方法获取 agent 元数据
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 默认 agent 身份（当未指定 agentId 时返回）
const DEFAULT_IDENTITY = {
  agentId: 'general',
  name: '通用助手',
  avatar: null as string | null,
  avatarSource: 'default' as const,
};

// 默认头像源映射
const AGENT_AVATAR_FALLBACK: Record<string, string | null> = {
  'wms-expert': null,
  'wms-analyst': null,
  'wms-operator': null,
  general: null,
  debugger: null,
};

/**
 * 从 sessionKey 中解析 agentId
 * cross-wms 的 sessionKey 格式：<agentId>:<rest> 或 sess_<id>
 */
function resolveAgentIdFromSessionKey(sessionKey: string): string | undefined {
  if (!sessionKey) return undefined;
  // 形如 "general:abc123" 的 sessionKey 提取 agentId
  const colonIdx = sessionKey.indexOf(':');
  if (colonIdx > 0) {
    const candidate = sessionKey.slice(0, colonIdx);
    if (/^[a-zA-Z0-9_-]+$/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

// ========== Agent Identity Get ==========

async function agentIdentityGet(params: unknown, _ctx: GatewayMethodContext) {
  const { agentId: agentIdRaw, sessionKey: sessionKeyRaw } = params as {
    agentId?: string;
    sessionKey?: string;
  };

  let agentId: string | undefined = agentIdRaw?.trim() || undefined;

  if (sessionKeyRaw) {
    const resolved = resolveAgentIdFromSessionKey(sessionKeyRaw);
    if (resolved) {
      if (agentId && resolved !== agentId) {
        return {
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            message: `agent "${agentIdRaw}" does not match session key agent "${resolved}"`,
          },
        };
      }
      agentId = resolved;
    }
  }

  // 未指定 agentId 时返回默认身份
  if (!agentId) {
    return {
      ok: true,
      ...DEFAULT_IDENTITY,
    };
  }

  // 通过注册表复用 agents.get 查询 agent 元数据
  const registry = getMethodRegistry();
  const agentResult = await registry.invoke('agents.get', { id: agentId }, {
    requestId: `agent_identity_${Date.now()}`,
    timestamp: Date.now(),
  });

  if (!agentResult.ok || !agentResult.result) {
    // agent 不存在时回退到默认身份，保留请求的 agentId
    return {
      ok: true,
      agentId,
      name: agentId,
      avatar: AGENT_AVATAR_FALLBACK[agentId] ?? null,
      avatarSource: 'fallback' as const,
    };
  }

  const agent = agentResult.result as {
    id: string;
    name: string;
    description?: string;
    capabilities?: string[];
  };

  return {
    ok: true,
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities ?? [],
    avatar: AGENT_AVATAR_FALLBACK[agent.id] ?? null,
    avatarSource: 'default' as const,
  };
}

/**
 * 注册 Agent 身份方法
 */
export function registerAgentIdentityMethods(registry: GatewayMethodRegistry): void {
  registry.register('agent.identity.get', agentIdentityGet);
}
