import { request } from './api';

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  apiEndpoint?: string;
  apiKeyRef?: string;
  enabled: boolean;
  modelName?: string;
  contextWindow?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  /** 使用统计（可选，由后端注入） */
  usageStats?: {
    callCount: number;
    lastUsedAt: string | null;
    avgResponseTime: number | null;
  };
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  apiEndpoint?: string;
  apiKeyRef?: string;
  enabled: boolean;
}

export interface ModelsConfig {
  models: ModelConfig[];
  defaultModelId: string;
  providers?: ProviderConfig[];
}

export interface HealthCheckResult {
  modelId: string;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'skipped';
  message: string;
  latency?: number;
  checkedAt: string;
}

export interface DiscoveredModel {
  id: string;
  name: string;
  provider: string;
  apiEndpoint: string;
  size?: string;
  family?: string;
  parameterSize?: string;
  contextWindow?: number;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  modelValid?: boolean;
  models?: string[];
}

export async function getModels(): Promise<ModelsConfig> {
  const { data } = await request<{ data: ModelsConfig }>('GET', '/api/models');
  return data;
}

export async function saveModels(models: ModelConfig[], defaultModelId: string, providers?: ProviderConfig[]): Promise<ModelsConfig> {
  const { data } = await request<{ data: ModelsConfig }>('PUT', '/api/models', { models, defaultModelId, providers });
  return data;
}

export async function resetModels(): Promise<ModelsConfig> {
  const { data } = await request<{ data: ModelsConfig }>('POST', '/api/models/reset');
  return data;
}

export async function healthCheck(models?: ModelConfig[]): Promise<HealthCheckResult[]> {
  const { data } = await request<{ data: HealthCheckResult[] }>('POST', '/api/models/health-check', models ? { models } : {});
  return data;
}

export async function discoverLocalModels(ollamaUrl?: string): Promise<DiscoveredModel[]> {
  const { data } = await request<{ data: DiscoveredModel[] }>('POST', '/api/models/discover-local', ollamaUrl ? { ollamaUrl } : {});
  return data;
}

export async function testConnection(apiEndpoint: string, apiKey?: string, modelId?: string): Promise<TestConnectionResult> {
  return request<TestConnectionResult>('POST', '/api/models/test-connection', { apiEndpoint, apiKey, modelId });
}

export async function getRecommendedModels(): Promise<ModelConfig[]> {
  const { data } = await request<{ data: ModelConfig[] }>('GET', '/api/models/recommended');
  return data;
}

export async function addRecommendedModel(id: string): Promise<ModelsConfig> {
  const { data } = await request<{ data: ModelsConfig }>('POST', `/api/models/recommended/${id}`);
  return data;
}

export async function addAllRecommendedModels(): Promise<{ data: ModelsConfig; added: number; message: string }> {
  return request<{ data: ModelsConfig; added: number; message: string }>('POST', '/api/models/add-recommended');
}

export async function getHostIp(): Promise<{ hostIp: string }> {
  return request<{ hostIp: string }>('GET', '/api/models/host-ip');
}

// ============================================================
// v2.x: 模型故障转移运行时状态 API
// 与 healthCheck（主动探测）不同，failover 状态是运行时累积的
// 健康/冷却/连续失败计数，反映模型在故障转移链路中的实时表现。
// ============================================================

/** 单个模型的故障转移运行时状态 */
export interface FailoverHealth {
  modelId: string;
  modelName: string;
  isHealthy: boolean;
  isInCooldown: boolean;
  consecutiveFailures: number;
}

/** 详细的模型健康状态（含历史计数） */
export interface FailoverHealthDetail {
  modelId: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  isInCooldown: boolean;
  cooldownRemainingMs: number;
  lastError?: string;
  lastErrorCategory?: string;
  lastSuccessAt?: number;
  lastFailureAt?: number;
}

/** 故障转移决策日志条目 */
export interface FailoverDecision {
  type: 'success' | 'failure' | 'cooldown_start' | 'cooldown_end' | 'model_switch' | 'no_candidate';
  modelId?: string;
  fromModel?: string;
  toModel?: string;
  reason?: string;
  errorCategory?: string;
  timestamp: number;
  [key: string]: unknown;
}

/** 获取所有模型的故障转移运行时健康状态 */
export async function getFailoverHealth(): Promise<FailoverHealth[]> {
  const { data } = await request<{ data: { models: FailoverHealth[] } }>('GET', '/api/models/failover/health');
  return data.models;
}

/** 获取指定模型的详细故障转移健康状态 */
export async function getFailoverHealthDetail(modelId: string): Promise<FailoverHealthDetail> {
  const { data } = await request<{ data: FailoverHealthDetail }>('GET', `/api/models/failover/health/${modelId}`);
  return data;
}

/** 获取故障转移决策日志（最新在前） */
export async function getFailoverDecisions(limit = 50): Promise<FailoverDecision[]> {
  const { data } = await request<{ data: { decisions: FailoverDecision[]; count: number } }>(
    'GET',
    `/api/models/failover/decisions?limit=${limit}`,
  );
  return data.decisions;
}

/** 重置所有模型的故障转移健康状态（手动清除冷却） */
export async function resetAllFailoverHealth(): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/api/models/failover/reset');
}

/** 重置指定模型的故障转移健康状态 */
export async function resetModelFailoverHealth(modelId: string): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', `/api/models/failover/reset/${modelId}`);
}