/**
 * useModelPreferences 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModelPreferences } from '../hooks/useModelPreferences';

describe('useModelPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('初始状态为空', () => {
    const { result } = renderHook(() => useModelPreferences());
    expect(result.current.preferences.pinned).toEqual([]);
    expect(result.current.preferences.favorites).toEqual([]);
    expect(result.current.preferences.hidden).toEqual([]);
    expect(result.current.isPinned('x')).toBe(false);
    expect(result.current.isFavorite('x')).toBe(false);
    expect(result.current.isHidden('x')).toBe(false);
  });

  it('togglePin 添加 / 移除', () => {
    const { result } = renderHook(() => useModelPreferences());
    act(() => result.current.togglePin('m1'));
    expect(result.current.isPinned('m1')).toBe(true);
    act(() => result.current.togglePin('m1'));
    expect(result.current.isPinned('m1')).toBe(false);
  });

  it('toggleFavorite 添加 / 移除', () => {
    const { result } = renderHook(() => useModelPreferences());
    act(() => result.current.toggleFavorite('m1'));
    expect(result.current.isFavorite('m1')).toBe(true);
    act(() => result.current.toggleFavorite('m1'));
    expect(result.current.isFavorite('m1')).toBe(false);
  });

  it('toggleHidden 添加 / 移除', () => {
    const { result } = renderHook(() => useModelPreferences());
    act(() => result.current.toggleHidden('m1'));
    expect(result.current.isHidden('m1')).toBe(true);
    act(() => result.current.toggleHidden('m1'));
    expect(result.current.isHidden('m1')).toBe(false);
  });

  it('从 localStorage 读取', () => {
    localStorage.setItem('cross-wms.model-preferences.v1', JSON.stringify({ pinned: ['m1'], favorites: ['m2'], hidden: [] }));
    const { result } = renderHook(() => useModelPreferences());
    expect(result.current.isPinned('m1')).toBe(true);
    expect(result.current.isFavorite('m2')).toBe(true);
  });
});
