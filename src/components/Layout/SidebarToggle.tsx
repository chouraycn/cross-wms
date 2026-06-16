import React from 'react';
import { IconButton, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';

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

  return (
    <IconButton
      onClick={onToggle}
      size="small"
      sx={{
        position: 'fixed',
        top: '10px',
        left: collapsed ? collapsedWidth + 7 : expandedWidth - 33,
        right: 'auto',
        // v2.5.1-fix: zIndex 必须高于 WindowDragBar(9999)，否则拖拽条覆盖按钮导致无法点击
        zIndex: 10001,
        color: gs.textPrimary,
        borderRadius: '6.48px',
        p: 0.45,
        width: 25.92,
        height: 25.92,
        // Glass effect when collapsed (button sits on content area)
        ...(collapsed ? {
          backgroundColor: isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(240, 240, 240, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
        } : {}),
        '&:hover': {
          backgroundColor: collapsed
            ? (isDark ? 'rgba(20, 20, 20, 0.8)' : 'rgba(240, 240, 240, 0.8)')
            : gs.bgHover,
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
