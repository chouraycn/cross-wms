import React, { useState, useEffect } from 'react';
import { IconButton, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import { isPyWebView } from '../../services/tencentDocsApi';
import { isMacOSApp } from '../../utils/env';

// v3.3: 构建时 + 运行时双重检测
const isNativeApp = (): boolean => {
  if (isMacOSApp()) return true;
  // @ts-ignore
  if (window.cdfAppNative && window.cdfAppNative.isNative) return true;
  return isPyWebView();
};

// ===================== 自定义 SVG 图标 =====================

/** 收起图标 — 圆角矩形 + 左侧竖线（展开时显示，点击收起侧边栏） */
const CollapseIcon: React.FC = () => (
  <svg width="19.44" height="19.44" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="5" ry="5" stroke="currentColor" strokeWidth="2" fill="none"/>
    <line x1="9" y1="8" x2="9" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/** 展开图标 — 圆角矩形 + 右侧竖线（收起时显示，点击展开侧边栏） */
const ExpandIcon: React.FC = () => (
  <svg width="19.44" height="19.44" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="5" ry="5" stroke="currentColor" strokeWidth="2" fill="none"/>
    <line x1="15" y1="8" x2="15" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// ===================== Props =====================

export interface SidebarToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  expandedWidth: number;
  collapsedWidth: number;
}

// ===================== Component =====================

const SidebarToggle = React.memo<SidebarToggleProps>(function SidebarToggle({
  collapsed,
  onToggle,
  expandedWidth,
  collapsedWidth,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const nativeApp = isNativeApp();

  // v1.7.18: 监听全屏状态变化，全屏时收起状态按钮前移
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFullscreenChanged = ((e: CustomEvent) => {
      setIsFullscreen(e.detail?.fullscreen ?? false);
    }) as EventListener;
    window.addEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
    return () => window.removeEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
  }, []);

  return (
    <IconButton
      onClick={onToggle}
      size="small"
      sx={{
        position: 'fixed',
        // v1.7.18: top=15px (往上1px)，left=72 (再右移5px)
        top: nativeApp ? '15px' : '10px',
        left: collapsed ? (nativeApp && !isFullscreen ? 77 : 41) : expandedWidth - 30,
        right: 'auto',
        // v1.5.166: zIndex 高于 WindowDragBar(1300)，确保按钮可点击
        zIndex: 1400,
        color: gs.textPrimary,
        borderRadius: '6.48px',
        p: 0.45,
        width: 25.92,
        height: 25.92,
        // v1.7.18: macOS 收起时去掉玻璃背景和描边，网页端保持玻璃效果
        backgroundColor: collapsed && nativeApp ? 'transparent' : (isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(240, 240, 240, 0.6)'),
        ...(collapsed && nativeApp ? {} : {
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }),
        border: collapsed && nativeApp ? 'none' : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
        '&:hover': {
          backgroundColor: collapsed && nativeApp ? gs.bgHover : (isDark ? 'rgba(20, 20, 20, 0.8)' : 'rgba(240, 240, 240, 0.8)'),
        },
        '&:focus': { outline: 'none' },
      }}
      // v2.5.1-fix: 确保 WKWebView 不将此按钮区域当作拖拽区域
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {collapsed ? (
        <ExpandIcon />
      ) : (
        <CollapseIcon />
      )}
    </IconButton>
  );
});

export default SidebarToggle;
