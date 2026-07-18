import type { SearchableSelectListTheme } from '../theme/theme.js';
import { fuzzyFilterLower, prepareSearchItems, highlightMatch } from './fuzzy-filter.js';
import type { TUISelectItem } from '../types.js';

export interface SearchableSelectListOptions {
  items: TUISelectItem[];
  theme: SearchableSelectListTheme;
  maxVisible?: number;
  searchPrompt?: string;
}

export class SearchableSelectList {
  private items: Array<TUISelectItem & { searchTextLower: string }>;
  private filteredItems: Array<TUISelectItem & { searchTextLower: string }>;
  private theme: SearchableSelectListTheme;
  private maxVisible: number;
  private searchText: string = '';
  private selectedIndex: number = 0;
  private scrollOffset: number = 0;
  private onSelect?: (item: TUISelectItem) => void;
  private onCancel?: () => void;
  private searchPrompt: string;

  constructor(options: SearchableSelectListOptions) {
    this.items = prepareSearchItems(options.items);
    this.filteredItems = [...this.items];
    this.theme = options.theme;
    this.maxVisible = options.maxVisible ?? 10;
    this.searchPrompt = options.searchPrompt ?? 'Search: ';
  }

  setItems(items: TUISelectItem[]): void {
    this.items = prepareSearchItems(items);
    this.applyFilter();
  }

  getSearchText(): string {
    return this.searchText;
  }

  setSearchText(text: string): void {
    this.searchText = text;
    this.applyFilter();
  }

  private applyFilter(): void {
    const queryLower = this.searchText.toLowerCase().trim();
    this.filteredItems = fuzzyFilterLower(this.items, queryLower);
    this.selectedIndex = 0;
    this.scrollOffset = 0;
  }

  getSelectedItem(): TUISelectItem | null {
    if (this.filteredItems.length === 0) {
      return null;
    }
    return this.filteredItems[this.selectedIndex] ?? null;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    if (this.filteredItems.length === 0) {
      return;
    }
    this.selectedIndex = Math.max(0, Math.min(index, this.filteredItems.length - 1));
    this.ensureVisible();
  }

  private ensureVisible(): void {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
      this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
    }
  }

  moveUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.ensureVisible();
    }
  }

  moveDown(): void {
    if (this.selectedIndex < this.filteredItems.length - 1) {
      this.selectedIndex++;
      this.ensureVisible();
    }
  }

  movePageUp(): void {
    this.selectedIndex = Math.max(0, this.selectedIndex - this.maxVisible);
    this.ensureVisible();
  }

  movePageDown(): void {
    this.selectedIndex = Math.min(this.filteredItems.length - 1, this.selectedIndex + this.maxVisible);
    this.ensureVisible();
  }

  setOnSelect(callback: (item: TUISelectItem) => void): void {
    this.onSelect = callback;
  }

  setOnCancel(callback: () => void): void {
    this.onCancel = callback;
  }

  handleInput(input: string): boolean {
    switch (input) {
      case '\r':
      case '\n':
        const selected = this.getSelectedItem();
        if (selected && this.onSelect) {
          this.onSelect(selected);
        }
        return true;
      case '\x1b':
      case '\x03':
        if (this.onCancel) {
          this.onCancel();
        }
        return true;
      case '\x1b[A':
      case '\x1bOA':
        this.moveUp();
        return true;
      case '\x1b[B':
      case '\x1bOB':
        this.moveDown();
        return true;
      case '\x1b[5~':
        this.movePageUp();
        return true;
      case '\x1b[6~':
        this.movePageDown();
        return true;
      case '\x7f':
      case '\b':
        if (this.searchText.length > 0) {
          this.searchText = this.searchText.slice(0, -1);
          this.applyFilter();
        }
        return true;
      default:
        if (input.startsWith('\x1b')) {
          return false;
        }
        if (input.length === 1 && input.charCodeAt(0) >= 32) {
          this.searchText += input;
          this.applyFilter();
          return true;
        }
        return false;
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];

    const searchLine =
      this.theme.searchPrompt(this.searchPrompt) +
      this.theme.searchInput(this.searchText) +
      this.theme.searchInput('▊');
    lines.push(searchLine);

    if (this.filteredItems.length === 0) {
      lines.push(this.theme.noMatch('  No matches found'));
      return lines;
    }

    const visibleStart = this.scrollOffset;
    const visibleEnd = Math.min(visibleStart + this.maxVisible, this.filteredItems.length);

    for (let i = visibleStart; i < visibleEnd; i++) {
      const item = this.filteredItems[i]!;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? this.theme.selectedPrefix('▶ ') : '  ';
      const label = isSelected
        ? this.theme.selectedText(highlightMatch(item.label, this.searchText, this.theme.matchHighlight))
        : highlightMatch(item.label, this.searchText, this.theme.matchHighlight);

      let line = prefix + label;
      if (item.description) {
        const desc = '  ' + this.theme.description(item.description);
        line += desc;
      }
      lines.push(line);
    }

    const total = this.filteredItems.length;
    const scrollInfo = `  ${this.selectedIndex + 1}/${total}`;
    lines.push(this.theme.scrollInfo(scrollInfo));

    return lines;
  }

  getItemCount(): number {
    return this.filteredItems.length;
  }

  getItems(): TUISelectItem[] {
    return this.filteredItems;
  }
}
