/**
 * ModelManager — 主入口组件
 *
 * 组合 ModelToolbar + ModelList + ModelEditDialog + DeleteConfirmDialog，
 * 提供统一的模型管理能力。
 *
 * 使用方式：
 *   // Context 模式（AISettingsDialog）
 *   const { settings, updateSettings } = useAppSettings();
 *   <ModelManager
 *     models={settings.models.models}
 *     defaultModelId={settings.models.defaultModelId}
 *     variant="table"
 *     onChange={(models, defaultModelId) => updateSettings({ models: { models, defaultModelId } })}
 *   />
 *
 *   // Draft 模式（ModelManagement / SettingsModelManagement）
 *   <ModelManager
 *     models={draft.models.models}
 *     defaultModelId={draft.models.defaultModelId}
 *     variant="list"
 *     onChange={(models, defaultModelId) => setDraft(prev => ({ ...prev, models: { ...prev.models, models, defaultModelId } }))}
 *   />
 */

import React from 'react';
import { Box } from '@mui/material';
import { useModelManager } from './useModelManager';
import ModelToolbar from './ModelToolbar';
import ModelList from './ModelList';
import ModelEditDialog from './ModelEditDialog';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import type { ModelManagerProps } from './types';

const ModelManager: React.FC<ModelManagerProps> = (props) => {
  const { models, defaultModelId, variant = 'list' } = props;

  const { state, actions, handleImportFile, fileInputRef } = useModelManager(props);

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
        onAdd={() => actions.openModelDialog('add')}
        onReset={actions.handleResetToDefault}
        onExport={actions.handleExport}
        onImport={actions.handleImport}
      />

      {/* 模型列表 */}
      <ModelList
        models={models}
        defaultModelId={defaultModelId}
        variant={variant}
        actions={actions}
      />

      {/* 编辑弹窗 */}
      <ModelEditDialog state={state} actions={actions} />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        target={state.deleteTarget}
        onConfirm={actions.confirmDelete}
        onCancel={actions.cancelDelete}
      />
    </Box>
  );
};

export default ModelManager;

// 同时导出类型和子组件，方便外部按需使用
export type { ModelManagerProps, ModelManagerVariant } from './types';
export { useModelManager } from './useModelManager';
export { default as ModelToolbar } from './ModelToolbar';
export { default as ModelList } from './ModelList';
export { default as ModelEditDialog } from './ModelEditDialog';
export { default as DeleteConfirmDialog } from './DeleteConfirmDialog';
