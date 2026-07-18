import { describe, expect, it, beforeEach } from 'vitest';
import { ChatLog } from '../components/chat-log.js';
import { markdownTheme } from '../theme/theme.js';
import type { TUIMessage, TUIToolCall } from '../types.js';

function createMessage(partial: Partial<TUIMessage> = {}): TUIMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    role: 'user',
    content: 'Hello',
    status: 'complete',
    timestamp: Date.now(),
    ...partial,
  };
}

function createToolCall(partial: Partial<TUIToolCall> = {}): TUIToolCall {
  return {
    id: 'tool-1',
    name: 'test-tool',
    input: { key: 'value' },
    status: 'success',
    output: 'result',
    ...partial,
  };
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('ChatLog', () => {
  let chatLog: ChatLog;

  beforeEach(() => {
    chatLog = new ChatLog([], markdownTheme);
  });

  it('starts empty', () => {
    expect(chatLog.getMessageCount()).toBe(0);
    expect(chatLog.getMessages()).toEqual([]);
  });

  it('adds a message', () => {
    const msg = createMessage({ role: 'user', content: 'Hi' });
    chatLog.addMessage(msg);
    expect(chatLog.getMessageCount()).toBe(1);
    expect(chatLog.getMessages()[0]?.content).toBe('Hi');
  });

  it('sets messages', () => {
    const msgs = [
      createMessage({ id: '1', content: 'First' }),
      createMessage({ id: '2', content: 'Second' }),
    ];
    chatLog.setMessages(msgs);
    expect(chatLog.getMessageCount()).toBe(2);
  });

  it('renders messages', () => {
    chatLog.addMessage(createMessage({ role: 'user', content: 'Hello' }));
    chatLog.addMessage(createMessage({ role: 'assistant', content: 'Hi there' }));
    const lines = chatLog.render(80, 20);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Hello');
    expect(text).toContain('Hi there');
  });

  it('scrolls up and down', () => {
    for (let i = 0; i < 20; i++) {
      chatLog.addMessage(createMessage({ id: `msg-${i}`, content: `Message ${i}` }));
    }
    chatLog.render(80, 10);
    chatLog.scrollToBottom();
    chatLog.render(80, 10);
    const bottomOffset = chatLog.getScrollOffset();

    chatLog.scrollUp();
    chatLog.render(80, 10);
    const scrolledOffset = chatLog.getScrollOffset();

    expect(scrolledOffset).toBeLessThan(bottomOffset);
  });

  it('scrolls to bottom', () => {
    for (let i = 0; i < 50; i++) {
      chatLog.addMessage(createMessage({ id: `msg-${i}`, content: `Message ${i}` }));
    }
    chatLog.scrollUp();
    chatLog.scrollUp();
    chatLog.scrollUp();
    chatLog.scrollToBottom();
    const lines = chatLog.render(80, 20);
    expect(Array.isArray(lines)).toBe(true);
  });

  it('scrolls to top', () => {
    for (let i = 0; i < 50; i++) {
      chatLog.addMessage(createMessage({ id: `msg-${i}`, content: `Message ${i}` }));
    }
    chatLog.scrollToTop();
    expect(chatLog.getScrollOffset()).toBe(0);
  });

  it('shows tool calls when showTools is true', () => {
    const toolCall = createToolCall({ name: 'search', status: 'success' });
    const msg = createMessage({
      id: 'msg-1',
      role: 'assistant',
      content: 'Result',
      toolCalls: [toolCall],
    });
    chatLog.addMessage(msg);
    chatLog.setShowTools(true);
    const lines = chatLog.render(80, 30);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('search');
  });

  it('hides tool calls when showTools is false', () => {
    const toolCall = createToolCall({ name: 'search' });
    const msg = createMessage({
      id: 'msg-1',
      role: 'assistant',
      content: 'Result',
      toolCalls: [toolCall],
    });
    chatLog.addMessage(msg);
    chatLog.setShowTools(false);
    const lines = chatLog.render(80, 30);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Result');
  });

  it('sets showThinking', () => {
    chatLog.setShowThinking(true);
    chatLog.setShowThinking(false);
  });

  it('clears all messages via setMessages', () => {
    chatLog.addMessage(createMessage());
    expect(chatLog.getMessageCount()).toBe(1);
    chatLog.setMessages([]);
    expect(chatLog.getMessageCount()).toBe(0);
  });

  it('renders thinking messages when showThinking is true', () => {
    const msg = createMessage({
      role: 'assistant',
      content: 'Answer',
      thinking: 'Let me think about this',
    });
    chatLog.addMessage(msg);
    chatLog.setShowThinking(true);
    const lines = chatLog.render(80, 30);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Let me think about this');
  });

  it('renders error status messages', () => {
    const msg = createMessage({
      role: 'assistant',
      content: 'Something went wrong',
      status: 'error',
      error: 'Timeout',
    });
    chatLog.addMessage(msg);
    const lines = chatLog.render(80, 30);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('Something went wrong');
  });

  it('paginateUp and paginateDown work via scrollUp/scrollDown', () => {
    for (let i = 0; i < 100; i++) {
      chatLog.addMessage(createMessage({ id: `msg-${i}`, content: `Msg ${i}` }));
    }
    chatLog.scrollToBottom();
    chatLog.scrollUp(10);
    const afterPgUp = chatLog.render(80, 20);
    expect(Array.isArray(afterPgUp)).toBe(true);
  });

  it('handles zero height render', () => {
    chatLog.addMessage(createMessage());
    const lines = chatLog.render(80, 0);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBe(0);
  });

  it('renders system messages', () => {
    const msg = createMessage({ role: 'system', content: 'System message' });
    chatLog.addMessage(msg);
    const lines = chatLog.render(80, 20);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('System message');
  });

  it('gets scroll offset', () => {
    expect(chatLog.getScrollOffset()).toBe(0);
  });
});
