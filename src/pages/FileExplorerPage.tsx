/**
 * 文件浏览器页面
 */

import React from 'react';
import { Box, useTheme } from '@mui/material';
import { getGrayScale } from '../constants/theme';
import PageHeader from '../components/Common/PageHeader';
import FileExplorerPanel from '../components/File/FileExplorerPanel';

const FileExplorerPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* 页面标题 */}
      <PageHeader
        title="文件浏览器"
        subtitle="浏览和管理文件系统"
      />

      {/* 文件浏览器面板 */}
      <Box
        sx={{
          flex: 1,
          mt: 2,
          backgroundColor: gs.bgPanel,
          borderRadius: '6px',
          border: `1px solid ${gs.border}`,
          overflow: 'hidden',
        }}
      >
        <FileExplorerPanel
          rootPath="."
          height="calc(100vh - 200px)"
          showSearch={true}
          showCreateButtons={true}
        />
      </Box>
    </Box>
  );
};

export default FileExplorerPage;