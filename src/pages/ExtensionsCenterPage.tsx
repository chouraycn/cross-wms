/**
 * ExtensionsCenterPage — 扩展与工具页
 *
 * 直接渲染 ExtensionsPage，与 WikiPage → WikiPanel 结构一致，
 * 无 CenterPage 外壳 Tabs 栏。
 */

import React from 'react';
import Box from '@mui/material/Box';
import ExtensionsPage from './ExtensionsPage';

const ExtensionsCenterPage: React.FC = () => (
  <Box sx={{ height: '100%', overflow: 'hidden' }}>
    <ExtensionsPage />
  </Box>
);

export default ExtensionsCenterPage;
