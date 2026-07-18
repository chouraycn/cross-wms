/**
 * Agents Gateway Methods — 参考 OpenClaw gateway/server-methods/agents.ts
 *
 * 实现 agents.create/update/delete/list 等核心 Agent 管理功能。
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  toolPolicy?: {
    allow?: string[];
    deny?: string[];
  };
  metadata?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

export interface AgentCreateParams {
  name: string;
  description?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  toolPolicy?: {
    allow?: string[];
    deny?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface AgentUpdateParams {
  id: string;
  name?: string;
  description?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  toolPolicy?: {
    allow?: string[];
    deny?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface AgentListResult {
  agents: AgentConfig[];
  total: number;
}

export interface AgentResult {
  agent: AgentConfig;
}

const agents = new Map<string, AgentConfig>();

export async function agentCreate(params: AgentCreateParams): Promise<AgentResult> {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  const agent: AgentConfig = {
    id,
    name: params.name,
    description: params.description,
    model: params.model,
    provider: params.provider,
    systemPrompt: params.systemPrompt,
    toolPolicy: params.toolPolicy,
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
  };

  agents.set(id, agent);

  logger.info(`[Agents] 创建 Agent: ${id} (${params.name})`);

  await publishEvent('agent:run_started', {
    agentId: id,
    name: params.name,
    action: 'created',
  });

  return { agent };
}

export async function agentUpdate(params: AgentUpdateParams): Promise<AgentResult> {
  const existing = agents.get(params.id);
  if (!existing) {
    throw new Error(`Agent ${params.id} 不存在`);
  }

  const updated: AgentConfig = {
    ...existing,
    ...params,
    updatedAt: Date.now(),
  };

  agents.set(params.id, updated);

  logger.info(`[Agents] 更新 Agent: ${params.id}`);

  await publishEvent('agent:run_completed', {
    agentId: params.id,
    action: 'updated',
  });

  return { agent: updated };
}

export async function agentDelete(id: string): Promise<{ success: boolean }> {
  const agent = agents.get(id);
  if (!agent) {
    return { success: false };
  }

  agents.delete(id);

  logger.info(`[Agents] 删除 Agent: ${id}`);

  await publishEvent('agent:run_aborted', {
    agentId: id,
    action: 'deleted',
  });

  return { success: true };
}

export async function agentGet(id: string): Promise<AgentResult | null> {
  const agent = agents.get(id);
  if (!agent) {
    return null;
  }

  return { agent };
}

export async function agentList(): Promise<AgentListResult> {
  const agentList = Array.from(agents.values());

  logger.debug(`[Agents] 获取 Agent 列表: ${agentList.length} 个`);

  return {
    agents: agentList,
    total: agentList.length,
  };
}

export function getAgentById(id: string): AgentConfig | undefined {
  return agents.get(id);
}

export function getAllAgents(): AgentConfig[] {
  return Array.from(agents.values());
}

// ============================================================================
// Agent 运行时能力整合
// ============================================================================

import {
  AgentIdentity,
  getAgentIdentity as getRuntimeAgentIdentity,
} from './agents/identity.js';
import {
  createAgentSandbox,
  getAgentSandbox as getRuntimeAgentSandbox,
} from './agents/sandbox.js';
import { UsageTracker } from './agents/usageTracker.js';

/**
 * 获取 Agent 身份运行时信息
 *
 * 优先从运行时存储获取，若不存在则基于 Agent 配置生成默认身份。
 *
 * @param agentId Agent ID
 * @returns AgentIdentity 或 undefined
 */
export function getAgentIdentity(agentId: string): AgentIdentity | undefined {
  const agent = agents.get(agentId);
  if (!agent) return undefined;

  const runtime = getRuntimeAgentIdentity(agentId);
  if (runtime) return runtime;

  return new AgentIdentity({
    id: agent.id,
    name: agent.name,
    role: agent.systemPrompt ? 'expert' : 'general',
    prefix: agent.name?.toLowerCase().replace(/\s+/g, '-') ?? agent.id,
    ackReaction: true,
    humanDelayMs: 200,
    scenarios: [],
  });
}

/**
 * 获取 Agent 沙箱
 *
 * 基于 Agent 配置创建或返回已存在的沙箱实例。
 *
 * @param agentId Agent ID
 * @returns AgentSandbox 或 undefined
 */
export function getAgentSandbox(agentId: string) {
  const agent = agents.get(agentId);
  if (!agent) return undefined;

  const existing = getRuntimeAgentSandbox(agentId);
  if (existing) return existing;

  return createAgentSandbox(agentId, {
    timeoutMs: 60000,
    maxMemoryMB: 1024,
    maxCpuTimeMs: 30000,
  });
}

/** 全局使用量追踪器 */
const _usageTracker = new UsageTracker();

/**
 * 追踪模型使用
 * @param modelId 模型标识
 * @param tokensIn 输入 token 数
 * @param tokensOut 输出 token 数
 * @param cost 成本
 * @param sessionId 可选会话 ID
 */
export function trackUsage(
  modelId: string,
  tokensIn: number,
  tokensOut: number,
  cost: number,
  sessionId?: string,
): void {
  _usageTracker.track(modelId, tokensIn, tokensOut, cost, sessionId);
}

/**
 * 获取使用统计
 * @param sessionId 可选会话 ID
 */
export function getUsageStats(sessionId?: string) {
  return _usageTracker.getStats(sessionId);
}

/**
 * 获取每日使用汇总
 */
export function getDailyUsageSummary() {
  return _usageTracker.getDailySummary();
}

/**
 * 重置使用记录
 */
export function resetUsage(): void {
  _usageTracker.reset();
}