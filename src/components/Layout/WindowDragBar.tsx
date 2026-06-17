/**
 * v2.5.0 → v1.5.107: macOS pywebview 窗口拖拽条（系统原生拖拽）
 *
 * 方案：pywebview easy_drag=False + CSS -webkit-app-region:drag
 * 系统 Cocoa 原生处理拖拽，零 JS 事件，零抖动。
 *
 * v1.5.107: 侧边栏本身也设了 WebkitAppRegion:drag（Logo 区域可拖拽），
 * 交互元素（NavList/设置按钮）通过 no-drag 排除。
 * 此拖拽条从 left:0 开始，覆盖整个窗口顶部，与侧边栏 drag 区域重叠无缝衔接。
 */

import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { isPyWebView } from '../../services/tencentDocsApi';

export const WindowDragBar: React.FC<{ height?: number; sidebarCollapsed?: boolean }> = ({ height = 38 }) => {
  // v1.5.80: 使用自检轮询，确保 pywebview 环境注入后正确渲染
  const [ready, setReady] = useState(() => isPyWebView());

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
        left: 0,
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
