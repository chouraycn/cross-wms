/**
 * ModelManager 共享组件类型定义
 */

import type { Dispatch, SetStateAction } from 'react';
import type { ModelConfig, ModelProvider } from '../../../types/models';

/** 变体：控制 UI 布局 */
export type ModelManagerVariant = 'table' | 'list' | 'compact';

/** ModelManager 组件 Props */
export interface ModelManagerProps {
  /** 当前模型配置 */
  models: ModelConfig[];
  /** 当前默认模型 ID */
  defaultModelId: string;
  /** 变体模式：table=AISettingsDialog 样式，list=ModelManagement 样式，compact=SettingsModelManagement 样式 */
  variant?: ModelManagerVariant;
  /** 模型配置变更回调（含 defaultModelId） */
  onChange: (models: ModelConfig[], defaultModelId: string) => void;
  /** 是否紧凑模式（隐藏部分按钮/描述等） */
  compact?: boolean;
}

/** 模型表单字段类型（字符串化，保存时转 number） */
export interface ModelFormState {
  id: string;
  name: string;
  provider: ModelProvider;
  apiEndpoint: string;
  apiKey: string;
  enabled: boolean;
  description: string;
  contextWindow: string;
  maxTokens: string;
  temperature: string;
  topP: string;
  capabilities: string[];
}

/** 测试连接状态 */
export type TestStatus = 'idle' | 'testing' | 'success' | 'error';

/** 对话框模式 */
export type DialogMode = 'add' | 'edit' | null;

/** Hook 返回的状态 */
export interface ModelManagerState {
  modelForm: ModelFormState;
  modelFormErrors: Record<string, string>;
  modelDialogMode: DialogMode;
  editingModel: ModelConfig | null;
  testStatus: TestStatus;
  testMessage: string;
  deleteTarget: ModelConfig | null;
  showApiKey: boolean;
  /** 搜索关键词 */
  searchQuery: string;
  /** 选中的能力标签筛选 */
  selectedCapabilities: string[];
  /** 批量选中的模型 ID */
  selectedModelIds: string[];
  /** 是否显示模板对话框 */
  showTemplateDialog: boolean;
  /** 连接测试返回的可用模型列表 */
  testAvailableModels: string[];
  /** 连接测试返回的模型是否有效 */
  testModelValid: boolean;
}

/** Hook 返回的操作 */
export interface ModelManagerActions {
  openModelDialog: (mode: 'add' | 'edit', model?: ModelConfig) => void;
  closeModelDialog: () => void;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
  handleSaveModel: () => void;
  handleDeleteModel: (model: ModelConfig) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  handleSetDefaultModel: (modelId: string) => void;
  handleToggleModelEnabled: (modelId: string, enabled: boolean) => void;
  handleTestApi: () => void;
  handleResetToDefault: () => void;
  handleExport: () => void;
  handleImport: () => void;
  toggleApiKeyVisibility: () => void;
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void;
  /** 切换能力标签筛选 */
  toggleCapabilityFilter: (cap: string) => void;
  /** 清除所有筛选 */
  clearFilters: () => void;
  /** 切换模型批量选中 */
  toggleModelSelection: (modelId: string) => void;
  /** 全选/取消全选 */
  toggleSelectAll: () => void;
  /** 批量启用 */
  batchEnable: () => void;
  /** 批量禁用 */
  batchDisable: () => void;
  /** 批量删除 */
  batchDelete: () => void;
  /** 打开模板对话框 */
  openTemplateDialog: () => void;
  /** 关闭模板对话框 */
  closeTemplateDialog: () => void;
  /** 应用模板 */
  applyTemplate: (templateId: string) => void;
}

/** ModelList 组件 Props */
export interface ModelListProps {
  models: ModelConfig[];
  defaultModelId: string;
  variant: ModelManagerVariant;
  actions: Pick<
    ModelManagerActions,
    | 'openModelDialog'
    | 'handleDeleteModel'
    | 'handleSetDefaultModel'
    | 'handleToggleModelEnabled'
    | 'toggleModelSelection'
  >;
  /** 批量选中的模型 ID */
  selectedModelIds: string[];
  /** 搜索关键词 */
  searchQuery: string;
  /** 选中的能力标签 */
  selectedCapabilities: string[];
}

/** ModelEditDialog 组件 Props */
export interface ModelEditDialogProps {
  state: Pick<
    ModelManagerState,
    'modelForm' | 'modelFormErrors' | 'modelDialogMode' | 'editingModel' | 'testStatus' | 'testMessage' | 'showApiKey' | 'testAvailableModels' | 'testModelValid'
  >;
  actions: Pick<
    ModelManagerActions,
    'closeModelDialog' | 'setModelForm' | 'handleSaveModel' | 'handleTestApi' | 'toggleApiKeyVisibility'
  >;
}

/** DeleteConfirmDialog 组件 Props */
export interface DeleteConfirmDialogProps {
  target: ModelConfig | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** ModelToolbar 组件 Props */
export interface ModelToolbarProps {
  variant: ModelManagerVariant;
  defaultModelId: string;
  models: ModelConfig[];
  onAdd: () => void;
  onReset: () => void;
  onExport: () => void;
  onImport: () => void;
  onTemplate: () => void;
}
