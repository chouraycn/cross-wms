/**
 * v1.5.182: macOS pywebview 红黄绿窗口控制按钮
 *
 * v1.5.220: Swift 原生 App 模式下隐藏此组件
 * - pywebview 模式：HTML 自绘红黄绿按钮
 * - Swift 原生 App 模式：使用系统自带红黄绿按钮（由 Swift WindowManager 控制）
 *
 * 布局：透明悬浮于侧边栏左上角，与 Logo 同一行（参考 WorkBuddy 风格）
 * - 仅包含三个按钮，无背景条、无全宽覆盖
 * - 按钮区域可拖拽窗口（-webkit-app-region:drag）
 * - 按钮本身不可拖拽（-webkit-app-region:no-drag）
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { callApi, isPyWebView } from '../../services/tencentDocsApi';

// 检测是否在 Swift 原生 App 模式下
// v1.5.220: Swift 端会注入 window.cdfAppNative.isNative = true
const isNativeApp = (): boolean => {
  // @ts-ignore
  return !!(window.cdfAppNative && window.cdfAppNative.isNative);
};

// macOS 标准红黄绿按钮尺寸和位置（与 WorkBuddy 对齐）
const BUTTON_SIZE = 12;     // 按钮直径 12px
const BUTTON_GAP = '6px';  // 按钮间距 6px（边缘到边缘，macOS 标准）
const LEFT = 18;            // 距离侧边栏左边缘（往右5px）
// v1.7.15: 往下移动5px，从14改为19
const TOP = 19;             // 距离窗口顶部（往下4px + 5px = 9px）

type WindowState = 'normal' | 'maximized';

const WindowDragBar: React.FC<{ height?: number }> = ({ height: _h }) => {
  const [ready, setReady] = useState(() => isPyWebView());
  const [windowState, setWindowState] = useState<WindowState>('normal');
  const [focused, setFocused] = useState(true);

  // v1.5.220: Swift 原生 App 模式下不渲染 HTML 红黄绿按钮
  if (isNativeApp()) {
    return null;
  }

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

  // v1.5.201: 监听窗口失焦/聚焦，按钮颜色跟随系统状态
  useEffect(() => {
    if (!ready) return;
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
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
        .then(() => {
          setWindowState('maximized');
          // v1.7.15: 派发窗口最大化事件，让侧边栏按钮自动左对齐
          window.dispatchEvent(new CustomEvent('cdf-window-maximized'));
        })
        .catch(() => {});
    } else {
      callApi('window_toggle_fullscreen')
        .then(() => {
          setWindowState(s => s === 'normal' ? 'maximized' : 'normal');
          // v1.7.15: 派发窗口恢复正常事件
          window.dispatchEvent(new CustomEvent('cdf-window-restored'));
        })
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
        dimColor="#bf4942"
        hoverColor="#e0554e"
        icon="✕"
        title="关闭"
        onClick={handleClose}
        marginRight={BUTTON_GAP}
        focused={focused}
      />

      {/* 黄：最小化 */}
      <TrafficButton
        color="#febc2e"
        dimColor="#bf8e23"
        hoverColor="#e5a820"
        icon="−"
        title="最小化"
        onClick={handleMinimize}
        marginRight={BUTTON_GAP}
        focused={focused}
      />

      {/* 绿：最大化/还原 */}
      <TrafficButton
        color="#28c840"
        dimColor="#1e9630"
        hoverColor="#1fa835"
        icon={windowState === 'maximized' ? '⊡' : '+'}
        title={windowState === 'maximized' ? '还原' : '最大化'}
        onClick={handleMaximize}
        focused={focused}
      />
    </Box>
  );
};

// ---- 按钮子组件 ----

interface TrafficButtonProps {
  color: string;
  dimColor: string;
  hoverColor: string;
  icon: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  marginRight?: string;
  focused?: boolean;
}

const TrafficButton: React.FC<TrafficButtonProps> = ({
  color, dimColor, hoverColor, icon, title, onClick, marginRight = 0, focused = true,
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
        backgroundColor: hovered ? hoverColor : (focused ? color : dimColor),
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
