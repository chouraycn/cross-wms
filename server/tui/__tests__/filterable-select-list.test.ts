import { describe, expect, it, beforeEach } from 'vitest';
import { FilterableSelectList } from '../components/filterable-select-list.js';
import { filterableSelectListTheme } from '../theme/theme.js';
import type { TUISelectItem } from '../types.js';

const testItems: TUISelectItem[] = [
  { value: '1', label: 'Red Apple', category: 'fruit' },
  { value: '2', label: 'Yellow Banana', category: 'fruit' },
  { value: '3', label: 'Red Cherry', category: 'fruit' },
  { value: '4', label: 'Red Tomato', category: 'vegetable' },
  { value: '5', label: 'Green Cucumber', category: 'vegetable' },
];

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('FilterableSelectList', () => {
  let list: FilterableSelectList;

  beforeEach(() => {
    list = new FilterableSelectList({
      items: testItems,
      theme: filterableSelectListTheme,
    });
  });

  it('starts with all items', () => {
    expect(list.getItemCount()).toBe(5);
  });

  it('filters by search text', () => {
    list.setFilterText('fruit');
    const filtered = list.getItems();
    expect(filtered.length).toBeLessThan(5);
  });

  it('filters by item label', () => {
    list.setFilterText('Red');
    const filtered = list.getItems();
    expect(filtered.length).toBe(3);
  });

  it('filters case-insensitively', () => {
    list.setFilterText('APPLE');
    expect(list.getItemCount()).toBe(1);
  });

  it('clears filter', () => {
    list.setFilterText('apple');
    expect(list.getItemCount()).toBe(1);
    list.clearFilter();
    expect(list.getFilterText()).toBe('');
    expect(list.getItemCount()).toBe(5);
  });

  it('gets filter text', () => {
    list.setFilterText('hello');
    expect(list.getFilterText()).toBe('hello');
  });

  it('moves selection down', () => {
    list.moveDown();
    expect(list.getSelectedItem()?.value).toBe('2');
  });

  it('moves selection up', () => {
    list.moveDown();
    list.moveUp();
    expect(list.getSelectedItem()?.value).toBe('1');
  });

  it('does not move past last item', () => {
    for (let i = 0; i < 10; i++) {
      list.moveDown();
    }
    expect(list.getSelectedIndex()).toBe(list.getItemCount() - 1);
  });

  it('does not move past first item', () => {
    list.moveUp();
    expect(list.getSelectedIndex()).toBe(0);
  });

  it('returns selected item', () => {
    const selected = list.getSelectedItem();
    expect(selected).toBeDefined();
    expect(selected?.value).toBe('1');
  });

  it('renders the list', () => {
    const lines = list.render(80);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Red Apple');
  });

  it('renders with filter', () => {
    list.setFilterText('Red');
    const lines = list.render(80);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Red Apple');
    expect(text).toContain('Red Cherry');
  });

  it('handles empty result set', () => {
    list.setFilterText('zzzzzz');
    expect(list.getItemCount()).toBe(0);
    expect(list.getSelectedItem()).toBeNull();
  });

  it('has description support', () => {
    const itemsWithDesc: TUISelectItem[] = [
      { value: '1', label: 'Apple', description: 'Red fruit' },
      { value: '2', label: 'Banana', description: 'Yellow fruit' },
    ];
    const listWithDesc = new FilterableSelectList({
      items: itemsWithDesc,
      theme: filterableSelectListTheme,
    });
    const lines = listWithDesc.render(80);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Red fruit');
  });

  it('moves page down', () => {
    const manyItems: TUISelectItem[] = Array.from({ length: 30 }, (_, i) => ({
      value: String(i),
      label: `Item ${i}`,
    }));
    const longList = new FilterableSelectList({
      items: manyItems,
      theme: filterableSelectListTheme,
      maxVisible: 10,
    });
    longList.movePageDown();
    expect(longList.getSelectedIndex()).toBeGreaterThan(0);
  });

  it('moves page up', () => {
    const manyItems: TUISelectItem[] = Array.from({ length: 30 }, (_, i) => ({
      value: String(i),
      label: `Item ${i}`,
    }));
    const longList = new FilterableSelectList({
      items: manyItems,
      theme: filterableSelectListTheme,
      maxVisible: 10,
    });
    for (let i = 0; i < 20; i++) {
      longList.moveDown();
    }
    const idxBefore = longList.getSelectedIndex();
    longList.movePageUp();
    expect(longList.getSelectedIndex()).toBeLessThan(idxBefore);
  });

  it('sets items', () => {
    const newItems: TUISelectItem[] = [
      { value: '10', label: 'New Item' },
    ];
    list.setItems(newItems);
    expect(list.getItemCount()).toBe(1);
    expect(list.getSelectedItem()?.value).toBe('10');
  });

  it('handles input for typing', () => {
    list.handleInput('a');
    expect(list.getFilterText()).toBe('a');
  });

  it('handles input for backspace', () => {
    list.setFilterText('apple');
    list.handleInput('\x7f');
    expect(list.getFilterText()).toBe('appl');
  });

  it('handles input for up arrow', () => {
    list.handleInput('\x1b[A');
    expect(list.getSelectedIndex()).toBe(0);
    list.moveDown();
    list.handleInput('\x1b[A');
    expect(list.getSelectedIndex()).toBe(0);
  });

  it('handles input for down arrow', () => {
    list.handleInput('\x1b[B');
    expect(list.getSelectedIndex()).toBe(1);
  });

  it('calls onSelect on enter', () => {
    let selectedValue = '';
    list.setOnSelect((item) => {
      selectedValue = item.value;
    });
    list.handleInput('\r');
    expect(selectedValue).toBe('1');
  });

  it('calls onCancel on Ctrl+C', () => {
    let cancelled = false;
    list.setOnCancel(() => {
      cancelled = true;
    });
    list.handleInput('\x03');
    expect(cancelled).toBe(true);
  });

  it('clears filter on escape when filter is active', () => {
    list.setFilterText('apple');
    list.handleInput('\x1b');
    expect(list.getFilterText()).toBe('');
    expect(list.getItemCount()).toBe(5);
  });
});
