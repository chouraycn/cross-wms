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
import { PROVIDER_ENDPOINTS } from '../../../../shared/data/providerEndpoints';
import type {
  ModelManagerProps,
  ModelFormState,
  ModelManagerState,
  ModelManagerActions,
  ConfirmDialogConfig,
} from './types';
import { PRESET_MODELS, type PresetModel } from './ModelSelectDialog';
import { modelToForm, formToModel } from './modelFormUtils';

/** 创建空白模型表单 */
function createEmptyForm(): ModelFormState {
  return {
    id: `model-${Date.now()}`,
    name: '',
    provider: 'openai',
    apiEndpoint: '',
    apiKey: '',
    apiKeyRef: '',
    apiKeys: [],
    apiKeyRefs: [],
    keyStrategy: 'round-robin',
    enabled: true,
    description: '',
    contextWindow: '',
    maxTokens: '',
    temperature: '1',
    topP: '1',
    capabilities: [],
  };
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
  const [showModelSelectDialog, setShowModelSelectDialog] = useState(false);
  /** 通用确认对话框状态 */
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig>({
    open: false,
    title: '',
    content: '',
    confirmText: '',
    confirmColor: 'primary',
    onConfirm: () => {},
    onCancel: () => {},
  });

  /** 隐藏的文件 input ref（用于导入） */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 关闭确认对话框 */
  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
  }, []);

  /** 打开确认对话框（辅助函数） */
  const openConfirmDialog = useCallback((config: Omit<ConfirmDialogConfig, 'open'>) => {
    setConfirmDialog({
      ...config,
      open: true,
    });
  }, []);

  // ---- 操作 ----

  /** 打开模型选择弹窗（Step 1） */
  const openModelSelectDialog = useCallback(() => {
    setShowModelSelectDialog(true);
  }, []);

  /** 关闭模型选择弹窗 */
  const closeModelSelectDialog = useCallback(() => {
    setShowModelSelectDialog(false);
  }, []);

  /** 从预设选择模型后，填充表单并进入 Step 2 */
  const handlePresetSelect = useCallback((preset: PresetModel) => {
    setShowModelSelectDialog(false);
    const endpoint = preset.provider === 'custom' ? '' : (PROVIDER_ENDPOINTS[preset.provider] || '');
    setModelDialogMode('add');
    setEditingModel(null);
    setModelForm({
      id: preset.id || `model-${Date.now()}`,
      name: preset.name || '',
      provider: preset.provider,
      apiEndpoint: endpoint,
      apiKey: '',
      apiKeyRef: '',
      apiKeys: [],
      apiKeyRefs: [],
      keyStrategy: 'round-robin',
      enabled: true,
      description: preset.description || '',
      contextWindow: preset.contextWindow ? String(preset.contextWindow) : '',
      maxTokens: preset.maxTokens ? String(preset.maxTokens) : '',
      temperature: '1',
      topP: '1',
      capabilities: preset.capabilities || [],
    });
    setModelFormErrors({});
    setTestStatus('idle');
    setTestMessage('');
  }, []);

  /** 打开模型对话框（编辑模式直接打开，添加模式已改为先选模型） */
  const openModelDialog = useCallback((mode: 'add' | 'edit', model?: ModelConfig) => {
    if (mode === 'edit' && model) {
      setModelDialogMode(mode);
      setEditingModel(model);
      setModelForm(modelToForm(model));
      setModelFormErrors({});
      setTestStatus('idle');
      setTestMessage('');
    }
    // add 模式现在通过 openModelSelectDialog -> handlePresetSelect 触发
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
    } else if (
      modelDialogMode === 'add' && models.some((m) => m.id === modelForm.id.trim())
    ) {
      errs['model.id'] = 'ID 已存在';
    } else if (
      modelDialogMode === 'edit' &&
      editingModel &&
      modelForm.id.trim() !== editingModel.id &&
      models.some((m) => m.id === modelForm.id.trim())
    ) {
      errs['model.id'] = 'ID 已存在';
    }
    if (!modelForm.name.trim()) {
      errs['model.name'] = '名称不能为空';
    }
    if (modelForm.provider === 'custom' && !modelForm.apiEndpoint.trim()) {
      errs['model.apiEndpoint'] = '自定义提供商必须填写 API 端点';
    } else if (modelForm.apiEndpoint.trim() && !modelForm.apiEndpoint.trim().startsWith('http')) {
      errs['model.apiEndpoint'] = 'API 端点必须以 http:// 或 https:// 开头';
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

    const modelData = formToModel(modelForm, editingModel);

    let newModels: ModelConfig[];
    if (modelDialogMode === 'edit' && editingModel) {
      newModels = models.map((m) =>
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
    onChange(models, modelId);
  }, [models, onChange]);

  /** 切换模型启用状态 */
  const handleToggleModelEnabled = useCallback((modelId: string, enabled: boolean) => {
    const newModels = models.map(m =>
      m.id === modelId ? { ...m, enabled } : m
    );
    onChange(newModels, defaultModelId);
  }, [models, defaultModelId, onChange]);

  /** 测试 API 连接（支持多 Key 轮询测试） */
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

      const modelId = modelForm.id.trim() || modelForm.name.trim() || 'test';

      // 收集所有待测试的 Key（多 Key 优先）
      const keysToTest: { key: string; label: string }[] = [];
      const activeMultiKeys = (modelForm.apiKeys || []).filter((k) => k.enabled && k.key.trim());
      if (activeMultiKeys.length > 0) {
        for (const k of activeMultiKeys) {
          keysToTest.push({ key: k.key.trim(), label: k.label || 'Key' });
        }
      } else if (modelForm.apiKey.trim()) {
        keysToTest.push({ key: modelForm.apiKey.trim(), label: 'API Key' });
      }

      // 本地模型（Ollama）不需要 API Key，直接测试连接
      const isLocal = modelForm.provider === 'ollama'
        || endpoint.includes('localhost')
        || endpoint.includes('127.0.0.1')
        || endpoint.includes('0.0.0.0');

      if (keysToTest.length === 0 && !isLocal) {
        setTestStatus('error');
        setTestMessage('请先填写 API Key');
        return;
      }

      // 本地模型无 Key 时，用空字符串测试
      if (keysToTest.length === 0 && isLocal) {
        keysToTest.push({ key: '', label: '本地模型' });
      }

      // 逐个测试每个 Key
      const results: { label: string; success: boolean; message: string; models?: string[]; modelValid?: boolean }[] = [];
      let anySuccess = false;
      let allModels: string[] = [];

      for (const { key, label } of keysToTest) {
        try {
          const result = await api.testModelConnection(endpoint, key, modelId);
          results.push({ label, success: result.success, message: result.message || '', models: result.models, modelValid: result.modelValid });
          if (result.success) {
            anySuccess = true;
            if (result.models && Array.isArray(result.models)) {
              allModels = [...new Set([...allModels, ...result.models])];
            }
            if (typeof result.modelValid === 'boolean' && result.modelValid) {
              setTestModelValid(true);
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : '网络错误';
          results.push({ label, success: false, message: msg });
        }
      }

      // 汇总结果
      if (keysToTest.length === 1) {
        const r = results[0];
        setTestStatus(r.success ? 'success' : 'error');
        setTestMessage(r.message);
        if (r.models) setTestAvailableModels(r.models);
        if (typeof r.modelValid === 'boolean') setTestModelValid(r.modelValid);
      } else {
        const successCount = results.filter((r) => r.success).length;
        setTestStatus(anySuccess ? 'success' : 'error');
        const summary = results.map((r) => `${r.label}: ${r.success ? '✅' : '❌'} ${r.message}`).join('\n');
        setTestMessage(`测试完成 ${successCount}/${keysToTest.length} 个 Key 通过\n${summary}`);
        if (allModels.length > 0) setTestAvailableModels(allModels);
      }
    } catch (e: unknown) {
      setTestStatus('error');
      const msg = e instanceof Error ? e.message : '网络错误，无法连接';
      setTestMessage(msg);
    }
  }, [modelForm]);

  /** 恢复默认模型配置（F5） — 需要用户确认 */
  const handleResetToDefault = useCallback(() => {
    openConfirmDialog({
      title: '恢复默认配置',
      content: '确定要恢复默认模型配置吗？\n\n这将清除所有自定义模型和 API Key 配置，此操作不可撤销。',
      confirmText: '恢复',
      confirmColor: 'warning',
      onConfirm: async () => {
        closeConfirmDialog();
        try {
          const result = await api.resetModelsConfig();
          onChange(result.models, result.defaultModelId);
        } catch (e: unknown) {
          console.error('[ModelManager] resetModelsConfig failed:', e);
          openConfirmDialog({
            title: '恢复失败',
            content: e instanceof Error ? e.message : '恢复默认配置失败，请稍后重试',
            confirmText: '确定',
            confirmColor: 'primary',
            onConfirm: closeConfirmDialog,
            onCancel: closeConfirmDialog,
          });
        }
      },
      onCancel: closeConfirmDialog,
    });
  }, [onChange, openConfirmDialog, closeConfirmDialog]);

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
            openConfirmDialog({
              title: '导入失败',
              content: '文件读取失败',
              confirmText: '确定',
              confirmColor: 'primary',
              onConfirm: closeConfirmDialog,
              onCancel: closeConfirmDialog,
            });
            return;
          }
          const data = JSON.parse(text);
          const validation = validateImportPayload(data);
          if (!validation.valid) {
            openConfirmDialog({
              title: '导入失败',
              content: `导入失败：${validation.error}`,
              confirmText: '确定',
              confirmColor: 'primary',
              onConfirm: closeConfirmDialog,
              onCancel: closeConfirmDialog,
            });
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
          openConfirmDialog({
            title: '导入失败',
            content: '文件解析失败，请确保是有效的 JSON 文件',
            confirmText: '确定',
            confirmColor: 'primary',
            onConfirm: closeConfirmDialog,
            onCancel: closeConfirmDialog,
          });
        }
      };
      reader.readAsText(file);
    },
    [onChange, openConfirmDialog, closeConfirmDialog],
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

  /** 批量删除 — 需要用户确认 */
  const handleBatchDelete = useCallback(() => {
    if (selectedModelIds.length === 0) return;
    openConfirmDialog({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedModelIds.length} 个模型吗？\n\n此操作不可撤销。`,
      confirmText: '删除',
      confirmColor: 'error',
      onConfirm: () => {
        closeConfirmDialog();
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
      },
      onCancel: closeConfirmDialog,
    });
  }, [selectedModelIds, models, defaultModelId, onChange, openConfirmDialog, closeConfirmDialog]);

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
    // 先计算新模型列表
    let newModels: ModelConfig[];
    switch (templateId) {
      case 'domestic':
        newModels = models.map(m => ({
          ...m,
          enabled: ['tencent', 'qwen', 'deepseek'].includes(m.provider),
        }));
        break;
      case 'overseas':
        newModels = models.map(m => ({
          ...m,
          enabled: ['openai', 'anthropic', 'google'].includes(m.provider),
        }));
        break;
      case 'cost-effective':
        newModels = models.map(m => ({
          ...m,
          enabled: m.capabilities?.includes('costEffective') || m.capabilities?.includes('fast') || false,
        }));
        break;
      case 'high-performance':
        newModels = models.map(m => ({
          ...m,
          enabled: m.capabilities?.includes('reasoning') || m.capabilities?.includes('multimodal') || false,
        }));
        break;
      case 'coding':
        newModels = models.map(m => ({
          ...m,
          enabled: m.capabilities?.includes('code') || false,
        }));
        break;
      default:
        return;
    }

    // 基于新模型列表计算 defaultModelId（选择第一个启用的模型）
    const newDefaultModelId = newModels.find(m => m.enabled)?.id || newModels[0]?.id || '';

    onChange(newModels, newDefaultModelId);
    setShowTemplateDialog(false);
    setSelectedModelIds([]);
  }, [models, onChange]);

  /** 重新排序模型列表（拖拽后调用） */
  const handleReorderModels = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= models.length) return;
    if (toIndex < 0 || toIndex >= models.length) return;
    const newModels = [...models];
    const [moved] = newModels.splice(fromIndex, 1);
    newModels.splice(toIndex, 0, moved);
    onChange(newModels, defaultModelId);
  }, [models, defaultModelId, onChange]);

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
    showModelSelectDialog,
    confirmDialog,
  };

  const actions: ModelManagerActions = {
    openModelDialog,
    openModelSelectDialog,
    closeModelSelectDialog,
    handlePresetSelect,
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
    reorderModels: handleReorderModels,
    closeConfirmDialog,
  };

  return { state, actions, handleImportFile, fileInputRef };
}
