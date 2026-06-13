import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Button, Chip, Alert, useTheme } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import LinkIcon from '@mui/icons-material/Link';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { useNavigate } from 'react-router-dom';
import type { WeComAuthStatus } from '../../services/wecomDocsApi';
import { getGrayScale } from '../../constants/theme';
/** 腾讯文档品牌色 */
const TDOC_COLOR = '#27A17C';
/** 企业微信品牌色 */
const WECOM_COLOR = '#07C160';

/**
 * 认证状态区子组件
 *
 * 负责：个人文档品牌卡片 + 授权状态/刷新、企业文档品牌卡片 + 授权状态/刷新、未授权警告提示。
 */
interface AuthStatusSectionProps {
  authStatus: { authenticated: boolean } | null;
  wecomAuthStatus: WeComAuthStatus | null;
  refreshing: boolean;
  wecomRefreshing: boolean;
  lastSync: string | null;
  docCount: number;
  wecomDocCount: number;
  onRefresh: () => void;
  onWecomRefresh: () => void;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
const AuthStatusSection: React.FC<AuthStatusSectionProps> = ({
  authStatus, wecomAuthStatus, refreshing, wecomRefreshing, lastSync,
  docCount, wecomDocCount, onRefresh, onWecomRefresh,
}) => {
/* eslint-enable @typescript-eslint/no-unused-vars */
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Box>
      {/* 旋转动画 keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* === 个人文档品牌卡片 === */}
      <Card elevation={0} sx={{ border: `2px solid ${TDOC_COLOR}`, borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ width: 52, height: 52, borderRadius: 2, backgroundColor: TDOC_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DescriptionIcon sx={{ color: '#fff', fontSize: 30 }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: TDOC_COLOR }}>腾讯文档集成</Typography>
              <Typography variant="body2" color="text.secondary">本地读取文档内容，无需嵌入网页</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {authStatus && (
                <Chip icon={authStatus.authenticated ? <CloudDoneIcon /> : <CloudOffIcon />} label={authStatus.authenticated ? '已授权' : '未授权'} size="small" sx={{ borderColor: authStatus.authenticated ? TDOC_COLOR : gs.borderDarker, color: authStatus.authenticated ? TDOC_COLOR : gs.textDisabled }} variant="outlined" />
              )}
              <Chip icon={<LinkIcon />} label={`${docCount} 个文档`} size="small" sx={{ borderColor: TDOC_COLOR, color: TDOC_COLOR }} variant="outlined" />
              <Button variant="outlined" startIcon={<RefreshIcon sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />} onClick={onRefresh} disabled={refreshing} sx={{ borderColor: TDOC_COLOR, color: TDOC_COLOR, '&:hover': { borderColor: '#1e7a5e', backgroundColor: '#f0faf6' } }}>
                {refreshing ? '同步中...' : '检查状态'}
              </Button>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => navigate('/settings')} sx={{ borderColor: TDOC_COLOR, color: TDOC_COLOR, '&:hover': { borderColor: '#1e7a5e', backgroundColor: '#f0faf6' } }}>
                添加链接
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* 未授权提示 */}
      {authStatus && !authStatus.authenticated && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          腾讯文档尚未授权 — 请在设置中配置 Client ID / Client Secret 并完成 OAuth 授权，才能读取文档内容
        </Alert>
      )}

      {/* === 企业文档品牌卡片 === */}
      <Card elevation={0} sx={{ border: `2px solid ${WECOM_COLOR}`, borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ width: 52, height: 52, borderRadius: 2, backgroundColor: WECOM_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DescriptionIcon sx={{ color: '#fff', fontSize: 30 }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: WECOM_COLOR }}>企业微信文档</Typography>
              <Typography variant="body2" color="text.secondary">通过 wecom-cli 读取企业文档内容，本地渲染</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {wecomAuthStatus && (
                <Chip icon={wecomAuthStatus.authorized ? <CloudDoneIcon /> : <CloudOffIcon />} label={!wecomAuthStatus.cliInstalled ? '未安装' : wecomAuthStatus.authorized ? '已授权' : '未授权'} size="small" sx={{ borderColor: wecomAuthStatus.authorized ? WECOM_COLOR : gs.borderDarker, color: wecomAuthStatus.authorized ? WECOM_COLOR : gs.textDisabled }} variant="outlined" />
              )}
              <Chip icon={<LinkIcon />} label={`${wecomDocCount} 个文档`} size="small" sx={{ borderColor: WECOM_COLOR, color: WECOM_COLOR }} variant="outlined" />
              <Button variant="outlined" startIcon={<RefreshIcon sx={{ animation: wecomRefreshing ? 'spin 1s linear infinite' : 'none' }} />} onClick={onWecomRefresh} disabled={wecomRefreshing} sx={{ borderColor: WECOM_COLOR, color: WECOM_COLOR, '&:hover': { borderColor: '#06a451', backgroundColor: '#ecfdf5' } }}>
                {wecomRefreshing ? '检查中...' : '检查状态'}
              </Button>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => navigate('/settings')} sx={{ borderColor: WECOM_COLOR, color: WECOM_COLOR, '&:hover': { borderColor: '#06a451', backgroundColor: '#ecfdf5' } }}>
                添加链接
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* 企业微信未授权提示 */}
      {wecomAuthStatus && !wecomAuthStatus.cliInstalled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          wecom-cli 未安装 — 请在终端执行 <code>npm install -g @wecom/cli</code> 安装
        </Alert>
      )}
      {wecomAuthStatus && wecomAuthStatus.cliInstalled && !wecomAuthStatus.authorized && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          wecom-cli 未授权 — 请在终端执行 <code>wecom-cli init</code> 扫码授权
        </Alert>
      )}
    </Box>
  );
};

export default AuthStatusSection;
