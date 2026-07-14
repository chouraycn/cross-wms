import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualList } from '../VirtualList';

describe('VirtualList', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, text: `Item ${i}` }));

  it('renders without crashing', () => {
    render(
      <VirtualList
        items={items}
        itemContent={(item) => <div key={item.id}>{item.text}</div>}
        itemSize={50}
        maxHeight={200}
      />
    );
    expect(screen.getByText('Item 0')).toBeInTheDocument();
  });

  it('renders items correctly', () => {
    render(
      <VirtualList
        items={items.slice(0, 5)}
        itemContent={(item) => <div key={item.id} data-testid={`item-${item.id}`}>{item.text}</div>}
        itemSize={50}
        maxHeight={500}
      />
    );
    expect(screen.getByText('Item 0')).toBeInTheDocument();
    expect(screen.getByText('Item 4')).toBeInTheDocument();
  });

  it('passes index correctly', () => {
    const indexSpy = vi.fn();
    render(
      <VirtualList
        items={items.slice(0, 3)}
        itemContent={(item, index) => {
          indexSpy(index);
          return <div key={item.id}>{item.text}</div>;
        }}
        itemSize={50}
        maxHeight={500}
      />
    );
    expect(indexSpy).toHaveBeenCalledWith(0);
    expect(indexSpy).toHaveBeenCalledWith(1);
    expect(indexSpy).toHaveBeenCalledWith(2);
  });

  it('handles empty items', () => {
    const { container } = render(
      <VirtualList<{ id: number; text: string }>
        items={[]}
        itemContent={(item) => <div key={item.id}>{item.text}</div>}
        itemSize={50}
        maxHeight={200}
      />
    );
    expect(container.querySelector('[style*="max-height"]')).toBeTruthy();
  });
});