import React, { useRef, useCallback, useMemo, useState, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import { throttle } from '../../utils/performance';

export interface VirtualListHandle {
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  scrollToTop: (behavior?: ScrollBehavior) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  getScrollTop: () => number;
}

interface VirtualListProps<T> {
  items: T[];
  itemContent: (item: T, index: number) => React.ReactNode;
  itemSize?: number;
  estimateHeight?: number;
  getItemSize?: (index: number, item: T) => number;
  overscan?: number;
  style?: React.CSSProperties;
  className?: string;
  maxHeight?: number;
  height?: number | string;
  onScroll?: (scrollTop: number) => void;
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
  scrollToIndex?: number;
  initialScrollTop?: number;
}

interface ItemSize {
  height: number;
  estimated: boolean;
}

export const VirtualList = forwardRef(function VirtualList<T extends object>(
  {
    items,
    itemContent,
    itemSize,
    estimateHeight = 50,
    getItemSize,
    overscan = 5,
    style = {},
    className,
    maxHeight = 300,
    height,
    onScroll,
    onVisibleRangeChange,
    initialScrollTop = 0,
  }: VirtualListProps<T>,
  ref: React.Ref<VirtualListHandle>
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemSizesRef = useRef<Map<number, ItemSize>>(new Map());
  const itemElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const [containerHeight, setContainerHeight] = useState(0);
  const prevVisibleRangeRef = useRef<{ start: number; end: number }>({ start: -1, end: -1 });

  const effectiveHeight = itemSize ?? estimateHeight;

  const getItemHeight = useCallback(
    (index: number): number => {
      const cached = itemSizesRef.current.get(index);
      if (cached && !cached.estimated) {
        return cached.height;
      }
      if (getItemSize && items[index]) {
        return getItemSize(index, items[index]);
      }
      return effectiveHeight;
    },
    [getItemSize, items, effectiveHeight]
  );

  const getItemOffset = useCallback(
    (index: number): number => {
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += getItemHeight(i);
      }
      return offset;
    },
    [getItemHeight]
  );

  const calculateTotalHeight = useCallback(() => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      total += getItemHeight(i);
    }
    return total;
  }, [items, getItemHeight]);

  const getVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return { start: 0, end: 0 };

    const clientHeight = containerHeight || container.clientHeight || (typeof maxHeight === 'number' ? maxHeight : 300);
    const startOffset = Math.max(0, scrollTop - overscan * effectiveHeight);
    const endOffset = scrollTop + clientHeight + overscan * effectiveHeight;

    let start = 0;
    let end = items.length - 1;
    let currentOffset = 0;
    let foundStart = false;

    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight(i);
      const itemTop = currentOffset;
      const itemBottom = currentOffset + height;

      if (!foundStart && itemBottom > startOffset) {
        start = i;
        foundStart = true;
      }
      if (itemTop >= endOffset) {
        end = i;
        break;
      }
      currentOffset += height;
    }

    return { start: Math.max(0, start), end: Math.min(items.length - 1, end) };
  }, [items, effectiveHeight, overscan, scrollTop, containerHeight, getItemHeight]);

  const measureItem = useCallback((index: number) => {
    const el = itemElementsRef.current.get(index);
    if (el) {
      const height = el.getBoundingClientRect().height;
      const prev = itemSizesRef.current.get(index);
      if (!prev || prev.height !== height || prev.estimated) {
        itemSizesRef.current.set(index, { height, estimated: false });
        return true;
      }
    }
    return false;
  }, []);

  const measureVisibleItems = useCallback(() => {
    const { start, end } = getVisibleRange();
    let changed = false;
    for (let i = start; i <= end; i++) {
      if (measureItem(i)) {
        changed = true;
      }
    }
    return changed;
  }, [getVisibleRange, measureItem]);

  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (items.length > 0) {
      const changed = measureVisibleItems();
      if (changed) {
        rerender();
      }
    }
  });

  const throttledScroll = useMemo(
    () =>
      throttle(() => {
        const container = containerRef.current;
        if (!container) return;

        const currentScrollTop = container.scrollTop;
        setScrollTop(currentScrollTop);

        if (onScroll) {
          onScroll(currentScrollTop);
        }

        const changed = measureVisibleItems();
        if (changed) {
          rerender();
        }

        const { start, end } = getVisibleRange();
        if (prevVisibleRangeRef.current.start !== start || prevVisibleRangeRef.current.end !== end) {
          prevVisibleRangeRef.current = { start, end };
          if (onVisibleRangeChange) {
            onVisibleRangeChange(start, end);
          }
        }
      }, 16),
    [onScroll, onVisibleRangeChange, measureVisibleItems, getVisibleRange, rerender]
  );

  const handleScroll = useCallback(() => {
    throttledScroll();
  }, [throttledScroll]);

  const scrollToIndexFn = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current;
      if (!container) return;

      const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
      const offset = getItemOffset(clampedIndex);
      container.scrollTo({ top: offset, behavior });
    },
    [items.length, getItemOffset]
  );

  const scrollToTopFn = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior });
  }, []);

  const scrollToBottomFn = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current;
      if (!container) return;
      const totalHeight = calculateTotalHeight();
      container.scrollTo({ top: totalHeight, behavior });
    },
    [calculateTotalHeight]
  );

  const getScrollTopFn = useCallback(() => {
    return containerRef.current?.scrollTop ?? 0;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: scrollToIndexFn,
      scrollToTop: scrollToTopFn,
      scrollToBottom: scrollToBottomFn,
      getScrollTop: getScrollTopFn,
    }),
    [scrollToIndexFn, scrollToTopFn, scrollToBottomFn, getScrollTopFn]
  );

  const { start, end } = getVisibleRange();
  const totalHeight = calculateTotalHeight();
  const visibleItems = items.slice(start, end + 1);
  const beforeHeight = getItemOffset(start);

  const containerStyle: React.CSSProperties = {
    maxHeight,
    overflowY: 'auto',
    overflowX: 'hidden',
    position: 'relative',
    ...style,
  };

  if (height !== undefined) {
    containerStyle.height = height;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: 'relative',
          willChange: 'transform',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: beforeHeight,
            pointerEvents: 'none',
          }}
        />
        {visibleItems.map((item, idx) => {
          const globalIndex = start + idx;
          return (
            <div
              key={globalIndex}
              ref={el => {
                if (el) {
                  itemElementsRef.current.set(globalIndex, el);
                } else {
                  itemElementsRef.current.delete(globalIndex);
                }
              }}
              style={{
                position: 'absolute',
                top: beforeHeight + idx * 0,
                left: 0,
                right: 0,
                transform: `translateY(${getItemOffset(globalIndex) - beforeHeight}px)`,
              }}
            >
              {itemContent(item, globalIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}) as <T extends object>(
  props: VirtualListProps<T> & { ref?: React.Ref<VirtualListHandle> }
) => React.ReactElement;
