import React, { useState, useEffect, useCallback } from 'react';
import { IconButton, useTheme } from '@mui/material';
import { SearchOutlined as SearchIcon, ChatBubbleOutline as ChatBubbleOutlineIcon } from '@mui/icons-material';
import { getGrayScale } from '../../constants/theme';
import { isPyWebView } from '../../services/tencentDocsApi';
import { isMacOSApp } from '../../utils/env';
import { CollapseIcon, ExpandIcon } from '../Common/Icons';

const isNativeApp = (): boolean => {
  if (isMacOSApp()) return true;
  // @ts-ignore
  if (window.cdfAppNative && window.cdfAppNative.isNative) return true;
  return isPyWebView();
};

export interface GlobalActionsBarProps {
  collapsed: boolean;
  onToggle: () => void;
  expandedWidth: number;
  collapsedWidth: number;
}

const BUTTON_SIZE = 25.92;
const BUTTON_GAP = 4;
const BUTTONS_TOTAL_WIDTH = BUTTON_SIZE * 2 + BUTTON_GAP;

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

  const handleNewChat = useCallback(() => {
    window.dispatchEvent(new CustomEvent('cdf-know-clow-new-chat'));
  }, []);

  // v1.7.87: 展开侧边栏时按钮右对齐在侧边栏内；收起时避让红黄绿按钮（+5px）
  const leftPosition = collapsed
    ? (nativeApp && !isFullscreen ? 87 : collapsedWidth + 15)
    : expandedWidth - BUTTONS_TOTAL_WIDTH - 8;

  // v1.7.87: DMG 下按钮整体上移 3px，与红黄绿按钮间距更协调
  const topPosition = nativeApp ? '16px' : '10px';

  return (
    <div
      style={{
        position: 'fixed',
        top: topPosition,
        left: `${leftPosition}px`,
        right: 'auto',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {/* 侧边栏展开/收起按钮 */}
      <IconButton
        onClick={onToggle}
        size="small"
        sx={{
          color: gs.textPrimary,
          borderRadius: '6.48px',
          p: 0.45,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          backgroundColor: 'transparent',
          border: 'none',
          '&:hover': {
            backgroundColor: gs.bgHover,
          },
          '&:focus': { outline: 'none' },
        }}
      >
        {collapsed ? <ExpandIcon /> : <CollapseIcon />}
      </IconButton>

      {/* v1.7.87: 展开侧边栏时显示搜索按钮，收起时显示新建对话按钮 */}
      {collapsed ? (
        <IconButton
          onClick={handleNewChat}
          size="small"
          sx={{
            color: gs.textPrimary,
            borderRadius: '6.48px',
            p: 0.45,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            backgroundColor: 'transparent',
            border: 'none',
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
            '&:focus': { outline: 'none' },
          }}
        >
          <ChatBubbleOutlineIcon sx={{ fontSize: '14.58px' }} />
        </IconButton>
      ) : (
        <IconButton
          onClick={handleSearch}
          size="small"
          sx={{
            color: gs.textPrimary,
            borderRadius: '6.48px',
            p: 0.45,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            backgroundColor: 'transparent',
            border: 'none',
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
            '&:focus': { outline: 'none' },
          }}
        >
          <SearchIcon sx={{ fontSize: '18px' }} />
        </IconButton>
      )}
    </div>
  );
});

export default GlobalActionsBar;
