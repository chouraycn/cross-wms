import React, { useState, useEffect } from 'react';
import { Box, Button, IconButton, Typography, LinearProgress } from '@mui/material';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import CloseIcon from '@mui/icons-material/Close';
import { useUpdateContext } from '../contexts/UpdateContext';

const UpdateNotification: React.FC = () => {
  const { updateStatus, showUpdateNotification, isChecking, hideUpdateNotification, downloadUpdate } = useUpdateContext();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    // 延迟一帧触发入场动画
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // 检查中状态
  if (isChecking) {
    return (
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 9999,
          width: 320,
          backgroundColor: '#f8f8f8',
          borderRadius: 2,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
      >
        <LinearProgress
          sx={{
            height: 3,
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#3b82f6',
            },
          }}
        />
        <Box sx={{ p: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            正在检查更新...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!showUpdateNotification) {
    return null;
  }

  // 错误状态
  if (updateStatus?.error) {
    return (
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 9999,
          width: 320,
          backgroundColor: '#f8f8f8',
          borderRadius: 2,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            更新检查失败
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.5 }}>
            {updateStatus.error}
          </Typography>
          <Button
            size="small"
            onClick={hideUpdateNotification}
            sx={{ mt: 1, textTransform: 'none' }}
          >
            关闭
          </Button>
        </Box>
      </Box>
    );
  }

  if (!updateStatus?.releaseInfo) {
    return null;
  }

  const version = updateStatus.releaseInfo.version;
  const formattedVersion = version.replace(/^v/, '');

  // 安全格式化发布日期，防止乱码
  const formatPubDate = (pubDate: string): string => {
    if (!pubDate) return '';
    try {
      const date = new Date(pubDate);
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        return pubDate; // 返回原始字符串
      }
      // 格式化为本地日期字符串
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return pubDate; // 解析失败返回原始字符串
    }
  };

  const formattedPubDate = updateStatus.releaseInfo.pubDate
    ? formatPubDate(updateStatus.releaseInfo.pubDate)
    : '';

  // 橙色主题色
  const orangeMain = '#f97316';
  const orangeLight = 'rgba(249, 115, 22, 0.15)';
  const orangeDark = '#ea580c';

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9999,
        width: 320,
        backgroundColor: '#f8f8f8',
        borderRadius: 2,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        // v1.9.5-fix: 用 JS 驱动入场动画，避免 WKWebView 不兼容 CSS @keyframes
        transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(100%)',
      }}
    >
      {/* 顶部进度条装饰 */}
      <LinearProgress
        sx={{
          height: 3,
          backgroundColor: orangeLight,
          '& .MuiLinearProgress-bar': {
            backgroundColor: orangeMain,
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
              backgroundColor: orangeLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 1.5,
              flexShrink: 0,
            }}
          >
            <SystemUpdateIcon sx={{ fontSize: 20, color: orangeMain }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#111827',
                lineHeight: 1.4,
                mb: 0.25,
              }}
            >
              发现新版本 V{formattedVersion}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: '#6b7280',
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
              color: '#9ca3af',
              p: 0.5,
              ml: 1,
              '&:hover': {
                color: '#6b7280',
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* 版本信息 */}
        {formattedPubDate && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mb: 1.5,
              px: 1,
            }}
          >
            <Typography sx={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              发布于 {formattedPubDate}
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
              backgroundColor: orangeMain,
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'none',
              py: 0.75,
              borderRadius: 1.5,
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: orangeDark,
                boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)',
              },
            }}
          >
            下载更新
          </Button>
          <Button
            variant="outlined"
            onClick={hideUpdateNotification}
            sx={{
              borderColor: '#e5e7eb',
              color: '#6b7280',
              fontWeight: 500,
              fontSize: '0.8rem',
              textTransform: 'none',
              py: 0.75,
              borderRadius: 1.5,
              '&:hover': {
                borderColor: '#d1d5db',
                backgroundColor: 'rgba(0, 0, 0, 0.02)',
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
