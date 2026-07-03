/**
 * ModelsContext — 独立的模型配置状态管理
 *
 * 职责：
 * - 管理模型列表和默认模型
 * - 从后端加载模型配置
 * - 保存模型配置到后端
 * - 与 AppSettingsContext 解耦
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as api from '../services/api';
import type { ModelConfig, ModelsConfig } from '../types/models';

interface ModelsContextValue {
  /** 模型列表 */
  models: ModelConfig[];
  /** 默认模型 ID */
  defaultModelId: string;
  /** 是否加载中 */
  isLoading: boolean;
  /** 加载错误 */
  error: string | null;
  /** 推荐模型列表 */
  recommendedModels: ModelConfig[];
  /** 推荐模型是否加载中 */
  isLoadingRecommended: boolean;
  /** 是否为首次启动（模型列表为空） */
  isFirstLaunch: boolean;
  /** 更新模型配置 */
  updateModels: (models: ModelConfig[], defaultModelId?: string) => Promise<void>;
  /** 重新加载 */
  reload: () => Promise<void>;
  /** 获取默认模型配置 */
  getDefaultModel: () => ModelConfig | undefined;
  /** 获取已启用的模型列表 */
  getEnabledModels: () => ModelConfig[];
  /** 获取推荐模型列表 */
  fetchRecommendedModels: () => Promise<void>;
  /** 添加单个推荐模型 */
  addRecommendedModel: (modelId: string) => Promise<void>;
  /** 一键添加所有推荐模型 */
  addAllRecommendedModels: () => Promise<number>;
}

const ModelsContext = createContext<ModelsContextValue | null>(null);

export function useModels(): ModelsContextValue {
  const ctx = useContext(ModelsContext);
  if (!ctx) throw new Error('useModels must be used within ModelsProvider');
  return ctx;
}

/** localStorage 缓存键 */
const MODELS_CACHE_KEY = 'cross-wms:models-cache';
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存有效期

interface ModelsCachePayload {
  models: ModelConfig[];
  defaultModelId: string;
  timestamp: number;
}

/** 从 localStorage 读取缓存的模型配置（过期返回 null） */
function loadModelsFromCache(): ModelsCachePayload | null {
  try {
    const raw = localStorage.getItem(MODELS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelsCachePayload;
    if (!parsed || !Array.isArray(parsed.models)) return null;
    if (Date.now() - parsed.timestamp > MODELS_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 将模型配置写入 localStorage 缓存 */
function saveModelsToCache(models: ModelConfig[], defaultModelId: string): void {
  try {
    const payload: ModelsCachePayload = { models, defaultModelId, timestamp: Date.now() };
    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage 配额不足或不可用，忽略
  }
}

export const ModelsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 初始状态优先使用 localStorage 缓存，避免首屏空白
  const cached = typeof window !== 'undefined' ? loadModelsFromCache() : null;
  const [models, setModels] = useState<ModelConfig[]>(cached?.models ?? []);
  const [defaultModelId, setDefaultModelId] = useState(cached?.defaultModelId ?? '');
  const [isLoading, setIsLoading] = useState(!cached); // 有缓存时不显示加载态
  const [error, setError] = useState<string | null>(null);
  const [recommendedModels, setRecommendedModels] = useState<ModelConfig[]>([]);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const isFirstLoad = useRef(true);

  /** 从后端加载模型配置（含自动重试：后端可能尚未就绪，使用指数退避） */
  const loadModels = useCallback(async () => {
    // 减少重试次数从 8 → 4，缩短首屏等待
    const MAX_RETRIES = 4;
    const INITIAL_DELAY_MS = 500;
    const MAX_DELAY_MS = 5000;
    try {
      setIsLoading(true);
      setError(null);
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const data = await api.getModelsConfig();
          if (data && Array.isArray(data.models)) {
            // 过滤无效模型
            const validModels = data.models.filter(
              (m: any) => m && typeof m === 'object' && typeof m.id === 'string' && m.id.trim() && typeof m.name === 'string'
            );
            setModels(validModels);
            const dmid = data.defaultModelId || validModels[0]?.id || '';
            setDefaultModelId(dmid);
            // 写入 localStorage 缓存
            saveModelsToCache(validModels, dmid);
            lastError = null;
            break; // 成功，退出重试循环
          }
        } catch (e) {
          lastError = e;
          if (attempt < MAX_RETRIES) {
            // 指数退避：0.5s, 1s, 2s, 4s（上限 5s）
            const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      if (lastError != null) {
        const rawMsg = lastError instanceof Error ? lastError.message : String(lastError);
        setError(`${rawMsg}（后端服务可能尚未就绪，请稍后重试）`);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 保存模型配置到后端 */
  const updateModels = useCallback(async (newModels: ModelConfig[], newDefaultModelId?: string) => {
    const dmid = newDefaultModelId ?? defaultModelId;
    // 验证 defaultModelId 是否存在于新模型列表中
    const validatedDefaultId = newModels.some(m => m.id === dmid)
      ? dmid
      : (newModels.find(m => m.enabled)?.id || newModels[0]?.id || '');

    setModels(newModels);
    setDefaultModelId(validatedDefaultId);

    try {
      await api.saveModelsConfig(newModels, validatedDefaultId);
    } catch (e) {
      // console.error('[ModelsContext] 保存模型配置失败:', e);
      setError(e instanceof Error ? e.message : '保存失败');
      throw e;
    }
  }, [defaultModelId]);

  /** 获取默认模型 */
  const getDefaultModel = useCallback(() => {
    return models.find(m => m.id === defaultModelId);
  }, [models, defaultModelId]);

  /** 获取已启用的模型 */
  const getEnabledModels = useCallback(() => {
    return models.filter(m => m.enabled);
  }, [models]);

  /** 获取推荐模型列表 */
  const fetchRecommendedModels = useCallback(async () => {
    try {
      setIsLoadingRecommended(true);
      const data = await api.getRecommendedModels();
      if (Array.isArray(data)) {
        setRecommendedModels(data);
      }
    } catch (e) {
      console.warn('[ModelsContext] 获取推荐模型失败:', e);
    } finally {
      setIsLoadingRecommended(false);
    }
  }, []);

  /** 添加单个推荐模型 */
  const addRecommendedModel = useCallback(async (modelId: string) => {
    const result = await api.addRecommendedModel(modelId);
    if (result && Array.isArray(result.models)) {
      setModels(result.models);
      setDefaultModelId(result.defaultModelId || result.models[0]?.id || '');
    }
  }, []);

  /** 一键添加所有推荐模型 */
  const addAllRecommendedModels = useCallback(async (): Promise<number> => {
    const result = await api.addAllRecommendedModels();
    if (result && Array.isArray(result.models)) {
      setModels(result.models);
      setDefaultModelId(result.defaultModelId || result.models[0]?.id || '');
      setIsFirstLaunch(false);
    }
    return result.added || 0;
  }, []);

  /** 检查是否为首次启动 */
  const checkFirstLaunch = useCallback(async () => {
    try {
      const result = await api.checkIsFirstLaunch();
      setIsFirstLaunch(result.isFirstLaunch);
    } catch (e) {
      console.warn('[ModelsContext] 检查首次启动状态失败:', e);
    }
  }, []);

  // 初始加载 — 并行化三个请求，消除瀑布请求延迟
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      // 三个请求并行执行，不互相依赖
      Promise.all([
        loadModels(),
        fetchRecommendedModels(),
        checkFirstLaunch(),
      ]).catch(() => {
        // 各请求内部已有错误处理，此处仅防止 unhandled rejection
      });
    }
  }, [loadModels, fetchRecommendedModels, checkFirstLaunch]);

  const value = useMemo<ModelsContextValue>(() => ({
    models,
    defaultModelId,
    isLoading,
    error,
    recommendedModels,
    isLoadingRecommended,
    isFirstLaunch,
    updateModels,
    reload: loadModels,
    getDefaultModel,
    getEnabledModels,
    fetchRecommendedModels,
    addRecommendedModel,
    addAllRecommendedModels,
  }), [models, defaultModelId, isLoading, error, recommendedModels, isLoadingRecommended, isFirstLaunch, updateModels, loadModels, getDefaultModel, getEnabledModels, fetchRecommendedModels, addRecommendedModel, addAllRecommendedModels]);

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
};
