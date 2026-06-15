import React from 'react';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ModelManager from '../../shared/ModelManager';
import { useModels } from '../../../contexts/ModelsContext';

const ModelManagement: React.FC = () => {
  const { models: modelList, defaultModelId, updateModels, isLoading, error, reload } = useModels();

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
