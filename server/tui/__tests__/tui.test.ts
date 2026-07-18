import { describe, expect, it, beforeEach } from 'vitest';
import { TUI } from '../tui.js';
import type { TUIMessage } from '../types.js';

describe('TUI', () => {
  let tui: TUI;

  beforeEach(() => {
    tui = new TUI({ width: 80, height: 24 });
  });

  it('creates TUI instance', () => {
    expect(tui).toBeDefined();
    expect(tui instanceof TUI).toBe(true);
  });

  it('starts with empty message list', () => {
    expect(tui.getMessages().length).toBe(0);
  });

  it('adds user message', () => {
    const msg = tui.addUserMessage('Hello there');
    expect(msg).toBeDefined();
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello there');
    expect(tui.getMessages().length).toBe(1);
  });

  it('adds assistant message', () => {
    const msg = tui.addAssistantMessage('Hi!');
    expect(msg).toBeDefined();
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('Hi!');
    expect(tui.getMessages().length).toBe(1);
  });

  it('updates assistant message', () => {
    const msg = tui.addAssistantMessage('Hi');
    tui.updateAssistantMessage(msg.id, { content: 'Hello world' });
    const messages = tui.getMessages();
    const last = messages[messages.length - 1];
    expect(last?.content).toBe('Hello world');
  });

  it('appends assistant delta', () => {
    const msg = tui.addAssistantMessage('Hel');
    tui.appendAssistantDelta(msg.id, 'lo');
    const messages = tui.getMessages();
    const last = messages[messages.length - 1];
    expect(last?.content).toBe('Hello');
    expect(last?.status).toBe('streaming');
  });

  it('adds system message', () => {
    const msg = tui.addSystemMessage('System info');
    expect(msg.role).toBe('system');
    expect(tui.getMessages().length).toBe(1);
  });

  it('toggles theme', () => {
    const initialState = tui.getState();
    const initialTheme = initialState.themeMode;
    tui.toggleTheme();
    const newState = tui.getState();
    expect(newState.themeMode).not.toBe(initialTheme);
  });

  it('toggles tools', () => {
    const initialShowTools = tui.getState().showTools;
    tui.toggleTools();
    expect(tui.getState().showTools).not.toBe(initialShowTools);
  });

  it('toggles thinking', () => {
    const initialShowThinking = tui.getState().showThinking;
    tui.toggleThinking();
    expect(tui.getState().showThinking).not.toBe(initialShowThinking);
  });

  it('renders without errors', () => {
    tui.start();
    tui.addUserMessage('Hello');
    tui.addAssistantMessage('Hi there!');
    const output = tui.render();
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    tui.stop();
  });

  it('gets current input', () => {
    expect(tui.getCurrentInput()).toBe('');
  });

  it('sets sessions', () => {
    const sessions = [
      { id: '1', title: 'Session 1', messageCount: 5 },
      { id: '2', title: 'Session 2', messageCount: 10 },
    ];
    tui.setSessions(sessions);
    expect(tui.getState().sessions.length).toBe(2);
  });

  it('sets current session', () => {
    tui.setCurrentSession('session-123');
    expect(tui.getState().sessionId).toBe('session-123');
  });

  it('handles scroll up and down', () => {
    for (let i = 0; i < 50; i++) {
      tui.addUserMessage(`Message ${i}`);
      tui.addAssistantMessage(`Response ${i}`);
    }
    tui.scrollUp();
    tui.scrollDown();
    tui.scrollToBottom();
    tui.scrollToTop();
  });

  it('clears messages', () => {
    tui.addUserMessage('Hello');
    tui.addAssistantMessage('Hi');
    expect(tui.getMessages().length).toBe(2);
    tui.clearMessages();
    expect(tui.getMessages().length).toBe(0);
  });

  it('gets messages', () => {
    tui.addUserMessage('Hello');
    tui.addAssistantMessage('Hi');
    const messages = tui.getMessages();
    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
  });

  it('starts and stops', () => {
    expect(tui.isRunning()).toBe(false);
    tui.start();
    expect(tui.isRunning()).toBe(true);
    tui.stop();
    expect(tui.isRunning()).toBe(false);
  });

  it('handles history navigation', () => {
    tui.start();
    tui.addUserMessage('first message');
    tui.addUserMessage('second message');
    tui.handleKey('\x1b[A');
    tui.handleKey('\x1b[A');
    tui.handleKey('\x1b[B');
    tui.stop();
  });

  it('gets state', () => {
    const state = tui.getState();
    expect(state).toBeDefined();
    expect(state.messages).toBeDefined();
    expect(state.sessionId).toBeDefined();
    expect(state.themeMode).toBeDefined();
  });

  it('sets size', () => {
    tui.setSize(100, 30);
    expect(tui.getWidth()).toBe(100);
    expect(tui.getHeight()).toBe(30);
  });

  it('gets mode', () => {
    expect(tui.getMode()).toBe('chat');
  });

  it('gets stream assembler', () => {
    const assembler = tui.getStreamAssembler();
    expect(assembler).toBeDefined();
  });

  it('emits start event', () => {
    let started = false;
    tui.on('start', () => {
      started = true;
    });
    tui.start();
    expect(started).toBe(true);
    tui.stop();
  });

  it('emits stop event', () => {
    let stopped = false;
    tui.on('stop', () => {
      stopped = true;
    });
    tui.start();
    tui.stop();
    expect(stopped).toBe(true);
  });

  it('handles key input when running', () => {
    tui.start();
    tui.handleKey('a');
    tui.handleKey('b');
    tui.handleKey('c');
    expect(tui.getCurrentInput()).toBe('abc');
    tui.stop();
  });

  it('does not handle key input when not running', () => {
    tui.handleKey('a');
    expect(tui.getCurrentInput()).toBe('');
  });

  it('handles enter key to submit', () => {
    let submittedValue = '';
    tui.on('submit', (value: string) => {
      submittedValue = value;
    });
    tui.start();
    tui.handleKey('h');
    tui.handleKey('i');
    tui.handleKey('\r');
    expect(submittedValue).toBe('hi');
    tui.stop();
  });

  it('handles slash commands', () => {
    let commandEmitted = false;
    tui.on('command', () => {
      commandEmitted = true;
    });
    tui.start();
    tui.handleKey('/');
    tui.handleKey('h');
    tui.handleKey('e');
    tui.handleKey('l');
    tui.handleKey('p');
    tui.handleKey('\r');
    expect(commandEmitted).toBe(true);
    tui.stop();
  });
});
