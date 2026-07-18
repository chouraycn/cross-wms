import type { EditorTheme } from '../theme/theme.js';
import { TuiInputHistory } from '../tui-input-history.js';

export interface CustomEditorOptions {
  theme: EditorTheme;
  prompt?: string;
  history?: TuiInputHistory;
  multiline?: boolean;
}

export class CustomEditor {
  private text: string = '';
  private cursorPos: number = 0;
  private prompt: string;
  private theme: EditorTheme;
  private history: TuiInputHistory;
  private multiline: boolean;
  private onSubmit?: (text: string) => void;
  private onChange?: (text: string) => void;
  private onCancel?: () => void;
  private onKey?: (key: string) => boolean;

  constructor(options: CustomEditorOptions) {
    this.theme = options.theme;
    this.prompt = options.prompt ?? '> ';
    this.history = options.history ?? new TuiInputHistory();
    this.multiline = options.multiline ?? false;
  }

  setText(text: string): void {
    this.text = text;
    this.cursorPos = Math.min(this.cursorPos, text.length);
    if (this.onChange) {
      this.onChange(this.text);
    }
  }

  getText(): string {
    return this.text;
  }

  setCursorPos(pos: number): void {
    this.cursorPos = Math.max(0, Math.min(pos, this.text.length));
  }

  getCursorPos(): number {
    return this.cursorPos;
  }

  setPrompt(prompt: string): void {
    this.prompt = prompt;
  }

  getPrompt(): string {
    return this.prompt;
  }

  setOnSubmit(callback: (text: string) => void): void {
    this.onSubmit = callback;
  }

  setOnChange(callback: (text: string) => void): void {
    this.onChange = callback;
  }

  setOnCancel(callback: () => void): void {
    this.onCancel = callback;
  }

  setOnKey(callback: (key: string) => boolean): void {
    this.onKey = callback;
  }

  handleInput(input: string): boolean {
    if (this.onKey && this.onKey(input)) {
      return true;
    }

    switch (input) {
      case '\r':
      case '\n':
        if (!this.multiline) {
          this.submit();
          return true;
        }
        this.insertText('\n');
        return true;
      case '\x7f':
      case '\b':
        this.backspace();
        return true;
      case '\x1b[3~':
        this.delete();
        return true;
      case '\x1b[D':
      case '\x1bOD':
        this.moveLeft();
        return true;
      case '\x1b[C':
      case '\x1bOC':
        this.moveRight();
        return true;
      case '\x1b[H':
      case '\x1b[1~':
      case '\x01':
        this.moveToStart();
        return true;
      case '\x1b[F':
      case '\x1b[4~':
      case '\x05':
        this.moveToEnd();
        return true;
      case '\x1b[A':
      case '\x1bOA':
        this.historyPrevious();
        return true;
      case '\x1b[B':
      case '\x1bOB':
        this.historyNext();
        return true;
      case '\x03':
        if (this.onCancel) {
          this.onCancel();
        }
        return true;
      case '\x15':
        this.clearLine();
        return true;
      case '\x0b':
        this.clearToEnd();
        return true;
      default:
        if (input.startsWith('\x1b')) {
          return false;
        }
        this.insertText(input);
        return true;
    }
  }

  insertText(text: string): void {
    const before = this.text.slice(0, this.cursorPos);
    const after = this.text.slice(this.cursorPos);
    this.text = before + text + after;
    this.cursorPos += text.length;
    if (this.onChange) {
      this.onChange(this.text);
    }
  }

  backspace(): void {
    if (this.cursorPos > 0) {
      const before = this.text.slice(0, this.cursorPos - 1);
      const after = this.text.slice(this.cursorPos);
      this.text = before + after;
      this.cursorPos--;
      if (this.onChange) {
        this.onChange(this.text);
      }
    }
  }

  delete(): void {
    if (this.cursorPos < this.text.length) {
      const before = this.text.slice(0, this.cursorPos);
      const after = this.text.slice(this.cursorPos + 1);
      this.text = before + after;
      if (this.onChange) {
        this.onChange(this.text);
      }
    }
  }

  moveLeft(): void {
    if (this.cursorPos > 0) {
      this.cursorPos--;
    }
  }

  moveRight(): void {
    if (this.cursorPos < this.text.length) {
      this.cursorPos++;
    }
  }

  moveToStart(): void {
    this.cursorPos = 0;
  }

  moveToEnd(): void {
    this.cursorPos = this.text.length;
  }

  clear(): void {
    this.text = '';
    this.cursorPos = 0;
    if (this.onChange) {
      this.onChange(this.text);
    }
  }

  clearLine(): void {
    this.text = this.text.slice(this.cursorPos);
    this.cursorPos = 0;
    if (this.onChange) {
      this.onChange(this.text);
    }
  }

  clearToEnd(): void {
    this.text = this.text.slice(0, this.cursorPos);
    if (this.onChange) {
      this.onChange(this.text);
    }
  }

  submit(): void {
    const text = this.text;
    if (text.trim()) {
      this.history.add(text);
    }
    this.clear();
    if (this.onSubmit) {
      this.onSubmit(text);
    }
  }

  addToHistory(text: string): void {
    this.history.add(text);
  }

  historyPrevious(): void {
    const prev = this.history.getPrevious(this.text);
    if (prev !== null) {
      this.text = prev;
      this.cursorPos = this.text.length;
      if (this.onChange) {
        this.onChange(this.text);
      }
    }
  }

  historyNext(): void {
    const next = this.history.getNext();
    if (next !== null) {
      this.text = next;
      this.cursorPos = this.text.length;
      if (this.onChange) {
        this.onChange(this.text);
      }
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const textLines = this.text.split('\n');
    const promptLines = this.prompt.split('\n');

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i] ?? '';
      const prefix = i === 0 ? this.prompt : ' '.repeat(promptLines[0]?.length ?? 2);
      lines.push(prefix + line);
    }

    if (textLines.length === 0) {
      lines.push(this.prompt);
    }

    return lines;
  }

  getHistory(): TuiInputHistory {
    return this.history;
  }

  isEmpty(): boolean {
    return this.text.length === 0;
  }
}
