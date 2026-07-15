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