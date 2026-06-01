import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, CircularProgress, Button } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { isPyWebView } from '../services/tencentDocsApi';

/** Agent Web 应用页面 — 通过 iframe 加载本地 5174 端口，含连接降级 */

type IframeStatus = 'connecting' | 'connected' | 'error';

const IFRAME_TIMEOUT_MS = 10000; // 10 秒超时

const AgentPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isPy = isPyWebView();

  const [iframeStatus, setIframeStatus] = useState<IframeStatus>('connecting');
  const [retryKey, setRetryKey] = useState(0); // 变更时重新加载 iframe

  // Agent Web 前端地址
  const agentUrl = isPy ? 'http://localhost:5174' : 'http://localhost:5174';

  // 超时检测：10 秒内未连接则标记 error
  useEffect(() => {
    setIframeStatus('connecting');
    timerRef.current = setTimeout(() => {
      setIframeStatus((prev) => {
        if (prev === 'connecting') return 'error';
        return prev;
      });
    }, IFRAME_TIMEOUT_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [retryKey]);

  const handleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIframeStatus('connected');
  }, []);

  const handleError = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIframeStatus('error');
    console.error('[AgentPage] iframe load error');
  }, []);

  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

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
        {iframeStatus === 'connected' && (
          <Button
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={() => window.open(agentUrl, '_blank')}
            sx={{ fontSize: '0.7rem', color: '#6B7280', '&:hover': { color: '#111827' } }}
          >
            新窗口打开
          </Button>
        )}
      </Box>

      {/* iframe 容器 — 占满剩余高度 */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* 连接中 — 显示 Spinner */}
        {iframeStatus === 'connecting' && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              zIndex: 1,
              backgroundColor: '#FFFFFF',
            }}
          >
            <CircularProgress size={32} sx={{ color: '#6B7280' }} />
            <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
              正在启动 Agent 服务…
            </Typography>
          </Box>
        )}

        {/* 连接失败 — 显示错误提示 + 重试按钮 */}
        {iframeStatus === 'error' && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              zIndex: 1,
              backgroundColor: '#FFFFFF',
            }}
          >
            <SmartToyOutlinedIcon sx={{ fontSize: 48, color: '#D1D5DB' }} />
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Agent 服务暂不可用
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', maxWidth: 320, textAlign: 'center' }}>
              后端服务可能尚未启动，请检查 Agent 服务是否正常运行
            </Typography>
            <Button
              variant="outlined"
              startIcon={<RefreshOutlinedIcon />}
              onClick={handleRetry}
              sx={{
                mt: 1,
                borderColor: '#E5E7EB',
                color: '#374151',
                '&:hover': {
                  borderColor: '#111827',
                  backgroundColor: '#F9FAFB',
                },
              }}
            >
              重试连接
            </Button>
          </Box>
        )}

        {/* iframe — 始终渲染但连接中/错误时被遮罩盖住 */}
        <iframe
          key={retryKey}
          ref={iframeRef}
          src={agentUrl}
          title="Agent 应用"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 0,
            visibility: iframeStatus === 'connected' ? 'visible' : 'hidden',
          }}
          allow="microphone"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          onLoad={handleLoad}
          onError={handleError}
        />
      </Box>
    </Box>
  );
};

export default AgentPage;
