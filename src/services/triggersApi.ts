import { request } from './api';

export interface TriggerConfig {
  id: string;
  name: string;
  type: 'cron' | 'event' | 'webhook' | 'keyword';
  schedule?: string;
  eventType?: string;
  webhookPath?: string;
  keyword?: string;
  enabled: boolean;
  targetType: 'skill' | 'chain' | 'workflow' | 'automation';
  targetId: string;
  params?: Record<string, unknown>;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerExecution {
  id: string;
  triggerId: string;
  triggerName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  result?: unknown;
  error?: string;
}

export async function getAllTriggers(): Promise<TriggerConfig[]> {
  const { data } = await request<{ data: TriggerConfig[] }>('GET', '/api/triggers');
  return data;
}

export async function getTrigger(id: string): Promise<TriggerConfig> {
  const { data } = await request<{ data: TriggerConfig }>('GET', `/api/triggers/${id}`);
  return data;
}

export async function createTrigger(trigger: Omit<TriggerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<TriggerConfig> {
  const { data } = await request<{ data: TriggerConfig }>('POST', '/api/triggers', trigger);
  return data;
}

export async function updateTrigger(id: string, trigger: Partial<Omit<TriggerConfig, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TriggerConfig> {
  const { data } = await request<{ data: TriggerConfig }>('PUT', `/api/triggers/${id}`, trigger);
  return data;
}

export async function deleteTrigger(id: string): Promise<{ ok: boolean }> {
  const { data } = await request<{ data: { ok: boolean } }>('DELETE', `/api/triggers/${id}`);
  return data;
}

export async function enableTrigger(id: string): Promise<TriggerConfig> {
  const { data } = await request<{ data: TriggerConfig }>('POST', `/api/triggers/${id}/enable`);
  return data;
}

export async function disableTrigger(id: string): Promise<TriggerConfig> {
  const { data } = await request<{ data: TriggerConfig }>('POST', `/api/triggers/${id}/disable`);
  return data;
}

export async function executeTrigger(id: string): Promise<{ ok: boolean; executionId?: string }> {
  const { data } = await request<{ data: { ok: boolean; executionId?: string } }>('POST', `/api/triggers/${id}/execute`);
  return data;
}

export async function getTriggerExecutions(triggerId?: string, limit?: number): Promise<TriggerExecution[]> {
  const params = new URLSearchParams();
  if (triggerId) params.set('triggerId', triggerId);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const { data } = await request<{ data: TriggerExecution[] }>(
    'GET',
    `/api/triggers/executions${query ? `?${query}` : ''}`
  );
  return data;
}