/**
 * v2.5.0: macOS pywebview 窗口拖拽条（系统原生拖拽）
 *
 * 方案：pywebview easy_drag=False + CSS -webkit-app-region:drag
 * 系统 Cocoa 原生处理拖拽，零 JS 事件，零抖动。
 *
 * 主内容区和 Sidebar 交互元素通过 WebkitAppRegion:no-drag 排除，
 * 文本选择、按钮点击不受影响。
 *
 * 之前的方案（v2.4.1，JS pointer events + rAF）因 WKWebView JS↔Python
 * 桥接延迟导致坐标累积抖动，已废弃。
 */

import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { isPyWebView } from '../../services/tencentDocsApi';

export const WindowDragBar: React.FC<{ height?: number; sidebarCollapsed?: boolean }> = ({ height = 38, sidebarCollapsed = false }) => {
  // v1.5.80: 使用自检轮询，确保 pywebview 环境注入后正确渲染
  const [ready, setReady] = useState(() => isPyWebView());

  // 侧边栏宽度：收起 83px / 展开 260px
  // 收起时 + 展开按钮宽度(26px) + 间距，避免拖拽条覆盖按钮
  const sidebarWidth = sidebarCollapsed ? 120 : 260;

  useEffect(() => {
    if (ready) return;
    // pywebview JS 桥接可能有延迟，轮询检测
    const id = setInterval(() => {
      if (isPyWebView()) {
        setReady(true);
        clearInterval(id);
      }
    }, 100);
    setTimeout(() => clearInterval(id), 3000);
    return () => clearInterval(id);
  }, [ready]);

  if (!ready) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: sidebarWidth,
        right: 0,
        height,
        zIndex: 9999,
        cursor: 'default',
        background: 'transparent',
        pointerEvents: 'auto',
      }}
      // v2.5.1-fix: MUI sx 无法正确输出 -webkit-app-region 到构建产物，
      // 改用 React style prop（原生处理 vendor-prefixed CSS 属性）
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  );
};
