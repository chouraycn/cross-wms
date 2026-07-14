import React, { useRef, useCallback } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemContent: (item: T, index: number) => React.ReactNode;
  itemSize?: number;
  estimateHeight?: number;
  overscan?: number;
  style?: React.CSSProperties;
  className?: string;
  maxHeight?: number;
  onScroll?: (scrollTop: number) => void;
}

interface ItemSize {
  height: number;
  estimated: boolean;
}

export const VirtualList = <T extends object>({
  items,
  itemContent,
  itemSize,
  estimateHeight = 50,
  overscan = 5,
  style = {},
  className,
  maxHeight = 300,
  onScroll,
}: VirtualListProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemSizesRef = useRef<Map<number, ItemSize>>(new Map());
  const effectiveHeight = itemSize ?? estimateHeight;

  const calculateTotalHeight = useCallback(() => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const size = itemSizesRef.current.get(i);
      total += size?.height ?? effectiveHeight;
    }
    return total;
  }, [items, effectiveHeight]);

  const getVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { start: 0, end: items.length - 1 };

    const { scrollTop, clientHeight } = container;
    const startOffset = scrollTop - overscan * effectiveHeight;
    const endOffset = scrollTop + clientHeight + overscan * effectiveHeight;

    let start = 0;
    let end = items.length - 1;
    let currentOffset = 0;

    for (let i = 0; i < items.length; i++) {
      const size = itemSizesRef.current.get(i);
      const height = size?.height ?? effectiveHeight;
      if (currentOffset + height > startOffset && start === 0) {
        start = i;
      }
      if (currentOffset >= endOffset) {
        end = Math.min(i + overscan, items.length - 1);
        break;
      }
      currentOffset += height;
    }

    return { start: Math.max(0, start), end: Math.min(items.length - 1, end) };
  }, [items, effectiveHeight, overscan]);

  const getOffset = useCallback((index: number) => {
    let offset = 0;
    for (let i = 0; i < index; i++) {
      const size = itemSizesRef.current.get(i);
      offset += size?.height ?? effectiveHeight;
    }
    return offset;
  }, [effectiveHeight]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (container && onScroll) {
      onScroll(container.scrollTop);
    }
  }, [onScroll]);

  const { start, end } = getVisibleRange();
  const totalHeight = calculateTotalHeight();

  const visibleItems = items.slice(start, end + 1);
  const beforeHeight = getOffset(start);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        maxHeight,
        overflow: 'auto',
        position: 'relative',
        ...style,
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'sticky', top: 0, height: beforeHeight }} />
        {visibleItems.map((item, idx) => {
          const globalIndex = start + idx;
          return (
            <div
              key={globalIndex}
              style={{ position: 'relative' }}
            >
              {itemContent(item, globalIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
};