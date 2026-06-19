/**
 * SystemAuthBanner — 系统授权状态横幅
 *
 * v7.0: 重写样式，与 ToolPermissionDialog 对齐。
 * - 使用 getGrayScale 主题系统，支持暗色模式
 * - 顶部渐变条（与 ToolPermissionDialog 风格一致）
 * - 结构化权限标签展示
 */

import React from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SettingsIcon from '@mui/icons-material/Settings';
import type { SystemAuthorizationConfig } from '../../contexts/AppSettingsContext';
import { useSystemAuthSettings } from '../../contexts/AppSettingsContext';
import { getGrayScale } from '../../constants/theme';

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
  const { settings } = useSystemAuthSettings();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const status = getAuthStatus(settings);

  // 全部授权且已启用 → 不显示
  if (status.isEnabled && status.missingCritical.length === 0) {
    return null;
  }

  // 确定风险级别颜色（中性灰蓝，不用黄色）
  const isNotEnabled = !status.isEnabled;
  const accentColor = isDark ? '#60A5FA' : '#3B82F6';
  const accentBg = isDark ? 'rgba(96,165,250,0.08)' : 'rgba(59,130,246,0.06)';
  const accentBorder = isDark ? 'rgba(96,165,250,0.18)' : 'rgba(59,130,246,0.15)';

  return (
    <Box
      sx={{
        mb: 1.5,
        borderRadius: 2,
        bgcolor: gs.bgPanel,
        border: `1px solid ${accentBorder}`,
        overflow: 'hidden',
        animation: 'authBannerIn 0.25s cubic-bezier(0.4,0,0.2,1)',
        '@keyframes authBannerIn': {
          from: { opacity: 0, transform: 'translateY(-8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* 顶部渐变条 */}
      <Box
        sx={{
          height: 3,
          background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
        }}
      />

      <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
        {/* 头部：图标 + 标签 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: accentBg,
            }}
          >
            <WarningAmberIcon sx={{ color: accentColor, fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary, lineHeight: 1.3 }}>
              {isNotEnabled ? '系统授权未启用' : `关键权限未授权（${status.grantedCount}/${status.totalCritical}）`}
            </Typography>
            {isNotEnabled ? (
              <Typography sx={{ fontSize: 11, color: gs.textMuted, lineHeight: 1.4, mt: 0.25 }}>
                模型自动化能力（截图、点击、窗口控制等）需要 macOS 系统授权。请在系统授权中启用相关权限。
              </Typography>
            ) : (
              <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {status.missingCritical.map(label => (
                  <Box
                    key={label}
                    component="span"
                    sx={{
                      fontSize: '0.65rem',
                      px: 0.75,
                      py: 0.125,
                      borderRadius: '4px',
                      backgroundColor: accentBg,
                      color: accentColor,
                      fontWeight: 500,
                      border: `1px solid ${accentBorder}`,
                    }}
                  >
                    {label}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <ShieldIcon sx={{ fontSize: 14, color: gs.textDisabled, opacity: 0.5 }} />
        </Box>
      </Box>

      {/* 底部操作栏 */}
      {onOpenSettings && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            px: 2,
            py: 0.75,
            borderTop: `1px solid ${gs.border}`,
            gap: 1,
          }}
        >
          <Button
            onClick={onOpenSettings}
            variant="text"
            size="small"
            startIcon={<SettingsIcon sx={{ fontSize: 14 }} />}
            sx={{
              borderRadius: 1.5,
              textTransform: 'none',
              color: accentColor,
              fontSize: 11,
              px: 1.5,
              '&:hover': { bgcolor: accentBg },
            }}
          >
            前往设置
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default SystemAuthBanner;
