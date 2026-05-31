import React, { useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { isPyWebView } from '../services/tencentDocsApi';

/** Agent Web 应用页面 — 通过 iframe 加载本地 5174 端口 */
const AgentPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isPy = isPyWebView();

  // Agent Web 前端地址
  const agentUrl = isPy ? 'http://localhost:5174' : 'http://localhost:5174';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 顶部提示栏 */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          backgroundColor: '#F9FAFB',
        }}
      >
        <SmartToyOutlinedIcon sx={{ fontSize: 18, color: '#6B7280' }} />
        <Typography sx={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500, flex: 1 }}>
          Agent 应用
        </Typography>
        <Button
          size="small"
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          onClick={() => window.open(agentUrl, '_blank')}
          sx={{ fontSize: '0.7rem', color: '#6B7280', '&:hover': { color: '#111827' } }}
        >
          新窗口打开
        </Button>
      </Box>

      {/* iframe 容器 — 占满剩余高度 */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <iframe
          ref={iframeRef}
          src={agentUrl}
          title="Agent 应用"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 0,
          }}
          allow="microphone"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          onError={() => {
            console.error('Agent iframe load error');
          }}
        />
      </Box>
    </Box>
  );
};

export default AgentPage;
