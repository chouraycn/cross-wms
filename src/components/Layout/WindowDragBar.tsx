/**
 * v1.5.64: macOS pywebview 窗口拖拽条（pointer events + JS API）
 *
 * 注意：-webkit-app-region: drag 是 Electron/Chromium 专有属性，pywebview 的
 * WKWebView 不支持。必须通过 JS pointer events + pywebview.api.window_move() 实现。
 *
 * 方案：pointerdown 时记录初始位置 + setPointerCapture 捕获所有后续移动事件，
 * pointermove 时计算增量并调用 window_move(dx, dy)。
 *
 * 文本选中：仅拖拽条禁用 user-select，内容区不受影响。
 */
import React, { useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import { isPyWebView } from '../../services/tencentDocsApi';

interface WindowDragBarProps {
  height?: number;
}

const DRAG_THRESHOLD = 3; // 移动超过 3px 才触发拖拽（防止误触）

export const WindowDragBar: React.FC<WindowDragBarProps> = ({ height = 20 }) => {
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const movedTotal = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 只响应鼠标左键
    if (e.button !== 0) return;

    const el = e.currentTarget as HTMLElement;
    // 关键：setPointerCapture 确保即使鼠标移出拖拽条，也能收到后续事件
    el.setPointerCapture(e.pointerId);

    isDragging.current = true;
    movedTotal.current = false;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const dx = e.clientX - lastX.current;
    const dy = e.clientY - lastY.current;

    // 超过阈值才开始拖拽
    if (!movedTotal.current) {
      const total = Math.abs(dx) + Math.abs(dy);
      if (total < DRAG_THRESHOLD) return;
      movedTotal.current = true;
    }

    lastX.current = e.clientX;
    lastY.current = e.clientY;

    // 调用 Python 端 window_move(delta_x, delta_y)
    try {
      const w = window as any;
      if (w.pywebview?.api?.window_move) {
        w.pywebview.api.window_move(dx, dy).catch(() => {});
      }
    } catch {
      // 非 pywebview 环境，忽略
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // 忽略 releasePointerCapture 错误
    }
  }, []);

  if (!isPyWebView()) return null;

  return (
    <Box
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height,
        zIndex: 9999,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'default',
        background: 'transparent',
        // 确保拖拽条可以接收到指针事件
        pointerEvents: 'auto',
      }}
    />
  );
};
