/**
 * ModelManager 共享组件类型定义
 */

import type { Dispatch, SetStateAction } from 'react';
import type { ModelConfig, ModelProvider, ModelCapability } from '../../../types/models';

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

/** 表单中的多 Key 项 */
export interface FormApiKeyEntry {
  label: string;
  key: string;
  enabled: boolean;
  /** 内部唯一 ID（用于 React key） */
  _uid?: string;
}

/** 模型表单字段类型（字符串化，保存时转 number） */
export interface ModelFormState {
  id: string;
  name: string;
  provider: ModelProvider;
  apiEndpoint: string;
  apiKey: string;
  apiKeyRef: string;
  apiKeys: FormApiKeyEntry[];
  apiKeyRefs: string[];
  keyStrategy: 'round-robin' | 'random' | 'failover';
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

/** 通用确认对话框配置 */
export interface ConfirmDialogConfig {
  /** 是否打开 */
  open: boolean;
  /** 对话框标题 */
  title: string;
  /** 对话框内容 */
  content: string;
  /** 确认按钮文本 */
  confirmText: string;
  /** 确认按钮颜色 */
  confirmColor?: 'error' | 'primary' | 'warning';
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

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
  /** 是否显示模型选择弹窗（Step 1） */
  showModelSelectDialog: boolean;
  /** 通用确认对话框配置 */
  confirmDialog: ConfirmDialogConfig;
}

/** Hook 返回的操作 */
export interface ModelManagerActions {
  openModelDialog: (mode: 'add' | 'edit', model?: ModelConfig) => void;
  /** 打开模型选择弹窗（Step 1） */
  openModelSelectDialog: () => void;
  /** 关闭模型选择弹窗 */
  closeModelSelectDialog: () => void;
  /** 从预设选择模型后填充表单 */
  handlePresetSelect: (preset: { id: string; name: string; provider: ModelProvider; description: string; contextWindow: number; maxTokens: number; capabilities: ModelCapability[] }) => void;
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
  /** 关闭确认对话框 */
  closeConfirmDialog: () => void;
}

/** ModelList 组件 Props */
export interface ModelListProps {
  models: ModelConfig[];
  defaultModelId: string;
  variant: ModelManagerVariant;
  actions: Pick<
    ModelManagerActions,
    | 'openModelDialog'
    | 'openModelSelectDialog'
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
  /** 健康状态映射 (modelId → status) */
  healthStatuses?: Record<string, 'healthy' | 'unhealthy' | 'timeout' | 'skipped' | 'unknown'>;
  /** 健康延迟映射 (modelId → latency ms) */
  healthLatencies?: Record<string, number>;
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

/** ConfirmDialog 通用确认对话框 Props */
export interface ConfirmDialogProps {
  config: ConfirmDialogConfig;
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
  /** 健康检测回调 */
  onHealthCheck?: () => void;
  /** 是否正在检测中 */
  isHealthChecking?: boolean;
  /** 发现本地模型回调 */
  onDiscoverLocal?: () => void;
  /** 是否启用自动刷新 */
  autoRefreshEnabled?: boolean;
  /** 切换自动刷新 */
  onToggleAutoRefresh?: () => void;
  /** 健康检查错误信息 */
  healthCheckError?: string | null;
}
