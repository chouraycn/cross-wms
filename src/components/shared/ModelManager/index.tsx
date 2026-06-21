/**
 * ModelManager — 主入口组件
 *
 * 组合 ModelToolbar + ModelList + ModelSelectDialog + ModelEditDialog + DeleteConfirmDialog，
 * 提供统一的模型管理能力。
 *
 * 添加模型流程（分步式）：
 *   Step 1: ModelSelectDialog — 从预设列表选择模型
 *   Step 2: ModelEditDialog — 补全 API Key 等信息
 *
 * 本地模型发现：
 *   LocalModelDiscoverDialog — 自动扫描 Ollama/vLLM/LM Studio
 *
 * 健康监控：
 *   useModelHealth — 批量检测模型 API 可用性，状态指示灯
 */

import React, { useState } from 'react';
import { Box } from '@mui/material';
import { useModelManager } from './useModelManager';
import { useModelHealth } from './useModelHealth';
import ModelToolbar from './ModelToolbar';
import ModelList from './ModelList';
import ModelSelectDialog from './ModelSelectDialog';
import ModelEditDialog from './ModelEditDialog';
import LocalModelDiscoverDialog from './LocalModelDiscoverDialog';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import ConfirmDialog from './ConfirmDialog';
import ModelFilterBar from './ModelFilterBar';
import ModelBatchToolbar from './ModelBatchToolbar';
import TemplateDialog from './TemplateDialog';
import type { ModelManagerProps } from './types';
import type { ModelConfig } from '../../../types/models';
import type { DiscoveredLocalModel } from '../../../services/api';

const ModelManager: React.FC<ModelManagerProps> = (props) => {
  const { models, defaultModelId, variant = 'list' } = props;

  const { state, actions, handleImportFile, fileInputRef } = useModelManager(props);
  const { healthMap, isChecking, checkHealth, getModelStatus, getLatencyText, autoRefreshEnabled, toggleAutoRefresh, checkError } = useModelHealth();

  // 本地模型发现弹窗状态
  const [showDiscoverDialog, setShowDiscoverDialog] = useState(false);

  // 构建健康状态和延迟映射（供 ModelList 使用）
  const healthStatuses: Record<string, ReturnType<typeof getModelStatus>> = {};
  const healthLatencies: Record<string, number> = {};
  for (const model of models) {
    healthStatuses[model.id] = getModelStatus(model.id);
    const item = healthMap[model.id];
    if (item?.latency != null) {
      healthLatencies[model.id] = item.latency;
    }
  }

  // 从发现的本地模型批量添加
  const handleAddDiscoveredModels = (discovered: DiscoveredLocalModel[]) => {
    const newModels = discovered.map(m => ({
      id: m.id,
      name: m.name,
      provider: (m.provider as ModelConfig['provider']) || 'custom',
      apiEndpoint: m.apiEndpoint,
      apiKey: '',
      enabled: true,
      description: `本地模型 (${m.provider})${m.family ? ` · ${m.family}` : ''}`,
      contextWindow: m.contextWindow,
      capabilities: ['general' as const],
    }));
    // 合并到现有模型列表
    const existingIds = new Set(models.map(m => m.id));
    const toAdd = newModels.filter(m => !existingIds.has(m.id));
    if (toAdd.length > 0) {
      const merged = [...models, ...toAdd];
      props.onChange(merged, defaultModelId);
    }
    setShowDiscoverDialog(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: variant === 'table' ? '100%' : 'auto' }}>
      {/* 隐藏的文件 input（导入用） */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* 工具栏 */}
      <ModelToolbar
        variant={variant}
        defaultModelId={defaultModelId}
        models={models}
        onAdd={() => actions.openModelSelectDialog()}
        onReset={actions.handleResetToDefault}
        onExport={actions.handleExport}
        onImport={actions.handleImport}
        onTemplate={actions.openTemplateDialog}
        onHealthCheck={() => checkHealth(models)}
        isHealthChecking={isChecking}
        onDiscoverLocal={() => setShowDiscoverDialog(true)}
        autoRefreshEnabled={autoRefreshEnabled}
        onToggleAutoRefresh={toggleAutoRefresh}
        healthCheckError={checkError}
      />

      {/* 筛选栏 */}
      <ModelFilterBar
        searchQuery={state.searchQuery}
        selectedCapabilities={state.selectedCapabilities}
        onSearchChange={actions.setSearchQuery}
        onCapabilityToggle={actions.toggleCapabilityFilter}
        onClearFilters={actions.clearFilters}
      />

      {/* 批量操作工具栏 */}
      {state.selectedModelIds.length > 0 && (
        <ModelBatchToolbar
          selectedCount={state.selectedModelIds.length}
          totalCount={models.length}
          onSelectAll={actions.toggleSelectAll}
          onBatchEnable={actions.batchEnable}
          onBatchDisable={actions.batchDisable}
          onBatchDelete={actions.batchDelete}
        />
      )}

      {/* 模型列表（含健康状态指示灯） */}
      <ModelList
        models={models}
        defaultModelId={defaultModelId}
        variant={variant}
        actions={actions}
        selectedModelIds={state.selectedModelIds}
        searchQuery={state.searchQuery}
        selectedCapabilities={state.selectedCapabilities}
        healthStatuses={healthStatuses}
        healthLatencies={healthLatencies}
      />

      {/* Step 1: 模型选择弹窗 */}
      <ModelSelectDialog
        open={state.showModelSelectDialog}
        onClose={actions.closeModelSelectDialog}
        onSelect={actions.handlePresetSelect}
        existingModelIds={models.filter(m => !m.hidden).map(m => m.id)}
      />

      {/* Step 2: 补全信息 / 编辑弹窗 */}
      <ModelEditDialog state={state} actions={actions} />

      {/* 本地模型发现弹窗 */}
      <LocalModelDiscoverDialog
        open={showDiscoverDialog}
        onClose={() => setShowDiscoverDialog(false)}
        onAddModels={handleAddDiscoveredModels}
        existingModelIds={models.filter(m => !m.hidden).map(m => m.id)}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        target={state.deleteTarget}
        onConfirm={actions.confirmDelete}
        onCancel={actions.cancelDelete}
      />

      {/* 模板对话框 */}
      <TemplateDialog
        open={state.showTemplateDialog}
        onClose={actions.closeTemplateDialog}
        onApply={actions.applyTemplate}
      />

      {/* 通用确认对话框 */}
      <ConfirmDialog config={state.confirmDialog} />
    </Box>
  );
};

export default ModelManager;

// 同时导出类型和子组件，方便外部按需使用
export type { ModelManagerProps, ModelManagerVariant } from './types';
export { useModelManager } from './useModelManager';
export { useModelHealth } from './useModelHealth';
export { default as ModelToolbar } from './ModelToolbar';
export { default as ModelList } from './ModelList';
export { default as ModelSelectDialog } from './ModelSelectDialog';
export { default as ModelEditDialog } from './ModelEditDialog';
export { default as LocalModelDiscoverDialog } from './LocalModelDiscoverDialog';
export { default as DeleteConfirmDialog } from './DeleteConfirmDialog';
