import React from 'react';
import { Box, Typography } from '@mui/material';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.60';

// ===================== Props =====================

interface SidebarLogoProps {
  collapsed: boolean;
  onLogoClick: () => void;
  showVersion?: boolean;
}

// ===================== Component =====================

const SidebarLogo: React.FC<SidebarLogoProps> = ({ collapsed, onLogoClick, showVersion = true }) => {
  return (
    <Box
      sx={{
        px: collapsed ? 0.5 : 2,
        height: 28,
        mt: '12px',
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 1.25,
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
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
          cursor: 'pointer',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onClick={onLogoClick}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g fill="#111827">
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
              color: '#111827',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            CDF Know CrossWMS
          </Typography>
          {showVersion && (
            <Typography
              sx={{
                fontSize: '12px',
                fontWeight: 400,
                color: '#9CA3AF',
                lineHeight: 1.2,
              }}
            >
              v{APP_VERSION}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default SidebarLogo;
