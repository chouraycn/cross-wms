import { useRef, useCallback } from 'react';
import { isDesktopApp } from '../utils/env';

/**
 * v2.8.6: 自适应渲染调度器 — WKWebView 兼容
 * WKWebView 在窗口可见但未交互时会暂停 requestAnimationFrame，
 * 导致 SSE 流式内容堆积不渲染。在 pywebview 环境中降级为 setTimeout(fn, 16)，
 * 确保渲染不被暂停。浏览器环境仍使用 rAF 以保持与显示器刷新率对齐。
 */
const IS_PYWEBVIEW = isDesktopApp();

const scheduleFrame = IS_PYWEBVIEW
  ? (fn: FrameRequestCallback): number => window.setTimeout(() => fn(Date.now()), 16)
  : (fn: FrameRequestCallback): number => requestAnimationFrame(fn);

const cancelFrame = IS_PYWEBVIEW
  ? (id: number): void => window.clearTimeout(id)
  : (id: number): void => cancelAnimationFrame(id);

export interface RenderSchedulerOptions {
  /** 每帧渲染回调，接收当前显示内容和元数据 */
  onFrame: (displayedContent: string, metadata: Record<string, any>) => void;
}

export interface RenderSchedulerResult {
  /** 调度一帧渲染 */
  scheduleRender: () => void;
  /** 获取待显示内容 */
  getPendingContent: () => string;
  /** 追加待显示内容 */
  appendPendingContent: (text: string) => void;
  /** 设置待显示内容（覆盖） */
  setPendingContent: (text: string) => void;
  /** 获取已显示内容 */
  getDisplayedContent: () => string;
  /** 设置已显示内容 */
  setDisplayedContent: (text: string) => void;
  /** 立即 flush 当前内容 */
  flush: () => void;
  /** 清理资源（事件监听、定时器） */
  destroy: () => void;
}

/**
 * v2.8.9: 流式消息渲染调度器
 * 将 SSE 流式消息的渲染逻辑从 useChat 中提取为独立 hook，
 * 职责单一：管理 pendingContent → displayedContent 的分块渲染，
 * 与显示器刷新率对齐，支持 WKWebView 兼容模式。
 */
export function useRenderScheduler(options: RenderSchedulerOptions): RenderSchedulerResult {
  const { onFrame } = options;

  const pendingContentRef = useRef('');
  const displayedContentRef = useRef('');
  const renderHandleRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const lastMetadataFlushRef = useRef(0);

  // v2.2.3: 提速渲染 — 深度思考产生大量文本，6字/20ms 太慢
  const BASE_CHUNK_SIZE = 24;
  // v2.8.5: 元数据渲染节流 — 纯 thinking/元数据事件时限制为 10fps
  const METADATA_THROTTLE_MS = 100;

  const flushRender = useCallback(() => {
    renderHandleRef.current = null;
    let shouldReschedule = false;
    const pendingContent = pendingContentRef.current;

    // Process pending text content (chunked for typewriter effect)
    if (pendingContent.length > 0) {
      const adaptiveChunk = Math.min(
        Math.max(BASE_CHUNK_SIZE, Math.ceil(pendingContent.length / 15)),
        pendingContent.length
      );
      const chunk = pendingContent.slice(0, adaptiveChunk);
      pendingContentRef.current = pendingContent.slice(adaptiveChunk);
      displayedContentRef.current += chunk;
      dirtyRef.current = true;
      if (pendingContentRef.current.length > 0) {
        shouldReschedule = true;
      }
    }

    // Skip render if nothing changed since last flush
    if (!dirtyRef.current && !shouldReschedule) return;

    // v2.8.5: 纯元数据渲染节流 — 无 pending text 时限制为 10fps
    const isMetadataOnly = pendingContentRef.current.length === 0 && !shouldReschedule;
    if (isMetadataOnly) {
      const now = Date.now();
      if (now - lastMetadataFlushRef.current < METADATA_THROTTLE_MS) {
        renderHandleRef.current = scheduleFrame(flushRender);
        return;
      }
      lastMetadataFlushRef.current = now;
    }

    dirtyRef.current = false;
    onFrame(displayedContentRef.current, {});

    if (shouldReschedule) {
      renderHandleRef.current = scheduleFrame(flushRender);
    }
  }, [onFrame]);

  const scheduleRender = useCallback(() => {
    dirtyRef.current = true;
    if (renderHandleRef.current === null) {
      renderHandleRef.current = scheduleFrame(flushRender);
    }
  }, [flushRender]);

  const destroy = useCallback(() => {
    if (renderHandleRef.current !== null) {
      cancelFrame(renderHandleRef.current);
      renderHandleRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    flushRender();
  }, [flushRender]);

  return {
    scheduleRender,
    getPendingContent: () => pendingContentRef.current,
    appendPendingContent: (text: string) => {
      pendingContentRef.current += text;
    },
    setPendingContent: (text: string) => {
      pendingContentRef.current = text;
    },
    getDisplayedContent: () => displayedContentRef.current,
    setDisplayedContent: (text: string) => {
      displayedContentRef.current = text;
    },
    flush,
    destroy,
  };
}
