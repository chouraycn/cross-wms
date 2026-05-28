import React from 'react';
import { Box, Button, IconButton, Typography, LinearProgress } from '@mui/material';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import CloseIcon from '@mui/icons-material/Close';
import { useUpdateContext } from '../contexts/UpdateContext';

const UpdateNotification: React.FC = () => {
  const { updateStatus, showUpdateNotification, hideUpdateNotification, downloadUpdate } = useUpdateContext();

  if (!showUpdateNotification || !updateStatus?.releaseInfo) {
    return null;
  }

  const version = updateStatus.releaseInfo.version;
  const formattedVersion = version.replace(/^v/, '');

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9999,
        width: 320,
        backgroundColor: '#1a1a2e',
        borderRadius: 2,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24), 0 2px 8px rgba(0, 0, 0, 0.16)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        animation: 'slideUp 0.3s ease-out',
        '@keyframes slideUp': {
          from: { transform: 'translateY(100%)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 },
        },
      }}
    >
      {/* 顶部进度条装饰 */}
      <LinearProgress
        sx={{
          height: 3,
          backgroundColor: 'rgba(99, 102, 241, 0.2)',
          '& .MuiLinearProgress-bar': {
            backgroundColor: '#6366f1',
          },
        }}
      />

      <Box sx={{ p: 2 }}>
        {/* 头部：图标 + 标题 + 关闭按钮 */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 1.5,
              flexShrink: 0,
            }}
          >
            <SystemUpdateIcon sx={{ fontSize: 20, color: '#818cf8' }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#f1f5f9',
                lineHeight: 1.4,
                mb: 0.25,
              }}
            >
              发现新版本 V{formattedVersion}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                lineHeight: 1.4,
              }}
            >
              点击下载或稍后在设置中更新
            </Typography>
          </Box>

          <IconButton
            size="small"
            onClick={hideUpdateNotification}
            sx={{
              color: '#64748b',
              p: 0.5,
              ml: 1,
              '&:hover': {
                color: '#94a3b8',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* 版本信息 */}
        {updateStatus.releaseInfo.pubDate && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mb: 1.5,
              px: 1,
            }}
          >
            <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
              发布于 {updateStatus.releaseInfo.pubDate}
            </Typography>
          </Box>
        )}

        {/* 操作按钮 */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={downloadUpdate}
            sx={{
              backgroundColor: '#6366f1',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'none',
              py: 0.75,
              borderRadius: 1.5,
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: '#4f46e5',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
              },
            }}
          >
            下载更新
          </Button>
          <Button
            variant="outlined"
            onClick={hideUpdateNotification}
            sx={{
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
              fontWeight: 500,
              fontSize: '0.8rem',
              textTransform: 'none',
              py: 0.75,
              borderRadius: 1.5,
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.25)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          >
            稍后
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default UpdateNotification;
