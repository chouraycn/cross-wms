import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import PulsingText from '../PulsingText';
import { usePageFadeIn } from '../../../hooks/usePageFadeIn';

/**
 * 锁定 WKWebView 兼容契约：
 * - PulsingText 不得使用 CSS `animation`（应用 opacity + transition 实现呼吸）
 * - usePageFadeIn 挂载后应从基类名过渡到追加 `visible`（transition 驱动，无 @keyframes）
 */
describe('WKWebView 兼容动画', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it('PulsingText 渲染文字且不使用 CSS animation', () => {
    render(<PulsingText>处理中...</PulsingText>);
    const el = screen.getByText('处理中...');
    // 不允许出现 animation（@keyframes 依赖）
    expect(el.getAttribute('style') || '').not.toContain('animation');
    // 应使用 transition 实现
    expect(el.getAttribute('style') || '').toContain('transition');
  });

  it('usePageFadeIn 挂载后追加 visible 类', () => {
    const { result } = renderHook(() => usePageFadeIn());
    expect(result.current).toBe('page-fade-in');
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current).toBe('page-fade-in visible');
  });
});
