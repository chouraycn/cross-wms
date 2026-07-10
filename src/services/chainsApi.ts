import { request } from './api';

export interface SkillChainNode {
  id: string;
  chainId: string;
  skillId: string;
  skillName: string;
  skillIcon?: string;
  dataPassMode: string;
  selectedFields?: unknown;
  customMapping?: unknown;
  timeout?: number;
  retryCount?: number;
  nodeOrder: number;
}

export interface SkillChain {
  id: string;
  name: string;
  description?: string;
  failStrategy: 'stop' | 'continue';
  nodes: SkillChainNode[];
  createdAt: string;
  updatedAt: string;
}

export interface ChainExecution {
  executionId: string;
  chainId: string;
  chainName: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  steps: Array<Record<string, unknown>>;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export async function getAllSkillChains(): Promise<SkillChain[]> {
  const { data } = await request<{ data: SkillChain[] }>('GET', '/api/skill-chains');
  return data;
}

export async function getSkillChain(id: string): Promise<SkillChain> {
  const { data } = await request<{ data: SkillChain }>('GET', `/api/skill-chains/${id}`);
  return data;
}

export async function createSkillChain(name: string, description?: string, failStrategy: 'stop' | 'continue' = 'stop', nodes: SkillChainNode[] = []): Promise<SkillChain> {
  const { data } = await request<{ data: SkillChain }>('POST', '/api/skill-chains', { name, description, failStrategy, nodes });
  return data;
}

export async function updateSkillChain(id: string, name: string, description?: string, failStrategy: 'stop' | 'continue' = 'stop', nodes: SkillChainNode[] = []): Promise<SkillChain> {
  const { data } = await request<{ data: SkillChain }>('PUT', `/api/skill-chains/${id}`, { name, description, failStrategy, nodes });
  return data;
}

export async function deleteSkillChain(id: string): Promise<{ ok: boolean }> {
  const { data } = await request<{ data: { ok: boolean } }>('DELETE', `/api/skill-chains/${id}`);
  return data;
}

export async function executeSkillChain(id: string): Promise<{ ok: boolean; executionId?: string; result?: unknown }> {
  const { data } = await request<{ data: { ok: boolean; executionId?: string; result?: unknown } }>('POST', `/api/skill-chains/${id}/execute`);
  return data;
}

export async function duplicateSkillChain(id: string): Promise<SkillChain> {
  const { data } = await request<{ data: SkillChain }>('POST', `/api/skill-chains/${id}/duplicate`);
  return data;
}

export async function abortSkillChain(id: string, execId?: string): Promise<{ ok: boolean }> {
  const { data } = await request<{ data: { ok: boolean } }>('POST', `/api/skill-chains/${id}/abort`, execId ? { execId } : {});
  return data;
}

export async function getChainExecution(execId: string): Promise<ChainExecution> {
  const { data } = await request<{ data: ChainExecution }>('GET', `/api/chain-executions/${execId}`);
  return data;
}