/**
 * WikiPage — Wiki 知识库管理页面
 *
 * 渲染已接线的 WikiPanel（含 WikiSearchDialog 混合搜索弹窗）。
 * WikiPanel 通过内置 wikiApi 直接调用 /api/wiki 真实接口，
 * 与后端 server/routes/wikiService.ts 契约一致。
 */

import React from 'react';
import Box from '@mui/material/Box';
import WikiPanel from '../components/Wiki/WikiPanel';

const WikiPage: React.FC = () => {
  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <WikiPanel />
    </Box>
  );
};

export default WikiPage;
