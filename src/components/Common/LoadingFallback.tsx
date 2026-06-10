import React from 'react';
import { Box, CircularProgress } from '@mui/material';

/**
 * 路由懒加载 fallback 组件
 * 在 React.lazy() 动态导入路由组件时显示居中的加载指示器
 */
const LoadingFallback: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '50vh',
      width: '100%',
    }}
  >
    <CircularProgress size={40} thickness={4} />
  </Box>
);

export default LoadingFallback;
