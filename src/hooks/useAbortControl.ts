import { useRef, useCallback } from 'react';

export interface AbortControlResult {
  /** 用户手动停止标志（不使用 AbortController signal，避免 Electron ERR_ABORTED） */
  stoppedRef: React.MutableRefObject<boolean>;
  /** 中断当前 AI 生成 */
  stopGeneration: () => void;
  /** 创建新的 AbortController */
  createController: () => AbortController;
  /** 获取当前 AbortController */
  getController: () => AbortController | null;
  /** 清除当前 AbortController */
  clearController: () => void;
  /** 检查是否已停止 */
  isStopped: () => boolean;
  /** 重置停止标志 */
  resetStopped: () => void;
}

/**
 * v2.8.9: 中断控制器 hook
 * 将 AI 生成中断逻辑从 useChat 中提取为独立 hook，
 * 职责单一：管理 AbortController 生命周期和用户停止标志。
 */
export function useAbortControl(): AbortControlResult {
  const abortControllerRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const stopGeneration = useCallback(() => {
    stoppedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const createController = useCallback(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller;
  }, []);

  const getController = useCallback(() => {
    return abortControllerRef.current;
  }, []);

  const clearController = useCallback(() => {
    abortControllerRef.current = null;
  }, []);

  const isStopped = useCallback(() => {
    return stoppedRef.current;
  }, []);

  const resetStopped = useCallback(() => {
    stoppedRef.current = false;
  }, []);

  return {
    stoppedRef,
    stopGeneration,
    createController,
    getController,
    clearController,
    isStopped,
    resetStopped,
  };
}
