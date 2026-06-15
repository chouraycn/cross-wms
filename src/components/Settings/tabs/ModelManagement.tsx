import React, { useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ModelManager from '../../shared/ModelManager';
import { useModels } from '../../../contexts/ModelsContext';

interface ModelManagementProps {
  /** 从 ApiKeyHelpPage 深度链接传入的预填 provider，触发自动打开添加对话框 */
  initialProvider?: string;
}

const ModelManagement: React.FC<ModelManagementProps> = ({ initialProvider }) => {
  const { models: modelList, defaultModelId, updateModels, isLoading, error, reload } = useModels();
  const triggeredRef = useRef(false);

  // 自动打开添加对话框（由 SettingsPanel 通过 initialProvider prop 传入）
  // 使用 DOM event 通知 ModelManager 内部的 useModelManager 打开对话框
  useEffect(() => {
    if (initialProvider && !triggeredRef.current && !isLoading) {
      triggeredRef.current = true;
      // 延迟触发，确保 ModelManager 和 useModelManager 已完成初始化
      const timer = setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('model-manager:open-with-provider', {
            detail: { provider: initialProvider },
          })
        );
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialProvider, isLoading]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1 }}>
        <CircularProgress size={20} />
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>正在加载模型配置...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ mb: 2, borderRadius: 1.5 }}
        action={
          <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => reload()}>
            重试
          </Button>
        }
      >
        加载模型配置失败：{error}
      </Alert>
    );
  }

  return (
    <ModelManager
      models={modelList}
      defaultModelId={defaultModelId}
      variant="list"
      onChange={(models, newDefaultModelId) => updateModels(models, newDefaultModelId)}
    />
  );
};

export default ModelManagement;
