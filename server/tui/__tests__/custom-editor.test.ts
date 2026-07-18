import { describe, expect, it, beforeEach } from 'vitest';
import { CustomEditor } from '../components/custom-editor.js';
import { editorTheme } from '../theme/theme.js';

describe('CustomEditor', () => {
  let editor: CustomEditor;

  beforeEach(() => {
    editor = new CustomEditor({ theme: editorTheme });
  });

  it('starts empty', () => {
    expect(editor.getText()).toBe('');
    expect(editor.getCursorPos()).toBe(0);
  });

  it('inserts text', () => {
    editor.insertText('Hello');
    expect(editor.getText()).toBe('Hello');
    expect(editor.getCursorPos()).toBe(5);
  });

  it('sets text and cursor', () => {
    editor.setText('Hello world');
    editor.setCursorPos(5);
    expect(editor.getText()).toBe('Hello world');
    expect(editor.getCursorPos()).toBe(5);
  });

  it('moves cursor left', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.moveLeft();
    expect(editor.getCursorPos()).toBe(4);
  });

  it('does not move cursor left past start', () => {
    editor.setText('Hello');
    editor.setCursorPos(0);
    editor.moveLeft();
    expect(editor.getCursorPos()).toBe(0);
  });

  it('moves cursor right', () => {
    editor.setText('Hello');
    editor.setCursorPos(0);
    editor.moveRight();
    expect(editor.getCursorPos()).toBe(1);
  });

  it('does not move cursor right past end', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.moveRight();
    expect(editor.getCursorPos()).toBe(5);
  });

  it('moves cursor to start', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.moveToStart();
    expect(editor.getCursorPos()).toBe(0);
  });

  it('moves cursor to end', () => {
    editor.setText('Hello');
    editor.setCursorPos(0);
    editor.moveToEnd();
    expect(editor.getCursorPos()).toBe(5);
  });

  it('deletes character before cursor', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.backspace();
    expect(editor.getText()).toBe('Hell');
    expect(editor.getCursorPos()).toBe(4);
  });

  it('does nothing on backspace at start', () => {
    editor.setText('Hello');
    editor.setCursorPos(0);
    editor.backspace();
    expect(editor.getText()).toBe('Hello');
  });

  it('deletes character after cursor', () => {
    editor.setText('Hello');
    editor.setCursorPos(0);
    editor.delete();
    expect(editor.getText()).toBe('ello');
    expect(editor.getCursorPos()).toBe(0);
  });

  it('does nothing on delete at end', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.delete();
    expect(editor.getText()).toBe('Hello');
  });

  it('clears line (Ctrl+U)', () => {
    editor.setText('Hello world');
    editor.setCursorPos(5);
    editor.clearLine();
    expect(editor.getText()).toBe(' world');
    expect(editor.getCursorPos()).toBe(0);
  });

  it('clears to end (Ctrl+K)', () => {
    editor.setText('Hello world');
    editor.setCursorPos(5);
    editor.clearToEnd();
    expect(editor.getText()).toBe('Hello');
    expect(editor.getCursorPos()).toBe(5);
  });

  it('renders the editor line', () => {
    editor.setText('Hello');
    const lines = editor.render(80);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('sets prompt', () => {
    editor.setPrompt('$ ');
    expect(editor.getPrompt()).toBe('$ ');
  });

  it('clears the editor', () => {
    editor.setText('Hello');
    editor.clear();
    expect(editor.getText()).toBe('');
    expect(editor.getCursorPos()).toBe(0);
  });

  it('inserts multiple characters', () => {
    editor.insertText('A');
    editor.insertText('B');
    editor.insertText('C');
    expect(editor.getText()).toBe('ABC');
    expect(editor.getCursorPos()).toBe(3);
  });

  it('checks if empty', () => {
    expect(editor.isEmpty()).toBe(true);
    editor.setText('Hello');
    expect(editor.isEmpty()).toBe(false);
  });

  it('handles input events', () => {
    const result = editor.handleInput('a');
    expect(result).toBe(true);
    expect(editor.getText()).toBe('a');
  });

  it('handles backspace key', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.handleInput('\x7f');
    expect(editor.getText()).toBe('Hell');
  });

  it('handles left arrow key', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.handleInput('\x1b[D');
    expect(editor.getCursorPos()).toBe(4);
  });

  it('handles right arrow key', () => {
    editor.setText('Hello');
    editor.setCursorPos(0);
    editor.handleInput('\x1b[C');
    expect(editor.getCursorPos()).toBe(1);
  });

  it('handles home key', () => {
    editor.setText('Hello');
    editor.setCursorPos(5);
    editor.handleInput('\x1b[H');
    expect(editor.getCursorPos()).toBe(0);
  });

  it('handles end key', () => {
    editor.setText('Hello');
    editor.setCursorPos(0);
    editor.handleInput('\x1b[F');
    expect(editor.getCursorPos()).toBe(5);
  });

  it('calls onSubmit on enter', () => {
    let submitted = '';
    editor.setOnSubmit((text) => {
      submitted = text;
    });
    editor.setText('Hello');
    editor.handleInput('\r');
    expect(submitted).toBe('Hello');
    expect(editor.getText()).toBe('');
  });

  it('calls onChange when text changes', () => {
    let changed = '';
    editor.setOnChange((text) => {
      changed = text;
    });
    editor.insertText('Hi');
    expect(changed).toBe('Hi');
  });

  it('adds to history on submit', () => {
    editor.setText('test command');
    editor.handleInput('\r');
    const history = editor.getHistory();
    expect(history.size()).toBe(1);
  });
});
