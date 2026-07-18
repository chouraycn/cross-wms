/**
 * useModelPreferences — 模型用户的 UI 偏好（置顶 / 收藏 / 隐藏）
 *
 * 这些是纯前端 UI 偏好，使用 localStorage 持久化。
 * 不影响后端实际配置，便于跨设备登录后重置。
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'cross-wms.model-preferences.v1';

export interface ModelPreferences {
  /** 置顶（钉在列表头部） */
  pinned: string[];
  /** 收藏（仅 UI 标记，不影响后端） */
  favorites: string[];
  /** 隐藏（不在主列表显示，但可在「显示隐藏」时查看） */
  hidden: string[];
}

const DEFAULT: ModelPreferences = { pinned: [], favorites: [], hidden: [] };

function readStorage(): ModelPreferences {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<ModelPreferences>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return DEFAULT;
  }
}

function writeStorage(prefs: ModelPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略存储错误
  }
}

export function useModelPreferences(): {
  preferences: ModelPreferences;
  isPinned: (id: string) => boolean;
  isFavorite: (id: string) => boolean;
  isHidden: (id: string) => boolean;
  togglePin: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleHidden: (id: string) => void;
} {
  const [preferences, setPreferences] = useState<ModelPreferences>(DEFAULT);

  useEffect(() => {
    setPreferences(readStorage());
  }, []);

  const _persist = useCallback((next: ModelPreferences) => {
    setPreferences(next);
    writeStorage(next);
  }, []);

  const isPinned = useCallback((id: string) => preferences.pinned.includes(id), [preferences.pinned]);
  const isFavorite = useCallback((id: string) => preferences.favorites.includes(id), [preferences.favorites]);
  const isHidden = useCallback((id: string) => preferences.hidden.includes(id), [preferences.hidden]);

  const togglePin = useCallback((id: string) => {
    setPreferences(prev => {
      const next: ModelPreferences = {
        ...prev,
        pinned: prev.pinned.includes(id) ? prev.pinned.filter(x => x !== id) : [...prev.pinned, id],
      };
      writeStorage(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setPreferences(prev => {
      const next: ModelPreferences = {
        ...prev,
        favorites: prev.favorites.includes(id) ? prev.favorites.filter(x => x !== id) : [...prev.favorites, id],
      };
      writeStorage(next);
      return next;
    });
  }, []);

  const toggleHidden = useCallback((id: string) => {
    setPreferences(prev => {
      const next: ModelPreferences = {
        ...prev,
        hidden: prev.hidden.includes(id) ? prev.hidden.filter(x => x !== id) : [...prev.hidden, id],
      };
      writeStorage(next);
      return next;
    });
  }, []);

  return { preferences, isPinned, isFavorite, isHidden, togglePin, toggleFavorite, toggleHidden };
}
