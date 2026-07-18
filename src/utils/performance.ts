import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useTransition,
  useDeferredValue,
  type DependencyList,
} from 'react';

// ========== 基础工具函数 ==========

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T & { cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: unknown[] | null = null;

  const debounced = ((...args: unknown[]) => {
    lastArgs = args;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
      lastArgs = null;
    }, delay);
  }) as T & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      lastArgs = null;
    }
  };

  debounced.flush = () => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      fn(...lastArgs);
      timer = null;
      lastArgs = null;
    }
  };

  return debounced;
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): T & { cancel: () => void } {
  let inThrottle = false;
  let lastArgs: unknown[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const throttled = ((...args: unknown[]) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      timer = setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn(...lastArgs);
          inThrottle = true;
          lastArgs = null;
          timer = setTimeout(() => {
            inThrottle = false;
          }, limit);
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    inThrottle = false;
    lastArgs = null;
  };

  return throttled;
}

export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  cacheSize: number = 100
): T {
  const cache = new Map<string, unknown>();

  return ((...args: unknown[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args);
    if (cache.size >= cacheSize) {
      const firstKey = cache.keys().next().value as string;
      cache.delete(firstKey);
    }
    cache.set(key, result);

    return result;
  }) as T;
}

export function createBatchProcessor<T>(
  processFn: (items: T[]) => Promise<void>,
  batchSize: number = 10,
  delayMs: number = 100
): (items: T[]) => Promise<void> {
  return async (items: T[]) => {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await processFn(batch);
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  };
}

// ========== React Hooks ==========

export function usePerformanceMeasure(id: string) {
  const startRef = useRef<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const start = useCallback(() => {
    startRef.current = performance.now();
  }, []);

  const end = useCallback(() => {
    const endTime = performance.now();
    const dur = endTime - startRef.current;
    setDuration(dur);
    return dur;
  }, []);

  const measure = useCallback(async <T>(fn: () => Promise<T> | T): Promise<{ result: T; duration: number }> => {
    start();
    const result = await fn();
    const dur = end();
    return { result, duration: dur };
  }, [start, end]);

  useEffect(() => {
    if (duration > 0) {
      // eslint-disable-next-line no-console
      console.debug(`[Performance] ${id}: ${duration.toFixed(2)}ms`);
    }
  }, [duration, id]);

  return { start, end, duration, measure };
}

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useThrottle<T>(value: T, limit: number = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastRunRef.current >= limit) {
      lastRunRef.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastRunRef.current = Date.now();
        setThrottledValue(value);
      }, limit - (now - lastRunRef.current));
      return () => clearTimeout(timer);
    }
  }, [value, limit]);

  return throttledValue;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
  }

  return false;
}

export function useMemoCompare<T>(factory: () => T, deps: DependencyList): T {
  const prevDepsRef = useRef<DependencyList | null>(null);
  const prevValueRef = useRef<T | null>(null);

  const depsChanged = !prevDepsRef.current ||
    prevDepsRef.current.length !== deps.length ||
    deps.some((dep, i) => !deepEqual(dep, prevDepsRef.current![i]));

  if (depsChanged) {
    prevValueRef.current = factory();
    prevDepsRef.current = deps;
  }

  return prevValueRef.current as T;
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: IntersectionObserverInit = {}
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options]);

  return [ref, isInView];
}

export interface VirtualListState {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
}

export interface UseVirtualListOptions<T> {
  items: T[];
  itemHeight?: number;
  getItemHeight?: (index: number, item: T) => number;
  overscan?: number;
  containerHeight: number;
}

export function useVirtualList<T>({
  items,
  itemHeight = 50,
  getItemHeight,
  overscan = 5,
  containerHeight,
}: UseVirtualListOptions<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const itemHeightsRef = useRef<Map<number, number>>(new Map());

  const getItemHeightFn = useCallback(
    (index: number): number => {
      if (getItemHeight && items[index]) {
        return getItemHeight(index, items[index]);
      }
      return itemHeight;
    },
    [getItemHeight, items, itemHeight]
  );

  const getItemOffset = useCallback(
    (index: number): number => {
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += itemHeightsRef.current.get(i) ?? getItemHeightFn(i);
      }
      return offset;
    },
    [getItemHeightFn]
  );

  const totalHeight = useMemo(() => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      total += itemHeightsRef.current.get(i) ?? getItemHeightFn(i);
    }
    return total;
  }, [items, getItemHeightFn]);

  const { startIndex, endIndex, offsetY } = useMemo(() => {
    if (items.length === 0 || containerHeight === 0) {
      return { startIndex: 0, endIndex: 0, offsetY: 0 };
    }

    let startIdx = 0;
    let accumulated = 0;

    for (let i = 0; i < items.length; i++) {
      const h = itemHeightsRef.current.get(i) ?? getItemHeightFn(i);
      if (accumulated + h > scrollTop) {
        startIdx = Math.max(0, i - overscan);
        break;
      }
      accumulated += h;
    }

    let endIdx = items.length - 1;
    accumulated = 0;
    for (let i = 0; i < items.length; i++) {
      const h = itemHeightsRef.current.get(i) ?? getItemHeightFn(i);
      if (accumulated >= scrollTop + containerHeight) {
        endIdx = Math.min(items.length - 1, i + overscan);
        break;
      }
      accumulated += h;
    }

    const offset = getItemOffset(startIdx);

    return { startIndex: startIdx, endIndex: endIdx, offsetY: offset };
  }, [items, scrollTop, containerHeight, overscan, getItemHeightFn, getItemOffset]);

  const measureItem = useCallback((index: number, height: number) => {
    itemHeightsRef.current.set(index, height);
  }, []);

  const scrollToIndex = useCallback(
    (index: number, _behavior: ScrollBehavior = 'smooth'): number => {
      const offset = getItemOffset(Math.max(0, Math.min(items.length - 1, index)));
      return offset;
    },
    [getItemOffset, items.length]
  );

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex + 1),
    [items, startIndex, endIndex]
  );

  return {
    visibleItems,
    startIndex,
    endIndex,
    offsetY,
    totalHeight,
    scrollTop,
    setScrollTop,
    measureItem,
    scrollToIndex,
  };
}

export function useDeferredValueWithTransition<T>(value: T): { deferredValue: T; isPending: boolean } {
  const [isPending, startTransition] = useTransition();
  const [deferred, setDeferred] = useState<T>(value);

  useEffect(() => {
    startTransition(() => {
      setDeferred(value);
    });
  }, [value]);

  const deferredValue = useDeferredValue(deferred);

  return { deferredValue, isPending };
}
