/**
 * useModelManager — ModelManager 核心 Hook
 *
 * 统一管理模型 CRUD、测试连接、删除确认、API Key 可见性、
 * 恢复默认、导出/导入等所有状态与操作。
 *
 * 设计关键：Hook 接收 models/defaultModelId/onChange，
 * 不关心上层是 Context 还是 draft 模式。
 */

import React, { useState, useCallback, useRef } from 'react';
import type { ModelConfig } from '../../../types/models';
import * as api from '../../../services/api';
import { PROVIDER_ENDPOINTS } from './styles';
import type {
  ModelManagerProps,
  ModelFormState,
  ModelManagerState,
  ModelManagerActions,
} from './types';

/** 创建空白模型表单 */
function createEmptyForm(): ModelFormState {
  return {
    id: `model-${Date.now()}`,
    name: '',
    provider: 'openai',
    apiEndpoint: '',
    apiKey: '',
    enabled: true,
    description: '',
    contextWindow: '',
    maxTokens: '',
    temperature: '1',
    topP: '1',
    capabilities: [],
  };
}

/** 将 ModelConfig 转为 ModelFormState */
function modelToForm(model: ModelConfig): ModelFormState {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    apiEndpoint: model.apiEndpoint || '',
    apiKey: model.apiKey || '',
    enabled: model.enabled,
    description: model.description || '',
    contextWindow: model.contextWindow?.toString() || '',
    maxTokens: model.maxTokens?.toString() || '',
    temperature: model.temperature?.toString() ?? '1',
    topP: model.topP?.toString() ?? '1',
    capabilities: model.capabilities || [],
  };
}

/** 将 ModelFormState 转为 ModelConfig（验证通过后调用） */
function formToModel(form: ModelFormState): ModelConfig {
  const model: ModelConfig = {
    id: form.id.trim(),
    name: form.name.trim(),
    provider: form.provider,
    enabled: form.enabled,
    description: form.description.trim() || undefined,
    contextWindow: form.contextWindow ? Number(form.contextWindow) : undefined,
    maxTokens: form.maxTokens ? Number(form.maxTokens) : undefined,
    temperature: form.temperature ? Number(form.temperature) : undefined,
    topP: form.topP ? Number(form.topP) : undefined,
    capabilities: form.capabilities.length > 0 ? form.capabilities as any : undefined,
  };
  if (form.apiEndpoint.trim()) {
    model.apiEndpoint = form.apiEndpoint.trim();
  }
  if (form.apiKey.trim()) {
    model.apiKey = form.apiKey.trim();
  }
  return model;
}

/** 导入文件 JSON 的校验结构 */
interface ImportPayload {
  models: unknown[];
  defaultModelId: unknown;
}

/** 校验导入 JSON 结构是否合法 */
function validateImportPayload(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '文件内容格式不正确，必须为 JSON 对象' };
  }
  const obj = data as ImportPayload;
  if (!Array.isArray(obj.models)) {
    return { valid: false, error: '缺少 models 数组字段' };
  }
  if (typeof obj.defaultModelId !== 'string' || !obj.defaultModelId) {
    return { valid: false, error: '缺少 defaultModelId 字段' };
  }
  for (let i = 0; i < obj.models.length; i++) {
    const m = obj.models[i] as Record<string, unknown> | undefined;
    if (!m || typeof m !== 'object') {
      return { valid: false, error: `models[${i}] 不是有效对象` };
    }
    if (typeof m.id !== 'string' || !m.id) {
      return { valid: false, error: `models[${i}].id 缺失或为空` };
    }
    if (typeof m.name !== 'string' || !m.name) {
      return { valid: false, error: `models[${i}].name 缺失或为空` };
    }
    if (typeof m.provider !== 'string') {
      return { valid: false, error: `models[${i}].provider 缺失` };
    }
  }
  return { valid: true };
}

/** 扩展返回类型（包含文件处理） */
export interface UseModelManagerReturn {
  state: ModelManagerState;
  actions: ModelManagerActions;
  handleImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

/**
 * ModelManager 核心 Hook
 */
export function useModelManager(props: ModelManagerProps): UseModelManagerReturn {
  const { models, defaultModelId, onChange } = props;

  // ---- 状态 ----
  const [modelForm, setModelForm] = useState<ModelFormState>(createEmptyForm);
  const [modelFormErrors, setModelFormErrors] = useState<Record<string, string>>({});
  const [modelDialogMode, setModelDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ModelConfig | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [testAvailableModels, setTestAvailableModels] = useState<string[]>([]);
  const [testModelValid, setTestModelValid] = useState(false);

  /** 隐藏的文件 input ref（用于导入） */
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- 操作 ----

  /** 打开模型对话框 */
  const openModelDialog = useCallback((mode: 'add' | 'edit', model?: ModelConfig) => {
    setModelDialogMode(mode);
    if (mode === 'edit' && model) {
      setEditingModel(model);
      setModelForm(modelToForm(model));
    } else {
      setEditingModel(null);
      setModelForm(createEmptyForm());
    }
    setModelFormErrors({});
    setTestStatus('idle');
    setTestMessage('');
  }, []);

  /** 关闭模型对话框 */
  const closeModelDialog = useCallback(() => {
    setModelDialogMode(null);
    setEditingModel(null);
    setModelFormErrors({});
    setTestStatus('idle');
    setTestMessage('');
  }, []);

  /** 保存模型 */
  const handleSaveModel = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!modelForm.id.trim()) {
      errs['model.id'] = 'ID 不能为空';
    } else if (modelDialogMode === 'add' && models.some(m => m.id === modelForm.id.trim())) {
      errs['model.id'] = 'ID 已存在';
    }
    if (!modelForm.name.trim()) {
      errs['model.name'] = '名称不能为空';
    }
    if (modelForm.contextWindow && isNaN(Number(modelForm.contextWindow))) {
      errs['model.contextWindow'] = '必须是数字';
    }
    if (modelForm.maxTokens && isNaN(Number(modelForm.maxTokens))) {
      errs['model.maxTokens'] = '必须是数字';
    }
    if (modelForm.temperature && isNaN(Number(modelForm.temperature))) {
      errs['model.temperature'] = '必须是数字';
    } else if (modelForm.temperature) {
      const temp = Number(modelForm.temperature);
      if (temp < 0 || temp > 2) {
        errs['model.temperature'] = '范围 0-2';
      }
    }
    if (modelForm.topP && isNaN(Number(modelForm.topP))) {
      errs['model.topP'] = '必须是数字';
    } else if (modelForm.topP) {
      const topPVal = Number(modelForm.topP);
      if (topPVal < 0 || topPVal > 1) {
        errs['model.topP'] = '范围 0-1';
      }
    }
    setModelFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const modelData = formToModel(modelForm);

    let newModels: ModelConfig[];
    if (modelDialogMode === 'edit' && editingModel) {
      newModels = models.map(m =>
        m.id === editingModel.id ? { ...m, ...modelData, id: modelForm.id.trim() } : m
      );
    } else {
      newModels = [...models, modelData];
    }
    onChange(newModels, defaultModelId);
    closeModelDialog();
  }, [modelForm, modelDialogMode, editingModel, models, defaultModelId, onChange, closeModelDialog]);

  /** 请求删除模型（弹出确认框） */
  const handleDeleteModel = useCallback((model: ModelConfig) => {
    setDeleteTarget(model);
  }, []);

  /** 确认删除 */
  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const newModels = models.filter(m => m.id !== deleteTarget.id);
    let newDefaultId = defaultModelId;
    if (deleteTarget.id === defaultModelId && newModels.length > 0) {
      const firstEnabled = newModels.find(m => m.enabled);
      newDefaultId = firstEnabled ? firstEnabled.id : newModels[0].id;
    }
    if (newModels.length === 0) {
      newDefaultId = '';
    }
    onChange(newModels, newDefaultId);
    setDeleteTarget(null);
  }, [deleteTarget, models, defaultModelId, onChange]);

  /** 取消删除 */
  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  /** 设置默认模型 */
  const handleSetDefaultModel = useCallback((modelId: string) => {
    const newModels = models.map(m => ({
      ...m,
      isDefault: m.id === modelId,
    }));
    onChange(newModels, modelId);
  }, [models, onChange]);

  /** 切换模型启用状态 */
  const handleToggleModelEnabled = useCallback((modelId: string, enabled: boolean) => {
    const newModels = models.map(m =>
      m.id === modelId ? { ...m, enabled } : m
    );
    onChange(newModels, defaultModelId);
  }, [models, defaultModelId, onChange]);

  /** 测试 API 连接 */
  const handleTestApi = useCallback(async () => {
    setTestStatus('testing');
    setTestMessage('');
    setTestAvailableModels([]);
    setTestModelValid(false);
    try {
      const endpoint =
        modelForm.provider === 'custom'
          ? modelForm.apiEndpoint.trim()
          : PROVIDER_ENDPOINTS[modelForm.provider] || '';
      if (!endpoint && modelForm.provider === 'custom') {
        setTestStatus('error');
        setTestMessage('请先填写 API 端点');
        return;
      }
      const result = await api.testModelConnection(
        endpoint,
        modelForm.apiKey.trim(),
        modelForm.id.trim() || modelForm.name.trim() || 'test',
      );
      if (result.success) {
        setTestStatus('success');
        setTestMessage(result.message || '连接成功');
        // 捕获可用模型列表和验证结果
        if (result.models && Array.isArray(result.models)) {
          setTestAvailableModels(result.models);
        }
        if (typeof result.modelValid === 'boolean') {
          setTestModelValid(result.modelValid);
        }
      } else {
        setTestStatus('error');
        setTestMessage(result.message || '连接失败');
      }
    } catch (e: unknown) {
      setTestStatus('error');
      const msg = e instanceof Error ? e.message : '网络错误，无法连接';
      setTestMessage(msg);
    }
  }, [modelForm]);

  /** 恢复默认模型配置（F5） */
  const handleResetToDefault = useCallback(async () => {
    try {
      const result = await api.resetModelsConfig();
      onChange(result.models, result.defaultModelId);
    } catch (e: unknown) {
      console.error('[ModelManager] resetModelsConfig failed:', e);
    }
  }, [onChange]);

  /** 导出模型配置为 JSON 文件（F6） */
  const handleExport = useCallback(() => {
    const payload = {
      models,
      defaultModelId,
      exportedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `cdf-know-clow-models-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [models, defaultModelId]);

  /** 触发文件选择器（导入） */
  const handleImport = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  /** 处理导入文件读取（由 index.tsx 中的 hidden input onChange 调用） */
  const handleImportFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result;
          if (typeof text !== 'string') {
            alert('文件读取失败');
            return;
          }
          const data = JSON.parse(text);
          const validation = validateImportPayload(data);
          if (!validation.valid) {
            alert(`导入失败：${validation.error}`);
            return;
          }
          const imported = data as { models: ModelConfig[]; defaultModelId: string };
          // 确保 enabled 字段存在
          const normalizedModels = imported.models.map(m => ({
            ...m,
            enabled: m.enabled ?? true,
            provider: m.provider ?? 'custom',
          }));
          onChange(normalizedModels, imported.defaultModelId);
        } catch {
          alert('文件解析失败，请确保是有效的 JSON 文件');
        }
      };
      reader.readAsText(file);
    },
    [onChange],
  );

  /** 切换 API Key 可见性 */
  const toggleApiKeyVisibility = useCallback(() => {
    setShowApiKey(prev => !prev);
  }, []);

  /** 设置搜索关键词 */
  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  /** 切换能力标签筛选 */
  const handleToggleCapabilityFilter = useCallback((cap: string) => {
    setSelectedCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  }, []);

  /** 清除所有筛选 */
  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCapabilities([]);
  }, []);

  /** 切换模型批量选中 */
  const handleToggleModelSelection = useCallback((modelId: string) => {
    setSelectedModelIds(prev =>
      prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]
    );
  }, []);

  /** 全选/取消全选 */
  const handleToggleSelectAll = useCallback(() => {
    if (selectedModelIds.length === models.length) {
      setSelectedModelIds([]);
    } else {
      setSelectedModelIds(models.map(m => m.id));
    }
  }, [selectedModelIds, models]);

  /** 批量启用 */
  const handleBatchEnable = useCallback(() => {
    const newModels = models.map(m =>
      selectedModelIds.includes(m.id) ? { ...m, enabled: true } : m
    );
    onChange(newModels, defaultModelId);
    setSelectedModelIds([]);
  }, [selectedModelIds, models, defaultModelId, onChange]);

  /** 批量禁用 */
  const handleBatchDisable = useCallback(() => {
    const newModels = models.map(m =>
      selectedModelIds.includes(m.id) ? { ...m, enabled: false } : m
    );
    onChange(newModels, defaultModelId);
    setSelectedModelIds([]);
  }, [selectedModelIds, models, defaultModelId, onChange]);

  /** 批量删除 */
  const handleBatchDelete = useCallback(() => {
    const newModels = models.filter(m => !selectedModelIds.includes(m.id));
    let newDefaultId = defaultModelId;
    if (selectedModelIds.includes(defaultModelId) && newModels.length > 0) {
      const firstEnabled = newModels.find(m => m.enabled);
      newDefaultId = firstEnabled ? firstEnabled.id : newModels[0].id;
    }
    if (newModels.length === 0) {
      newDefaultId = '';
    }
    onChange(newModels, newDefaultId);
    setSelectedModelIds([]);
  }, [selectedModelIds, models, defaultModelId, onChange]);

  /** 打开模板对话框 */
  const handleOpenTemplateDialog = useCallback(() => {
    setShowTemplateDialog(true);
  }, []);

  /** 关闭模板对话框 */
  const handleCloseTemplateDialog = useCallback(() => {
    setShowTemplateDialog(false);
  }, []);

  /** 应用模板 */
  const handleApplyTemplate = useCallback((templateId: string) => {
    // 预置模板
    const templates: Record<string, { models: ModelConfig[]; defaultModelId: string }> = {
      'domestic': {
        models: models.map(m => ({
          ...m,
          enabled: ['tencent', 'qwen', 'deepseek'].includes(m.provider),
        })),
        defaultModelId: models.find(m => m.provider === 'tencent' && m.enabled)?.id || models[0]?.id || '',
      },
      'overseas': {
        models: models.map(m => ({
          ...m,
          enabled: ['openai', 'anthropic', 'google'].includes(m.provider),
        })),
        defaultModelId: models.find(m => m.provider === 'openai' && m.enabled)?.id || models[0]?.id || '',
      },
      'cost-effective': {
        models: models.map(m => ({
          ...m,
          enabled: m.capabilities?.includes('costEffective') || m.capabilities?.includes('fast') || false,
        })),
        defaultModelId: models.find(m => m.capabilities?.includes('costEffective'))?.id || models[0]?.id || '',
      },
      'high-performance': {
        models: models.map(m => ({
          ...m,
          enabled: m.capabilities?.includes('reasoning') || m.capabilities?.includes('multimodal') || false,
        })),
        defaultModelId: models.find(m => m.capabilities?.includes('reasoning'))?.id || models[0]?.id || '',
      },
      'coding': {
        models: models.map(m => ({
          ...m,
          enabled: m.capabilities?.includes('code') || false,
        })),
        defaultModelId: models.find(m => m.capabilities?.includes('code'))?.id || models[0]?.id || '',
      },
    };

    const template = templates[templateId];
    if (template) {
      onChange(template.models, template.defaultModelId);
    }
    setShowTemplateDialog(false);
    setSelectedModelIds([]);
  }, [models, onChange]);

  // ---- 组装返回 ----
  const state: ModelManagerState = {
    modelForm,
    modelFormErrors,
    modelDialogMode,
    editingModel,
    testStatus,
    testMessage,
    deleteTarget,
    showApiKey,
    searchQuery,
    selectedCapabilities,
    selectedModelIds,
    showTemplateDialog,
    testAvailableModels,
    testModelValid,
  };

  const actions: ModelManagerActions = {
    openModelDialog,
    closeModelDialog,
    setModelForm,
    handleSaveModel,
    handleDeleteModel,
    confirmDelete,
    cancelDelete,
    handleSetDefaultModel,
    handleToggleModelEnabled,
    handleTestApi,
    handleResetToDefault,
    handleExport,
    handleImport,
    toggleApiKeyVisibility,
    setSearchQuery: handleSetSearchQuery,
    toggleCapabilityFilter: handleToggleCapabilityFilter,
    clearFilters: handleClearFilters,
    toggleModelSelection: handleToggleModelSelection,
    toggleSelectAll: handleToggleSelectAll,
    batchEnable: handleBatchEnable,
    batchDisable: handleBatchDisable,
    batchDelete: handleBatchDelete,
    openTemplateDialog: handleOpenTemplateDialog,
    closeTemplateDialog: handleCloseTemplateDialog,
    applyTemplate: handleApplyTemplate,
  };

  return { state, actions, handleImportFile, fileInputRef };
}
