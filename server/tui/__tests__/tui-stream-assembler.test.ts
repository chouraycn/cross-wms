import { describe, expect, it } from 'vitest';
import { TuiStreamAssembler } from '../tui-stream-assembler.js';

describe('TuiStreamAssembler', () => {
  it('starts empty', () => {
    const assembler = new TuiStreamAssembler();
    expect(assembler.size()).toBe(0);
    expect(assembler.hasRun('run-1')).toBe(false);
  });

  it('ingests delta and returns display text', () => {
    const assembler = new TuiStreamAssembler();
    const message = {
      role: 'assistant',
      content: 'Hello',
    };
    const result = assembler.ingestDelta('run-1', message, false);
    expect(result).toBe('Hello');
    expect(assembler.hasRun('run-1')).toBe(true);
  });

  it('returns null when content unchanged', () => {
    const assembler = new TuiStreamAssembler();
    const message = {
      role: 'assistant',
      content: 'Hello',
    };
    assembler.ingestDelta('run-1', message, false);
    const result = assembler.ingestDelta('run-1', message, false);
    expect(result).toBeNull();
  });

  it('updates display text with new delta', () => {
    const assembler = new TuiStreamAssembler();
    assembler.ingestDelta('run-1', { role: 'assistant', content: 'Hello' }, false);
    const result = assembler.ingestDelta('run-1', { role: 'assistant', content: 'Hello world' }, false);
    expect(result).toBe('Hello world');
  });

  it('finalizes a run and returns final text', () => {
    const assembler = new TuiStreamAssembler();
    assembler.ingestDelta('run-1', { role: 'assistant', content: 'Hello' }, false);
    const final = assembler.finalize('run-1', { role: 'assistant', content: 'Hello world' }, false);
    expect(final).toBe('Hello world');
    expect(assembler.hasRun('run-1')).toBe(false);
  });

  it('uses streamed text when final is empty', () => {
    const assembler = new TuiStreamAssembler();
    assembler.ingestDelta('run-1', { role: 'assistant', content: 'Hello' }, false);
    const final = assembler.finalize('run-1', { role: 'assistant', content: '' }, false);
    expect(final).toBe('Hello');
  });

  it('shows error message when no content', () => {
    const assembler = new TuiStreamAssembler();
    const final = assembler.finalize('run-1', { role: 'assistant', content: '' }, false, 'Something went wrong');
    expect(final).toContain('Something went wrong');
  });

  it('returns no output when nothing', () => {
    const assembler = new TuiStreamAssembler();
    const final = assembler.finalize('run-1', { role: 'assistant', content: '' }, false);
    expect(final).toBe('(no output)');
  });

  it('drops a run', () => {
    const assembler = new TuiStreamAssembler();
    assembler.ingestDelta('run-1', { role: 'assistant', content: 'Hello' }, false);
    expect(assembler.hasRun('run-1')).toBe(true);
    assembler.drop('run-1');
    expect(assembler.hasRun('run-1')).toBe(false);
  });

  it('gets display text for a run', () => {
    const assembler = new TuiStreamAssembler();
    assembler.ingestDelta('run-1', { role: 'assistant', content: 'Hello' }, false);
    expect(assembler.getDisplayText('run-1')).toBe('Hello');
    expect(assembler.getDisplayText('nonexistent')).toBeNull();
  });

  it('clears all runs', () => {
    const assembler = new TuiStreamAssembler();
    assembler.ingestDelta('run-1', { role: 'assistant', content: 'Hello' }, false);
    assembler.ingestDelta('run-2', { role: 'assistant', content: 'World' }, false);
    expect(assembler.size()).toBe(2);
    assembler.clear();
    expect(assembler.size()).toBe(0);
  });

  it('handles array content blocks', () => {
    const assembler = new TuiStreamAssembler();
    const message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
    };
    const result = assembler.ingestDelta('run-1', message, false);
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  it('extracts thinking when showThinking is true', () => {
    const assembler = new TuiStreamAssembler();
    const message = {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Let me think...' },
        { type: 'text', text: 'Answer' },
      ],
    };
    const result = assembler.ingestDelta('run-1', message, true);
    expect(result).toContain('[thinking]');
    expect(result).toContain('Let me think...');
    expect(result).toContain('Answer');
  });

  it('hides thinking when showThinking is false', () => {
    const assembler = new TuiStreamAssembler();
    const message = {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Let me think...' },
        { type: 'text', text: 'Answer' },
      ],
    };
    const result = assembler.ingestDelta('run-1', message, false);
    expect(result).not.toContain('[thinking]');
    expect(result).not.toContain('Let me think...');
    expect(result).toContain('Answer');
  });
});
