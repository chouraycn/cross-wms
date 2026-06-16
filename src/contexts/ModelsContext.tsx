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
  /** 更新模型配置 */
  updateModels: (models: ModelConfig[], defaultModelId?: string) => Promise<void>;
  /** 重新加载 */
  reload: () => Promise<void>;
  /** 获取默认模型配置 */
  getDefaultModel: () => ModelConfig | undefined;
  /** 获取已启用的模型列表 */
  getEnabledModels: () => ModelConfig[];
}

const ModelsContext = createContext<ModelsContextValue | null>(null);

export function useModels(): ModelsContextValue {
  const ctx = useContext(ModelsContext);
  if (!ctx) throw new Error('useModels must be used within ModelsProvider');
  return ctx;
}

export const ModelsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  /** 从后端加载模型配置（含自动重试：后端可能尚未就绪，使用指数退避） */
  const loadModels = useCallback(async () => {
    const MAX_RETRIES = 8;
    const INITIAL_DELAY_MS = 1000;
    const MAX_DELAY_MS = 10000;
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
            // RC-3: 检测所有模型均未启用的状态，避免前端误认为加载成功但无可选模型
            const enabledModels = validModels.filter((m: any) => m.enabled);
            if (validModels.length > 0 && enabledModels.length === 0) {
              console.warn('[ModelsContext] 所有模型均未启用，请在设置中启用至少一个模型');
            }
            setModels(validModels);
            setDefaultModelId(data.defaultModelId || validModels[0]?.id || '');
            lastError = null;
            break; // 成功，退出重试循环
          }
        } catch (e) {
          lastError = e;
          if (attempt < MAX_RETRIES) {
            // 指数退避：1s, 2s, 4s, 8s, 10s, 10s, 10s...
            const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
            console.warn(`[ModelsContext] 加载模型配置失败 (第${attempt}/${MAX_RETRIES}次)，${delay}ms后重试...`, e);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      if (lastError != null) {
        console.error('[ModelsContext] 加载模型配置失败（已重试' + MAX_RETRIES + '次）:', lastError);
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
      console.error('[ModelsContext] 保存模型配置失败:', e);
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

  // 初始加载
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      loadModels();
    }
  }, [loadModels]);

  const value = useMemo<ModelsContextValue>(() => ({
    models,
    defaultModelId,
    isLoading,
    error,
    updateModels,
    reload: loadModels,
    getDefaultModel,
    getEnabledModels,
  }), [models, defaultModelId, isLoading, error, updateModels, loadModels, getDefaultModel, getEnabledModels]);

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
};
