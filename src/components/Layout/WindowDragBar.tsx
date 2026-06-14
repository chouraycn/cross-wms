/**
 * v2.3.0: macOS pywebview 窗口拖拽条（CSS 原生方案）
 *
 * 背景：JS mousemove 方案在 WKWebView 中不稳定，导致拖拽失效。
 * 解决方案：使用 macOS WKWebView 原生支持的 -webkit-app-region CSS 属性，
 * 将拖拽条标记为可拖拽区域，完全由系统处理窗口移动，无需 JS 事件。
 *
 * 文本可选中：内容区不设 user-select: none，拖拽条单独设 WebkitAppRegion: 'drag'。
 */
import React from 'react';
import { Box } from '@mui/material';
import { isPyWebView } from '../../services/tencentDocsApi';

interface WindowDragBarProps {
  height?: number;
}

export const WindowDragBar: React.FC<WindowDragBarProps> = ({ height = 20 }) => {
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
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        background: 'transparent',
      }}
    />
  );
};
