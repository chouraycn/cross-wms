import React from 'react';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ModelManager from '../shared/ModelManager';
import { useModels } from '../../contexts/ModelsContext';
import SystemAuthBanner from './SystemAuthBanner';

interface SettingsModelManagementProps {
  /** 点击「前往设置」时，切换到系统授权 Tab */
  onOpenSystemAuthorization?: () => void;
}

const SettingsModelManagement: React.FC<SettingsModelManagementProps> = ({ onOpenSystemAuthorization }) => {
  const { models: modelList, defaultModelId, updateModels, isLoading, error, reload } = useModels();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3, gap: 1 }}>
        <CircularProgress size={18} />
        <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280' }}>正在加载模型配置...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ mb: 1.5, borderRadius: 1.5, fontSize: '0.8125rem' }}
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
    <>
      <SystemAuthBanner onOpenSettings={onOpenSystemAuthorization} />
      <ModelManager
        models={modelList}
        defaultModelId={defaultModelId}
        variant="compact"
        onChange={(models, newDefaultModelId) => updateModels(models, newDefaultModelId)}
      />
    </>
  );
};

export default SettingsModelManagement;
