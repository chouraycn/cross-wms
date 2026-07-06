import React from 'react';
import { Box, Typography, CircularProgress, Alert, Button, Divider, useTheme } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ModelManager from '../../shared/ModelManager';
import { useModels } from '../../../contexts/ModelsContext';
import { getGrayScale } from '../../../constants/theme';

const ModelManagement: React.FC = () => {
  const { models: modelList, defaultModelId, updateModels, isLoading, error, reload } = useModels();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1 }}>
        <CircularProgress size={20} />
        <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>正在加载模型配置...</Typography>
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
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 2 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: gs.textPrimary }}>
          我的模型
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
          已添加 {modelList.length} 个模型
        </Typography>
        <Divider sx={{ flex: 1, borderColor: gs.border }} />
      </Box>

      <ModelManager
        models={modelList}
        defaultModelId={defaultModelId}
        variant="list"
        onChange={(models, newDefaultModelId) => updateModels(models, newDefaultModelId)}
      />
    </Box>
  );
};

export default ModelManagement;
