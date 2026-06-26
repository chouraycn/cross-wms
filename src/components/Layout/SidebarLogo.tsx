import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import { useUpdateContext } from '../../contexts/UpdateContext';

// ===================== Props =====================

interface SidebarLogoProps {
  collapsed: boolean;
  showVersion?: boolean;
}

// ===================== Component =====================

const SidebarLogo = React.memo<SidebarLogoProps>(function SidebarLogo({ collapsed, showVersion = true }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 从 UpdateContext 获取版本号（pywebview 环境下可能动态覆盖）
  const { currentVersion } = useUpdateContext();

  return (
    <Box
      sx={{
        px: collapsed ? 0.5 : 2,
        height: 28,
        // v1.5.220: Swift 原生 App 模式下，Logo 需要让出系统红黄绿按钮位置
        // 红黄绿按钮在标题栏顶部，下移 5px 后约在 13px 位置，加上 5px 间距
        mt: '28px',
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 1.25,
        flexShrink: 0,
      }}
    >
      {/* Logo 图标 */}
      <Box
        sx={{
          width: 28,
          height: 28,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g fill={gs.textPrimary}>
            <path d="M93.45,36.53l-11.5,16.57,10.03,14.41c2.25-5.4,3.5-11.32,3.5-17.53,0-4.68-.71-9.2-2.02-13.45Z"/>
            <path d="M57.48,88.15c-2.65.57-5.4.88-8.23.88-6.04,0-11.77-1.37-16.88-3.83V18.56c0-2.38,1.47-4.54,3.71-5.34,4.11-1.47,8.55-2.28,13.17-2.28.91,0,1.81.03,2.71.1v44.36c0,2.49,3.21,3.5,4.64,1.45l26.5-38.08c-7.87-8.37-18.87-13.77-31.13-14.32v.03c-.9-.05-1.8-.08-2.71-.08C24.07,4.39,3.66,24.8,3.66,49.99s20.41,45.59,45.59,45.59c1.04,0,2.07-.04,3.09-.11l-.03.04c10.67-.56,20.36-4.8,27.85-11.46l-6.65-9.55c-1.56-2.25-4.89-2.25-6.46-.01l-9.57,13.65Z"/>
          </g>
        </svg>
      </Box>

      {/* 名称 + 版本号 — 仅展开时显示 */}
      {!collapsed && (
        <Box
          sx={{
            maxWidth: 200,
            opacity: 1,
            overflow: 'hidden',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Typography
            sx={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: gs.textPrimary,
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            CDF Know Claw
          </Typography>
          {showVersion && (
            <Typography
              sx={{
                fontSize: '12px',
                fontWeight: 400,
                color: gs.textDisabled,
                lineHeight: 1.2,
              }}
            >
              v{currentVersion}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
});

export default SidebarLogo;
