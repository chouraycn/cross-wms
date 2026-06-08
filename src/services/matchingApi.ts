/**
 * Matching API — 语义匹配引擎前端 API 调用封装
 *
 * 封装所有 /api/matching/* 的 HTTP 请求，类型安全
 */

import { request } from './api';
import type { MatchMode, MatchResult, MatchEngineRuntimeConfig } from '../types/semantic';

// ===================== 响应类型 =====================

/** 匹配查询响应 */
export interface MatchResponse {
  results: MatchResult[];
  query: string;
  matchMode: MatchMode;
  totalResults: number;
}

/** 嵌入向量生成结果 */
export interface EmbeddingGenerateResult {
  generated: number;
  skipped: number;
}

/** 嵌入向量状态 */
export interface EmbeddingStatus {
  total: number;
  embedded: number;
  modelInfo: {
    name: string;
    dimension: number;
    ready: boolean;
  };
}

/** 匹配反馈 */
export interface MatchFeedback {
  query: string;
  skillId: string;
  matchMode: MatchMode;
  matchScore: number;
  isRelevant: boolean;
  userFeedback?: number; // 1=正面, -1=负面
  expectedSkillId?: string;
  comment?: string;
}

/** 匹配引擎配置（前端展示用，扩展自 MatchEngineRuntimeConfig） */
export type MatchEngineConfig = MatchEngineRuntimeConfig & {
  /** 自动激活阈值（≥ 此值时自动激活技能） */
  autoActivateThreshold: number;
  /** 候选展示阈值（≥ 此值时展示候选列表） */
  candidateThreshold: number;
  /** 是否启用云端增强 */
  cloudEnhanced: boolean;
  /** 是否启用上下文感知 */
  contextAware: boolean;
  /** 是否启用模糊匹配 */
  fuzzyMatch: boolean;
};

/** 默认匹配引擎配置 */
export const DEFAULT_MATCH_ENGINE_CONFIG: MatchEngineConfig = {
  semanticWeight: 0.6,
  keywordWeight: 0.4,
  defaultThreshold: 0.3,
  defaultTopK: 10,
  cacheTtlMs: 300000,
  enableFeedbackLearning: true,
  contextWindowSize: 5,
  autoActivateThreshold: 0.7,
  candidateThreshold: 0.4,
  cloudEnhanced: false,
  contextAware: true,
  fuzzyMatch: true,
};

// ===================== API 函数 =====================

/**
 * 执行语义匹配查询
 * POST /api/matching/match
 */
export async function matchSkills(
  input: string,
  options?: {
    topK?: number;
    contextMessages?: string[];
    mode?: string;
    categoryFilter?: string[];
    excludeSkillIds?: string[];
    threshold?: number;
  },
): Promise<MatchResponse> {
  const body: Record<string, unknown> = {
    query: input,
    matchMode: options?.mode || 'hybrid',
  };
  if (options?.topK !== undefined) body.topK = options.topK;
  if (options?.threshold !== undefined) body.threshold = options.threshold;
  if (options?.categoryFilter) body.categoryFilter = options.categoryFilter;
  if (options?.excludeSkillIds) body.excludeSkillIds = options.excludeSkillIds;
  if (options?.contextMessages) body.contextMessages = options.contextMessages;

  return request<MatchResponse>('POST', '/api/matching/match', body);
}

/**
 * 重建所有嵌入向量
 * POST /api/matching/embeddings/rebuild
 */
export async function generateEmbeddings(): Promise<EmbeddingGenerateResult> {
  return request<EmbeddingGenerateResult>('POST', '/api/matching/embeddings/rebuild');
}

/**
 * 获取嵌入向量状态
 * GET /api/matching/status
 */
export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const raw = await request<{
    embeddingCount: number;
    modelName: string;
    dimensions: number;
    engineMode: string;
  }>('GET', '/api/matching/status');

  return {
    total: raw.embeddingCount,
    embedded: raw.embeddingCount,
    modelInfo: {
      name: raw.modelName,
      dimension: raw.dimensions,
      ready: raw.engineMode === 'onnx' || raw.engineMode === 'mock',
    },
  };
}

/**
 * 提交匹配反馈
 * POST /api/matching/feedback
 */
export async function submitMatchFeedback(feedback: MatchFeedback): Promise<void> {
  await request<{ id: number }>('POST', '/api/matching/feedback', feedback);
}

/**
 * 获取匹配引擎配置
 * GET /api/matching/config
 */
export async function getMatchConfig(): Promise<MatchEngineConfig> {
  try {
    const remoteConfig = await request<MatchEngineRuntimeConfig>('GET', '/api/matching/config');
    // 合并远程配置与默认前端扩展字段
    return {
      ...DEFAULT_MATCH_ENGINE_CONFIG,
      ...remoteConfig,
    };
  } catch {
    // 后端不可用时返回默认配置
    return { ...DEFAULT_MATCH_ENGINE_CONFIG };
  }
}

/**
 * 更新匹配引擎配置
 * PUT /api/matching/config
 */
export async function updateMatchConfig(config: Partial<MatchEngineConfig>): Promise<void> {
  // 仅发送后端识别的字段
  const backendFields: Partial<MatchEngineRuntimeConfig> = {};
  if (config.semanticWeight !== undefined) backendFields.semanticWeight = config.semanticWeight;
  if (config.keywordWeight !== undefined) backendFields.keywordWeight = config.keywordWeight;
  if (config.defaultThreshold !== undefined) backendFields.defaultThreshold = config.defaultThreshold;
  if (config.defaultTopK !== undefined) backendFields.defaultTopK = config.defaultTopK;
  if (config.cacheTtlMs !== undefined) backendFields.cacheTtlMs = config.cacheTtlMs;
  if (config.enableFeedbackLearning !== undefined) backendFields.enableFeedbackLearning = config.enableFeedbackLearning;
  if (config.contextWindowSize !== undefined) backendFields.contextWindowSize = config.contextWindowSize;

  await request<MatchEngineRuntimeConfig>('PUT', '/api/matching/config', backendFields);

  // 前端扩展字段保存到 localStorage
  const localFields: Record<string, unknown> = {};
  if (config.autoActivateThreshold !== undefined) localFields.autoActivateThreshold = config.autoActivateThreshold;
  if (config.candidateThreshold !== undefined) localFields.candidateThreshold = config.candidateThreshold;
  if (config.cloudEnhanced !== undefined) localFields.cloudEnhanced = config.cloudEnhanced;
  if (config.contextAware !== undefined) localFields.contextAware = config.contextAware;
  if (config.fuzzyMatch !== undefined) localFields.fuzzyMatch = config.fuzzyMatch;

  if (Object.keys(localFields).length > 0) {
    try {
      const existing = JSON.parse(localStorage.getItem('cdf-know-clow-match-config-local') || '{}');
    localStorage.setItem('cdf-know-clow-match-config-local', JSON.stringify({ ...existing, ...localFields }));
    } catch {
      // localStorage 不可用时静默忽略
    }
  }
}

/**
 * 重置匹配引擎配置为默认值
 * POST /api/matching/config/reset
 */
export async function resetMatchConfig(): Promise<void> {
  await request<MatchEngineRuntimeConfig>('POST', '/api/matching/config/reset');
  try {
    localStorage.removeItem('cdf-know-clow-match-config-local');
  } catch {
    // 静默忽略
  }
}

/**
 * 从 localStorage 读取前端扩展配置
 */
export function loadLocalMatchConfig(): Partial<MatchEngineConfig> {
  try {
    return JSON.parse(localStorage.getItem('cdf-know-clow-match-config-local') || '{}');
  } catch {
    return {};
  }
}
