/**
 * 草稿持久化 Hook
 *
 * - 自动保存输入框内容到 localStorage
 * - 防抖 500ms 保存
 * - 页面加载时自动恢复
 * - 发送消息后自动清空草稿
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const DEBOUNCE_MS = 500;

function getDraftKey(sessionId: string): string {
  return `cdf-chat-draft-${sessionId}`;
}

function loadDraft(sessionId: string): string {
  try {
    return localStorage.getItem(getDraftKey(sessionId)) ?? '';
  } catch {
    return '';
  }
}

function saveDraft(sessionId: string, text: string): void {
  try {
    localStorage.setItem(getDraftKey(sessionId), text);
  } catch {
    // ignore
  }
}

function removeDraft(sessionId: string): void {
  try {
    localStorage.removeItem(getDraftKey(sessionId));
  } catch {
    // ignore
  }
}

export interface UseDraftReturn {
  draft: string;
  setDraft: (text: string) => void;
  clearDraft: () => void;
}

export function useDraft(sessionId: string): UseDraftReturn {
  const [draft, setDraftState] = useState<string>(() => loadDraft(sessionId));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftState(loadDraft(sessionId));
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        saveDraft(sessionId, text);
      }, DEBOUNCE_MS);
    },
    [sessionId],
  );

  const clearDraft = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDraftState('');
    removeDraft(sessionId);
  }, [sessionId]);

  return {
    draft,
    setDraft,
    clearDraft,
  };
}
