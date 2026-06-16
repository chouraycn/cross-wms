import React from 'react';
import { Box, Typography, Alert, Button } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import type { SystemAuthorizationConfig } from '../../contexts/AppSettingsContext';
import { useAppSettings } from '../../contexts/AppSettingsContext';

/** 模型自动化操作依赖的关键 TCC 权限 */
const CRITICAL_PERMISSION_KEYS = [
  'screenRecording',
  'accessibility',
  'automation',
  'inputMonitoring',
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  screenRecording: '屏幕录制',
  accessibility: '辅助功能',
  automation: '自动化',
  inputMonitoring: '输入监控',
};

/** 提取系统授权中与模型自动化相关的状态摘要 */
function getAuthStatus(auth: SystemAuthorizationConfig): {
  isEnabled: boolean;
  missingCritical: string[];
  grantedCount: number;
  totalCritical: number;
} {
  const perms = auth.permissions;
  const missingCritical: string[] = [];

  for (const key of CRITICAL_PERMISSION_KEYS) {
    const p = perms[key];
    if (!p || !p.enabled || p.status === 'denied') {
      missingCritical.push(PERMISSION_LABELS[key] || key);
    }
  }

  const grantedCount = CRITICAL_PERMISSION_KEYS.length - missingCritical.length;

  return {
    isEnabled: auth.enabled,
    missingCritical,
    grantedCount,
    totalCritical: CRITICAL_PERMISSION_KEYS.length,
  };
}

interface SystemAuthBannerProps {
  /** 点击「前往设置」的回调 */
  onOpenSettings?: () => void;
}

const SystemAuthBanner: React.FC<SystemAuthBannerProps> = ({ onOpenSettings }) => {
  const { settings } = useAppSettings();
  const status = getAuthStatus(settings.systemAuthorization);

  // 全部授权且已启用 → 不显示
  if (status.isEnabled && status.missingCritical.length === 0) {
    return null;
  }

  // 未启用
  if (!status.isEnabled) {
    return (
      <Alert
        severity="warning"
        sx={{
          mb: 1.5,
          borderRadius: 1.5,
          fontSize: '0.75rem',
          '& .MuiAlert-icon': { alignItems: 'center' },
          '& .MuiAlert-message': { flex: 1 },
        }}
        action={
          onOpenSettings ? (
            <Button
              color="inherit"
              size="small"
              startIcon={<SettingsIcon sx={{ fontSize: 15 }} />}
              onClick={onOpenSettings}
              sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
            >
              前往设置
            </Button>
          ) : undefined
        }
      >
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 0.25 }}>
          系统授权未启用
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
          模型自动化能力（截图、点击、窗口控制等）需要 macOS 系统授权。请在系统授权中启用相关权限。
        </Typography>
      </Alert>
    );
  }

  // 已启用但关键权限缺失
  return (
    <Alert
      severity="warning"
      sx={{
        mb: 1.5,
        borderRadius: 1.5,
        fontSize: '0.75rem',
        '& .MuiAlert-icon': { alignItems: 'center' },
        '& .MuiAlert-message': { flex: 1 },
      }}
      action={
        onOpenSettings ? (
          <Button
            color="inherit"
            size="small"
            startIcon={<SettingsIcon sx={{ fontSize: 15 }} />}
            onClick={onOpenSettings}
            sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
          >
            前往设置
          </Button>
        ) : undefined
      }
    >
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 0.25 }}>
        关键权限未授权（{status.grantedCount}/{status.totalCritical}）
      </Typography>
      <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
        {status.missingCritical.map(label => (
          <Box
            key={label}
            component="span"
            sx={{
              fontSize: '0.65rem',
              px: 0.75,
              py: 0.125,
              borderRadius: '4px',
              backgroundColor: 'rgba(255,152,0,0.12)',
              color: '#E65100',
              fontWeight: 500,
            }}
          >
            {label}
          </Box>
        ))}
      </Box>
    </Alert>
  );
};

export default SystemAuthBanner;
