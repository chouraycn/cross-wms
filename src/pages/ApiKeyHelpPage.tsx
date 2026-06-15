/**
 * ApiKeyHelpPage — API Key 获取帮助页
 *
 * 独立路由页面 `/api-key-help/:provider`，
 * 提供分步引导用户获取指定提供商的 API Key。
 *
 * 流程：ModelEditDialog "获取 Key" → 关闭对话框 → 导航到此页 → 自动打开第三方页面
 * 返回：点击"返回添加模型" → 带上 query params 导航回 /settings → 自动打开添加对话框
 */

import React, { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Breadcrumbs,
  Alert,
  Stepper,
  Step,
  StepLabel,
  useTheme,
  Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import AddIcon from '@mui/icons-material/Add';
import { providerIcon, providerLabel } from '../utils/providerIcons';
import { getProviderApiKeyUrl } from '../utils/providerApiKeyUrls';

/** pywebview 环境下用系统浏览器打开 URL */
function openInSystemBrowser(url: string): void {
  // pywebview 桌面端：通过 Python API 打开系统浏览器
  if ((window as any).pywebview?.api?.open_in_browser) {
    (window as any).pywebview.api.open_in_browser(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  } else {
    // Web 端 fallback
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const ApiKeyHelpPage: React.FC = () => {
  const { provider } = useParams<{ provider: string }>();
  const navigate = useNavigate();
  const theme = useTheme();

  const providerName = providerLabel(provider || '');
  const providerUrl = getProviderApiKeyUrl(provider || '');
  const icon = providerIcon(provider || '', 24);

  // 进入页面时自动打开第三方 Key 获取页面
  useEffect(() => {
    if (providerUrl) {
      // 延迟 500ms 打开，让用户先看到引导页
      const timer = setTimeout(() => openInSystemBrowser(providerUrl), 500);
      return () => clearTimeout(timer);
    }
  }, [providerUrl]);

  /** 重新打开第三方页面 */
  const handleReopen = useCallback(() => {
    if (providerUrl) {
      openInSystemBrowser(providerUrl);
    }
  }, [providerUrl]);

  /** 返回设置页并自动打开添加对话框 */
  const handleBackToAdd = useCallback(() => {
    navigate(`/settings?from=api-key-help&provider=${provider}&action=add`);
  }, [navigate, provider]);

  if (!provider) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">缺少 provider 参数</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
      {/* 面包屑 */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Typography
          component="span"
          sx={{ cursor: 'pointer', fontSize: '0.8rem' }}
          onClick={() => navigate('/settings')}
        >
          系统设置
        </Typography>
        <Typography component="span" sx={{ fontSize: '0.8rem' }}>
          获取 {providerName} API Key
        </Typography>
      </Breadcrumbs>

      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        {icon}
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          获取 {providerName} API Key
        </Typography>
      </Box>

      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 3 }}>
        按照以下步骤在 {providerName} 官网注册并获取 API Key，然后返回本应用完成模型配置。
      </Typography>

      {/* 已自动打开提示 */}
      <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
        已为您自动打开 {providerName} 的 Key 获取页面。如未打开，请点击下方按钮手动打开。
      </Alert>

      {/* 分步引导 Stepper */}
      <Stepper orientation="vertical" nonLinear activeStep={-1} sx={{ mb: 3 }}>
        <Step completed>
          <StepLabel
            optional={
              <Typography variant="caption" color="text.secondary">
                已自动打开
              </Typography>
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LinkIcon sx={{ fontSize: 16 }} />
              <span>访问 {providerName} Key 管理页</span>
            </Box>
          </StepLabel>
        </Step>

        <Step>
          <StepLabel>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span>注册 / 登录 {providerName} 账号</span>
            </Box>
          </StepLabel>
        </Step>

        <Step>
          <StepLabel>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span>创建新的 API Key</span>
            </Box>
          </StepLabel>
        </Step>

        <Step>
          <StepLabel>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span>复制 Key 并返回本应用填写</span>
            </Box>
          </StepLabel>
        </Step>
      </Stepper>

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          startIcon={<OpenInNewIcon />}
          onClick={handleReopen}
          sx={{ flex: '1 1 auto', minWidth: 180 }}
        >
          重新打开 {providerName} Key 页面
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleBackToAdd}
          sx={{ flex: '1 1 auto', minWidth: 180 }}
        >
          返回添加模型
        </Button>
      </Box>

      {/* 提示信息 */}
      <Paper variant="outlined" sx={{ p: 2, mt: 3, borderRadius: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main', mt: 0.25, flexShrink: 0 }} />
          <Box>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, mb: 0.5 }}>
              获取 Key 后的下一步
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.6 }}>
              点击"返回添加模型"将自动跳转到模型管理页面，并预选 {providerName} 提供商。
              在弹出的对话框中将 API Key 粘贴到对应输入框，点击保存即可。
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default ApiKeyHelpPage;
