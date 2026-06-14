/**
 * v2.2.1: macOS pywebview 窗口拖拽条
 *
 * 背景：pywebview 的 easy_drag=True 会全局拦截鼠标事件，导致无法选中文本。
 * 解决方案：关闭 easy_drag，改用前端局部拖拽区域 — 只有拖拽条响应鼠标拖拽，
 * 内容区域完全不受影响，可以正常选中和复制。
 *
 * 实现：监听 mousedown → mousemove → mouseup，计算鼠标位移，
 * 通过 pywebview JS API 调用 Python 后端 window_move 方法移动窗口。
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { isPyWebView } from '../../services/tencentDocsApi';

interface WindowDragBarProps {
  height?: number;
}

export const WindowDragBar: React.FC<WindowDragBarProps> = ({ height = 38 }) => {
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastMoveTime = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只响应左键，且不是点击在按钮/输入框上
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // 如果点击的是按钮、链接、输入框等交互元素，不启动拖拽
    if (target.closest('button, a, input, textarea, [role="button"]')) return;

    isDragging.current = true;
    startPos.current = { x: e.screenX, y: e.screenY };
    lastMoveTime.current = Date.now();
    // 防止文本选择
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // 节流：每 16ms（约 60fps）最多发送一次
      const now = Date.now();
      if (now - lastMoveTime.current < 16) return;
      lastMoveTime.current = now;

      const deltaX = e.screenX - startPos.current.x;
      const deltaY = e.screenY - startPos.current.y;

      // 更新起始位置（累积位移）
      startPos.current = { x: e.screenX, y: e.screenY };

      const api = (window as any).pywebview?.api;
      if (api?.window_move) {
        api.window_move(deltaX, deltaY).catch(() => {});
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 非 pywebview 环境不渲染
  if (!isPyWebView()) return null;

  return (
    <Box
      onMouseDown={handleMouseDown}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height,
        zIndex: 9999,
        // 视觉提示：hover 时显示拖拽光标
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        // 透明背景，不遮挡内容
        background: 'transparent',
        // 禁止文本选择（拖拽时）
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    />
  );
};
