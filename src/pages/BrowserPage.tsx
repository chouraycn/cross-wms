/**
 * BrowserPage — 浏览器自动化管理页
 *
 * v3.0: 提供浏览器启动/关闭、URL 导航、页面快照查看等操作界面。
 * v4.0: 使用 BrowserControlPanel 作为主要控制界面，复用组件代码。
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import BrowserControlPanel from '../components/Browser/BrowserControlPanel';

// ===================== Component =====================

const BrowserPage: React.FC = () => {
  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <LanguageIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          浏览器自动化控制
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        管理 Playwright 浏览器实例，进行自动化网页操作。支持导航、快照查看、元素交互、截图和 Cookie 管理。
      </Typography>

      {/* 使用 BrowserControlPanel 组件 */}
      <BrowserControlPanel open floating={false} />
    </Box>
  );
};

export default BrowserPage;
