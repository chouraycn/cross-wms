/**
 * v1.5.182: macOS pywebview 红黄绿窗口控制按钮
 *
 * 布局：透明悬浮于侧边栏左上角，与 Logo 同一行（参考 WorkBuddy 风格）
 * - 仅包含三个按钮，无背景条、无全宽覆盖
 * - 按钮区域可拖拽窗口（-webkit-app-region:drag）
 * - 按钮本身不可拖拽（-webkit-app-region:no-drag）
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { callApi, isPyWebView } from '../../services/tencentDocsApi';

// macOS 标准红黄绿按钮尺寸和位置（与 WorkBuddy 对齐）
const BUTTON_SIZE = 12;     // 按钮直径 12px
const BUTTON_GAP = '6px';  // 按钮间距 6px（边缘到边缘，macOS 标准）
const LEFT = 17;            // 距离侧边栏左边缘（往右5px）
const TOP = 14;             // 距离窗口顶部（往下4px）

type WindowState = 'normal' | 'maximized';

const WindowDragBar: React.FC<{ height?: number }> = ({ height: _h }) => {
  const [ready, setReady] = useState(() => isPyWebView());
  const [windowState, setWindowState] = useState<WindowState>('normal');

  // 检测 pywebview 环境就绪
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => {
      if (isPyWebView()) {
        setReady(true);
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [ready]);

  if (!ready) return null;

  // ---- 窗口控制 ----

  const handleClose = useCallback(() => {
    callApi('window_close').catch(() => {
      try { window.close(); } catch { /* ignore */ }
    });
  }, []);

  const handleMinimize = useCallback(() => {
    callApi('window_minimize').catch(() => {});
  }, []);

  const handleMaximize = useCallback(() => {
    if (windowState === 'normal') {
      callApi('window_maximize')
        .then(() => setWindowState('maximized'))
        .catch(() => {});
    } else {
      callApi('window_toggle_fullscreen')
        .then(() => setWindowState(s => s === 'normal' ? 'maximized' : 'normal'))
        .catch(() => {});
    }
  }, [windowState]);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: TOP,
        left: LEFT,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        // 整个按钮行可拖拽（拖拽按钮之间的空白区域可以移动窗口）
        WebkitAppRegion: 'drag',
        // v1.5.184: 容器不拦截鼠标事件，让下方的 Logo 可以正常点击
        pointerEvents: 'none',
      }}
    >
      {/* 红：关闭 */}
      <TrafficButton
        color="#ff5f57"
        hoverColor="#e0554e"
        icon="✕"
        title="关闭"
        onClick={handleClose}
        marginRight={BUTTON_GAP}
      />

      {/* 黄：最小化 */}
      <TrafficButton
        color="#febc2e"
        hoverColor="#e5a820"
        icon="−"
        title="最小化"
        onClick={handleMinimize}
        marginRight={BUTTON_GAP}
      />

      {/* 绿：最大化/还原 */}
      <TrafficButton
        color="#28c840"
        hoverColor="#1fa835"
        icon={windowState === 'maximized' ? '⊡' : '+'}
        title={windowState === 'maximized' ? '还原' : '最大化'}
        onClick={handleMaximize}
      />
    </Box>
  );
};

// ---- 按钮子组件 ----

interface TrafficButtonProps {
  color: string;
  hoverColor: string;
  icon: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  marginRight?: string;
}

const TrafficButton: React.FC<TrafficButtonProps> = ({
  color, hoverColor, icon, title, onClick, marginRight = 0,
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <Box
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: '50%',
        backgroundColor: hovered ? hoverColor : color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'default',
        flexShrink: 0,
        mr: marginRight,
        WebkitAppRegion: 'no-drag',  // 按钮不可拖拽
        pointerEvents: 'auto',       // v1.5.184: 按钮本身接收点击事件
      }}
    >
      {/* hover 时显示图标（macOS 风格） */}
      {hovered && (
        <span
          style={{
            fontSize: 9,
            lineHeight: 1,
            color: '#fff',
            fontWeight: 'bold',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {icon}
        </span>
      )}
    </Box>
  );
};

export default WindowDragBar;
