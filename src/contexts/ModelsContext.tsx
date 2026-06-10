/**
 * ModelsContext — 独立的模型配置状态管理
 *
 * 职责：
 * - 管理模型列表和默认模型
 * - 从后端加载模型配置
 * - 保存模型配置到后端
 * - 与 AppSettingsContext 解耦
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
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

  /** 从后端加载模型配置 */
  const loadModels = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getModelsConfig();
      if (data && Array.isArray(data.models)) {
        // 过滤无效模型
        const validModels = data.models.filter(
          (m: any) => m && typeof m === 'object' && typeof m.id === 'string' && m.id.trim() && typeof m.name === 'string'
        );
        setModels(validModels);
        setDefaultModelId(data.defaultModelId || validModels[0]?.id || '');
      }
    } catch (e) {
      console.error('[ModelsContext] 加载模型配置失败:', e);
      setError(e instanceof Error ? e.message : '加载失败');
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

  const value: ModelsContextValue = {
    models,
    defaultModelId,
    isLoading,
    error,
    updateModels,
    reload: loadModels,
    getDefaultModel,
    getEnabledModels,
  };

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
};
