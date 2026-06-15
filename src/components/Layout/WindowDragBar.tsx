/**
 * v2.5.0: macOS pywebview 窗口拖拽条（系统原生拖拽）
 *
 * 方案：pywebview easy_drag=True + CSS -webkit-app-region:drag
 * 系统 Cocoa 原生处理拖拽，零 JS 事件，零抖动。
 *
 * 主内容区和 Sidebar 交互元素通过 WebkitAppRegion:no-drag 排除，
 * 文本选择、按钮点击不受影响。
 *
 * 之前的方案（v2.4.1，JS pointer events + rAF）因 WKWebView JS↔Python
 * 桥接延迟导致坐标累积抖动，已废弃。
 */
import React from 'react';
import { Box } from '@mui/material';
import { isPyWebView } from '../../services/tencentDocsApi';

export const WindowDragBar: React.FC<{ height?: number }> = ({ height = 38 }) => {
  if (!isPyWebView()) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height,
        zIndex: 9999,
        cursor: 'default',
        background: 'transparent',
        pointerEvents: 'auto',
        WebkitAppRegion: 'drag',
      }}
    />
  );
};
