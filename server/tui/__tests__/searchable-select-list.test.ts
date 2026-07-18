import { describe, expect, it, beforeEach } from 'vitest';
import { SearchableSelectList } from '../components/searchable-select-list.js';
import { searchableSelectListTheme } from '../theme/theme.js';
import type { TUISelectItem } from '../types.js';

const testItems: TUISelectItem[] = [
  { value: '1', label: 'Apple' },
  { value: '2', label: 'Banana' },
  { value: '3', label: 'Cherry' },
  { value: '4', label: 'Date' },
  { value: '5', label: 'Elderberry' },
];

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('SearchableSelectList', () => {
  let list: SearchableSelectList;

  beforeEach(() => {
    list = new SearchableSelectList({
      items: testItems,
      theme: searchableSelectListTheme,
    });
  });

  it('starts with all items visible', () => {
    expect(list.getItemCount()).toBe(5);
  });

  it('starts with first item selected', () => {
    expect(list.getSelectedItem()?.value).toBe('1');
  });

  it('filters items by search query', () => {
    list.setSearchText('a');
    const filtered = list.getItems();
    expect(filtered.length).toBeLessThan(5);
    for (const item of filtered) {
      expect(item.label.toLowerCase()).toContain('a');
    }
  });

  it('filters case-insensitively', () => {
    list.setSearchText('APPLE');
    expect(list.getItemCount()).toBe(1);
    expect(list.getSelectedItem()?.value).toBe('1');
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

  it('resets selection when filtering changes', () => {
    list.moveDown();
    list.moveDown();
    list.setSearchText('b');
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
    expect(text).toContain('Apple');
    expect(text).toContain('Banana');
  });

  it('renders with query', () => {
    list.setSearchText('ch');
    const lines = list.render(80);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Cherry');
  });

  it('clears search text', () => {
    list.setSearchText('apple');
    expect(list.getItemCount()).toBe(1);
    list.setSearchText('');
    expect(list.getSearchText()).toBe('');
    expect(list.getItemCount()).toBe(5);
  });

  it('handles empty result set', () => {
    list.setSearchText('zzzzzz');
    expect(list.getItemCount()).toBe(0);
    expect(list.getSelectedItem()).toBeNull();
  });

  it('gets search text', () => {
    list.setSearchText('hello');
    expect(list.getSearchText()).toBe('hello');
  });

  it('has description support', () => {
    const itemsWithDesc: TUISelectItem[] = [
      { value: '1', label: 'Apple', description: 'Red fruit' },
      { value: '2', label: 'Banana', description: 'Yellow fruit' },
    ];
    const listWithDesc = new SearchableSelectList({
      items: itemsWithDesc,
      theme: searchableSelectListTheme,
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
    const longList = new SearchableSelectList({
      items: manyItems,
      theme: searchableSelectListTheme,
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
    const longList = new SearchableSelectList({
      items: manyItems,
      theme: searchableSelectListTheme,
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
    expect(list.getSearchText()).toBe('a');
  });

  it('handles input for backspace', () => {
    list.setSearchText('apple');
    list.handleInput('\x7f');
    expect(list.getSearchText()).toBe('appl');
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

  it('calls onCancel on escape', () => {
    let cancelled = false;
    list.setOnCancel(() => {
      cancelled = true;
    });
    list.handleInput('\x1b');
    expect(cancelled).toBe(true);
  });
});
