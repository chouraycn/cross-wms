/**
 * ErrorBlock — 错误状态卡片组件
 * 在消息渲染中展示查询或生成过程中的错误信息
 */
import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface ErrorBlockProps {
  /** 错误描述信息 */
  error: string;
  /** 错误码（可选） */
  errorCode?: string;
  /** 重试回调（可选） */
  onRetry?: () => void;
}

export function ErrorBlock({ error, errorCode, onRetry }: ErrorBlockProps) {
  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: '8px',
        bgcolor: '#FEF2F2',
        borderLeft: '4px solid #EF4444',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ErrorOutlineIcon sx={{ fontSize: 20, color: '#EF4444' }} />
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: '#B91C1C',
          }}
        >
          出错了
        </Typography>
      </Box>

      <Typography sx={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6 }}>
        {error}
      </Typography>

      {errorCode && (
        <Typography
          sx={{
            fontSize: 11,
            color: '#991B1B',
            fontFamily: 'monospace',
            bgcolor: '#FEE2E2',
            px: 1,
            py: 0.5,
            borderRadius: '4px',
            display: 'inline-block',
            alignSelf: 'flex-start',
          }}
        >
          错误码: {errorCode}
        </Typography>
      )}

      {onRetry && (
        <Box sx={{ mt: 0.5 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={onRetry}
            sx={{
              textTransform: 'none',
              fontSize: 13,
              color: '#B91C1C',
              borderColor: '#FCA5A5',
              '&:hover': {
                borderColor: '#EF4444',
                bgcolor: '#FEE2E2',
              },
            }}
          >
            重试
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default ErrorBlock;
