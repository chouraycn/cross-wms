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