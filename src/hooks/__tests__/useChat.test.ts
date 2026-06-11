import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import type { Session, Message } from '../../types/chat';

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8),
}));

// Mock getApiUrl
vi.mock('../../utils/api', () => ({
  getApiUrl: (path: string) => `http://localhost:3001${path}`,
}));

function createMockSession(overrides?: Partial<Session>): Session {
  return {
    id: 'session-test-1',
    title: '',
    model: 'auto',
    messages: [],
    ...overrides,
  };
}

describe('useChat', () => {
  let onSessionUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSessionUpdate = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initial state: isLoading=false, inputValue=""', () => {
    const session = createMockSession();
    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.inputValue).toBe('');
  });

  it('setInputValue updates inputValue', () => {
    const session = createMockSession();
    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.setInputValue('hello');
    });

    expect(result.current.inputValue).toBe('hello');
  });

  it('sendMessage: empty content does nothing', () => {
    const session = createMockSession();
    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('');
    });

    expect(onSessionUpdate).not.toHaveBeenCalled();
  });

  it('sendMessage: whitespace-only content does nothing', () => {
    const session = createMockSession();
    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('   ');
    });

    expect(onSessionUpdate).not.toHaveBeenCalled();
  });

  it('sendMessage: constructs user message and streaming assistant message', async () => {
    const session = createMockSession();

    // Mock XMLHttpRequest for SSE
    const mockXhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
      readyState: 0,
      responseText: '',
      onreadystatechange: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };

    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXhr as any);

    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('hello');
    });

    // Should have called onSessionUpdate with user message + streaming message
    expect(onSessionUpdate).toHaveBeenCalled();

    // First call: user message added
    const firstCall = onSessionUpdate.mock.calls[0][0] as Session;
    expect(firstCall.messages).toHaveLength(1);
    expect(firstCall.messages[0].role).toBe('user');
    expect(firstCall.messages[0].content).toBe('hello');

    // Second call: streaming assistant message added
    const secondCall = onSessionUpdate.mock.calls[1][0] as Session;
    expect(secondCall.messages).toHaveLength(2);
    expect(secondCall.messages[1].role).toBe('assistant');
    expect(secondCall.messages[1].isStreaming).toBe(true);

    // isLoading should be true
    expect(result.current.isLoading).toBe(true);
  });

  it('sendMessage: isLoading becomes true during send', async () => {
    const session = createMockSession();

    const mockXhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
      readyState: 0,
      responseText: '',
      onreadystatechange: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };

    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXhr as any);

    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('test message');
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('stopGeneration: sets isLoading to false', () => {
    const session = createMockSession();

    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    // Manually trigger loading state then stop
    act(() => {
      // Start a send to set isLoading
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        abort: vi.fn(),
        readyState: 0,
        responseText: '',
        onreadystatechange: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
      };
      vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXhr as any);
      result.current.sendMessage('test');
    });

    act(() => {
      result.current.stopGeneration();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('resetAutoRetry: can be called without error', () => {
    const session = createMockSession();
    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    expect(() => {
      result.current.resetAutoRetry();
    }).not.toThrow();
  });

  it('sendMessage: uses options.model when provided', async () => {
    const session = createMockSession({ model: 'auto' });

    const mockXhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn((body: string) => {
        const parsed = JSON.parse(body);
        expect(parsed.model).toBe('gpt-4o');
      }),
      abort: vi.fn(),
      readyState: 0,
      responseText: '',
      onreadystatechange: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };

    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXhr as any);

    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('test', { model: 'gpt-4o' });
    });

    expect(mockXhr.send).toHaveBeenCalled();
  });

  it('sendMessage: includes skillContext when provided', async () => {
    const session = createMockSession();

    const mockXhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn((body: string) => {
        const parsed = JSON.parse(body);
        expect(parsed.skillContext).toBe('inventory-query-context');
      }),
      abort: vi.fn(),
      readyState: 0,
      responseText: '',
      onreadystatechange: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };

    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXhr as any);

    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('test', { skillContext: 'inventory-query-context' });
    });

    expect(mockXhr.send).toHaveBeenCalled();
  });

  it('sendMessage: handles network error gracefully', async () => {
    const session = createMockSession();

    const mockXhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(function(this: any) {
        // Simulate network error
        setTimeout(() => {
          if (this.onerror) this.onerror();
        }, 0);
      }),
      abort: vi.fn(),
      readyState: 0,
      responseText: '',
      onreadystatechange: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };

    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXhr as any);

    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('test');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('sendMessage: SSE text data updates streaming message content', async () => {
    const session = createMockSession();

    let xhrInstance: any;
    const mockXhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(function(this: any) {
        xhrInstance = this;
        // Simulate SSE data
        setTimeout(() => {
          xhrInstance.readyState = 3;
          xhrInstance.responseText = 'data: {"type":"text","content":"Hello "}\n\ndata: {"type":"text","content":"World"}\n\n';
          if (xhrInstance.onreadystatechange) xhrInstance.onreadystatechange();

          // Then done
          xhrInstance.readyState = 4;
          xhrInstance.responseText += 'data: {"type":"done","errorCode":null,"errorMessage":null}\n\n';
          if (xhrInstance.onreadystatechange) xhrInstance.onreadystatechange();
        }, 10);
      }),
      abort: vi.fn(),
      readyState: 0,
      responseText: '',
      onreadystatechange: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };

    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(() => mockXhr as any);

    const { result } = renderHook(() => useChat(session, onSessionUpdate));

    act(() => {
      result.current.sendMessage('test');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 3000 });

    // Should have updated with final content
    const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0] as Session;
    const finalMsg = lastCall.messages[lastCall.messages.length - 1];
    expect(finalMsg.isStreaming).toBeFalsy();
  });
});
