import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  debounce,
  throttle,
  memoize,
  deepEqual,
  useDebounce,
  useThrottle,
  useMemoCompare,
  usePerformanceMeasure,
  useInView,
  useVirtualList,
} from '../utils/performance';
import { renderHook, act } from '@testing-library/react';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该延迟执行函数', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应该取消执行', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced();
    debounced.cancel();

    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('应该立即执行 flush', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);

    debounced('test');
    debounced.flush();

    expect(fn).toHaveBeenCalledWith('test');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该节流执行', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('应该取消节流', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000);

    throttled();
    throttled.cancel();

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('memoize', () => {
  it('应该缓存结果', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn as unknown as (...args: unknown[]) => unknown);

    expect(memoized(2)).toBe(4);
    expect(memoized(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应该限制缓存大小', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn as unknown as (...args: unknown[]) => unknown, 2);

    memoized(1);
    memoized(2);
    memoized(3);
    memoized(1);

    expect(fn).toHaveBeenCalledTimes(4);
  });
});

describe('deepEqual', () => {
  it('应该比较原始值', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
  });

  it('应该比较对象', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it('应该比较数组', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('应该比较嵌套对象', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('应该比较 Date', () => {
    const date1 = new Date('2023-01-01');
    const date2 = new Date('2023-01-01');
    const date3 = new Date('2023-01-02');
    expect(deepEqual(date1, date2)).toBe(true);
    expect(deepEqual(date1, date3)).toBe(false);
  });
});

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该延迟更新值', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );

    expect(result.current).toBe('initial');

    rerender({ value: 'updated', delay: 300 });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('updated');
  });
});

describe('useThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该节流值更新', () => {
    const { result, rerender } = renderHook(
      ({ value, limit }) => useThrottle(value, limit),
      { initialProps: { value: 'a', limit: 300 } }
    );

    expect(result.current).toBe('a');

    rerender({ value: 'b', limit: 300 });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('b');
  });
});

describe('useMemoCompare', () => {
  it('应该使用深比较来缓存值', () => {
    const factory = vi.fn(() => ({ value: 42 }));
    const { result, rerender } = renderHook(
      ({ deps }) => useMemoCompare(factory, deps),
      { initialProps: { deps: [{ a: 1 }] } }
    );

    const firstResult = result.current;
    expect(factory).toHaveBeenCalledTimes(1);

    rerender({ deps: [{ a: 1 }] });
    expect(result.current).toBe(firstResult);
    expect(factory).toHaveBeenCalledTimes(1);

    rerender({ deps: [{ a: 2 }] });
    expect(result.current).not.toBe(firstResult);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('usePerformanceMeasure', () => {
  it('应该测量执行时间', () => {
    const { result } = renderHook(() => usePerformanceMeasure('test'));

    act(() => {
      result.current.start();
    });
    act(() => {
      const duration = result.current.end();
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('useVirtualList', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }));

  it('应该计算可见项', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        overscan: 0,
        containerHeight: 200,
      })
    );

    expect(result.current.visibleItems.length).toBeGreaterThanOrEqual(4);
    expect(result.current.visibleItems.length).toBeLessThanOrEqual(6);
    expect(result.current.totalHeight).toBe(5000);
  });

  it('应该响应滚动', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        overscan: 0,
        containerHeight: 200,
      })
    );

    act(() => {
      result.current.setScrollTop(500);
    });

    expect(result.current.startIndex).toBe(10);
  });

  it('应该计算 scrollToIndex', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        overscan: 0,
        containerHeight: 200,
      })
    );

    const offset = result.current.scrollToIndex(10);
    expect(offset).toBe(500);
  });
});

describe('useInView', () => {
  const observeMock = vi.fn();
  const disconnectMock = vi.fn();

  beforeEach(() => {
    const MockIntersectionObserver = vi.fn(
      (callback: IntersectionObserverCallback) => {
        observeMock.mockImplementation((el: Element) => {
          callback([{ isIntersecting: true, target: el } as IntersectionObserverEntry], MockIntersectionObserver.prototype);
        });
        return {
          observe: observeMock,
          disconnect: disconnectMock,
          root: null,
          rootMargin: '',
          thresholds: [],
          takeRecords: vi.fn(),
          unobserve: vi.fn(),
        };
      }
    );

    (global as typeof global & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该检测元素是否在视口中', () => {
    const { result } = renderHook(() => useInView());

    const [ref, isInView] = result.current;
    expect(ref).toBeDefined();
    expect(typeof isInView).toBe('boolean');
  });
});
