import React, { useState, useEffect, useCallback } from 'react';
import { IconButton, useTheme } from '@mui/material';
import { SearchOutlined as SearchIcon } from '@mui/icons-material';
import { getGrayScale } from '../../constants/theme';
import { isPyWebView } from '../../services/tencentDocsApi';
import { isMacOSApp } from '../../utils/env';

const isNativeApp = (): boolean => {
  if (isMacOSApp()) return true;
  // @ts-ignore
  if (window.cdfAppNative && window.cdfAppNative.isNative) return true;
  return isPyWebView();
};

const CollapseIcon: React.FC = () => (
  <svg width="19.44" height="19.44" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="5" ry="5" stroke="currentColor" strokeWidth="2" fill="none"/>
    <line x1="9" y1="8" x2="9" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ExpandIcon: React.FC = () => (
  <svg width="19.44" height="19.44" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="5" ry="5" stroke="currentColor" strokeWidth="2" fill="none"/>
    <line x1="15" y1="8" x2="15" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export interface GlobalActionsBarProps {
  collapsed: boolean;
  onToggle: () => void;
  expandedWidth: number;
  collapsedWidth: number;
}

const GlobalActionsBar = React.memo<GlobalActionsBarProps>(function GlobalActionsBar({
  collapsed,
  onToggle,
  expandedWidth,
  collapsedWidth,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const nativeApp = isNativeApp();

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFullscreenChanged = ((e: CustomEvent) => {
      setIsFullscreen(e.detail?.fullscreen ?? false);
    }) as EventListener;
    window.addEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
    return () => window.removeEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
  }, []);

  const handleSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent('cdf-open-command-palette'));
  }, []);

  const leftPosition = collapsed 
    ? (nativeApp && !isFullscreen ? 77 : collapsedWidth + 10) 
    : expandedWidth - 30;

  return (
    <div
      style={{
        position: 'fixed',
        top: nativeApp ? '19px' : '10px',
        left: `${leftPosition}px`,
        right: 'auto',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <IconButton
        onClick={onToggle}
        size="small"
        sx={{
          color: gs.textPrimary,
          borderRadius: '6.48px',
          p: 0.45,
          width: 25.92,
          height: 25.92,
          backgroundColor: collapsed && nativeApp ? 'transparent' : (isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(240, 240, 240, 0.6)'),
          ...(collapsed && nativeApp ? {} : {
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }),
          border: collapsed && nativeApp ? 'none' : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'})`,
          '&:hover': {
            backgroundColor: collapsed && nativeApp ? gs.bgHover : (isDark ? 'rgba(20, 20, 20, 0.8)' : 'rgba(240, 240, 240, 0.8)'),
          },
          '&:focus': { outline: 'none' },
        }}
      >
        {collapsed ? <ExpandIcon /> : <CollapseIcon />}
      </IconButton>

      <IconButton
        onClick={handleSearch}
        size="small"
        sx={{
          color: gs.textPrimary,
          borderRadius: '6.48px',
          p: 0.45,
          width: 25.92,
          height: 25.92,
          backgroundColor: collapsed && nativeApp ? 'transparent' : (isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(240, 240, 240, 0.6)'),
          ...(collapsed && nativeApp ? {} : {
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }),
          border: collapsed && nativeApp ? 'none' : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'})`,
          '&:hover': {
            backgroundColor: collapsed && nativeApp ? gs.bgHover : (isDark ? 'rgba(20, 20, 20, 0.8)' : 'rgba(240, 240, 240, 0.8)'),
          },
          '&:focus': { outline: 'none' },
        }}
      >
        <SearchIcon sx={{ fontSize: '18px' }} />
      </IconButton>
    </div>
  );
});

export default GlobalActionsBar;