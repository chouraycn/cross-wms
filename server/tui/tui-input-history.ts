export class TuiInputHistory {
  private history: string[] = [];
  private maxSize: number;
  private index: number = -1;
  private currentDraft: string = '';

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  add(entry: string): void {
    const trimmed = entry.trim();
    if (!trimmed) {
      return;
    }
    if (this.history.length > 0 && this.history[this.history.length - 1] === trimmed) {
      this.index = -1;
      return;
    }
    this.history.push(trimmed);
    if (this.history.length > this.maxSize) {
      this.history.shift();
    }
    this.index = -1;
  }

  getPrevious(currentInput: string): string | null {
    if (this.history.length === 0) {
      return null;
    }
    if (this.index === -1) {
      this.currentDraft = currentInput;
    }
    const nextIndex = this.index === -1 ? this.history.length - 1 : this.index - 1;
    if (nextIndex < 0) {
      return null;
    }
    this.index = nextIndex;
    return this.history[this.index] ?? null;
  }

  getNext(): string | null {
    if (this.index === -1) {
      return null;
    }
    const nextIndex = this.index + 1;
    if (nextIndex >= this.history.length) {
      this.index = -1;
      return this.currentDraft;
    }
    this.index = nextIndex;
    return this.history[this.index] ?? null;
  }

  reset(): void {
    this.index = -1;
    this.currentDraft = '';
  }

  clear(): void {
    this.history = [];
    this.index = -1;
    this.currentDraft = '';
  }

  getHistory(): string[] {
    return [...this.history];
  }

  size(): number {
    return this.history.length;
  }

  getIndex(): number {
    return this.index;
  }

  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    if (this.history.length > maxSize) {
      this.history = this.history.slice(this.history.length - maxSize);
    }
  }
}

export function parseCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }
  const parts = trimmed.slice(1).split(/\s+/);
  const command = '/' + (parts[0] ?? '');
  const args = parts.slice(1);
  return { command, args };
}

export function isSlashCommand(input: string): boolean {
  return input.trimStart().startsWith('/');
}
