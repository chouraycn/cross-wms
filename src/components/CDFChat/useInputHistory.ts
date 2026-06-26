/**
 * 输入历史 Hook
 *
 * - 保存用户发送过的消息历史（最多 50 条）
 * - 按 ↑ 键浏览上一条历史，↓ 键浏览下一条
 * - 存储在 localStorage 中
 * - 非空消息才存入历史
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const MAX_HISTORY = 50;

function getHistoryKey(sessionId: string): string {
  return `cdf-chat-input-history-${sessionId}`;
}

function loadHistory(sessionId: string): string[] {
  try {
    const raw = localStorage.getItem(getHistoryKey(sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(sessionId: string, history: string[]): void {
  try {
    localStorage.setItem(getHistoryKey(sessionId), JSON.stringify(history));
  } catch {
    // ignore
  }
}

export interface UseInputHistoryReturn {
  history: string[];
  addHistory: (msg: string) => void;
  navigateHistory: (direction: 'up' | 'down', currentInput: string) => string;
}

export function useInputHistory(sessionId: string): UseInputHistoryReturn {
  const [history, setHistory] = useState<string[]>(() => loadHistory(sessionId));
  const indexRef = useRef<number>(-1);
  const tempInputRef = useRef<string>('');

  useEffect(() => {
    setHistory(loadHistory(sessionId));
    indexRef.current = -1;
  }, [sessionId]);

  const addHistory = useCallback(
    (msg: string) => {
      const trimmed = msg.trim();
      if (!trimmed) return;

      setHistory((prev) => {
        const filtered = prev.filter((item) => item !== trimmed);
        const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
        saveHistory(sessionId, next);
        return next;
      });
      indexRef.current = -1;
    },
    [sessionId],
  );

  const navigateHistory = useCallback(
    (direction: 'up' | 'down', currentInput: string): string => {
      if (history.length === 0) return currentInput;

      if (direction === 'up') {
        if (indexRef.current === -1) {
          tempInputRef.current = currentInput;
        }
        const nextIndex = Math.min(indexRef.current + 1, history.length - 1);
        indexRef.current = nextIndex;
        return history[nextIndex];
      } else {
        if (indexRef.current === -1) return currentInput;
        const nextIndex = indexRef.current - 1;
        if (nextIndex < 0) {
          indexRef.current = -1;
          return tempInputRef.current;
        }
        indexRef.current = nextIndex;
        return history[nextIndex];
      }
    },
    [history],
  );

  return {
    history,
    addHistory,
    navigateHistory,
  };
}
