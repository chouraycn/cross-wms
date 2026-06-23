import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ==================== Mocks ====================

// Mock uuid — 固定返回值，方便断言
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-0000-0000-000000000000',
}));

// Mock fetch — 全局 mock
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock requestAnimationFrame / cancelAnimationFrame
// 注意：useChat.ts v3.0.0 已用 setTimeout(fn, 16) 替代 rAF，
// 因此此处 mock 的 rAF 实际是死代码，仅为保持兼容性。
// 真正的渲染调度通过 window.setTimeout / clearTimeout 实现。
const rafCallbacks: Map<number, FrameRequestCallback> = new Map();
let rafIdCounter = 0;
vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
  const id = ++rafIdCounter;
  rafCallbacks.set(id, fn);
  return id;
});
vi.stubGlobal('cancelAnimationFrame', (id: number) => {
  rafCallbacks.delete(id);
});

// Mock AppSettingsContext
vi.mock('../../contexts/AppSettingsContext', () => ({
  useAppSettings: () => ({
    updateSettings: vi.fn(),
  }),
  useAppearanceSettings: () => ({
    settings: {},
  }),
}));

// ==================== Helper: 创建可读流 ====================

/**
 * 创建一个模拟的 ReadableStream，按顺序发送 SSE 事件行。
 * 每行格式为 "data: {json}\n\n"
 */
function createMockReadableStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < lines.length) {
        controller.enqueue(encoder.encode(lines[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/**
 * 创建一个模拟的 Response 对象，body 为模拟 ReadableStream。
 */
function createMockResponse(lines: string[], status = 200): Response {
  const stream = createMockReadableStream(lines);
  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream as any,
    headers: new Headers(),
    json: vi.fn(),
  } as unknown as Response;
}

// ==================== 测试 ====================

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks.clear();
    rafIdCounter = 0;
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== A. getDefaultModelId 相关测试 ====================
  // 注意：getDefaultModelId 未被导出，它是内部函数。
  // 我们通过测试 sendMessage 在无 session 时的行为间接验证。
  // 但我们可以通过 mock 内部模块来测试 localStorage 逻辑。

  describe('A. 默认模型 ID 逻辑（通过 sendMessage 间接验证）', () => {
    it('A1. localStorage 中有默认模型时，应使用该模型 ID', async () => {
      localStorage.setItem('cdf-know-clow-settings', JSON.stringify({
        models: { defaultModelId: 'gpt-4o' },
      }));

      // 设置 fetch 返回空流（done 事件）
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      // 验证 fetch 被调用，且请求体中 model 为 'gpt-4o'
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('gpt-4o');
    });

    it('A2. localStorage 无默认模型时，应使用 fallback 值 "auto"', async () => {
      localStorage.clear();

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('auto');
    });

    it('A3. localStorage JSON 解析失败时，应 fallback 到 "auto"', async () => {
      localStorage.setItem('cdf-know-clow-settings', 'not-json{{{');

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('auto');
    });
  });

  // ==================== B. useChat hook 基本行为 ====================

  describe('B. useChat hook 基本行为', () => {
    it('B1. 初始状态：isLoading=false, inputValue=""', async () => {
      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.inputValue).toBe('');
    });

    it('B2. sendMessage 调用后 isLoading 变为 true', async () => {
      // fetch 不立即 resolve，让 isLoading 保持 true
      let resolveFetch: (value: any) => void;
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFetch = resolve; })
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      // sendMessage 是 async，但我们在 act 中调用它
      let sendPromise: Promise<void>;
      act(() => {
        sendPromise = result.current.sendMessage('hello');
      });

      // 此时 isLoading 应为 true（因为 fetch 还没 resolve）
      expect(result.current.isLoading).toBe(true);

      // 清理：让 fetch resolve 以避免未处理的 promise rejection
      await act(async () => {
        resolveFetch!(
          createMockResponse([
            'data: {"type":"done"}\n',
          ])
        );
        await sendPromise;
      });
    });

    it('B3. sendMessage 完成后 isLoading 恢复为 false', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('B4. sendMessage 完成后 inputValue 被清空', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      // 先设置 inputValue
      act(() => {
        result.current.setInputValue('test input');
      });
      expect(result.current.inputValue).toBe('test input');

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(result.current.inputValue).toBe('');
    });

    it('B5. stopGeneration 调用后 isLoading 变为 false', async () => {
      // fetch 不立即 resolve
      let resolveFetch: (value: any) => void;
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFetch = resolve; })
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      let sendPromise: Promise<void>;
      act(() => {
        sendPromise = result.current.sendMessage('hello');
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.stopGeneration();
      });

      expect(result.current.isLoading).toBe(false);

      // 清理
      await act(async () => {
        resolveFetch!(
          createMockResponse([
            'data: {"type":"done"}\n',
          ])
        );
        try { await sendPromise; } catch { /* abort error expected */ }
      });
    });

    it('B6. sendMessage 空内容且无附件时不应发送', async () => {
      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('   ');
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('B7. sendMessage 正在加载时重复调用应被忽略', async () => {
      let resolveFetch: (value: any) => void;
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFetch = resolve; })
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      let sendPromise1: Promise<void>;
      act(() => {
        sendPromise1 = result.current.sendMessage('first');
      });

      // 第二次调用应被忽略（isLoadingRef.current 为 true）
      await act(async () => {
        await result.current.sendMessage('second');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 清理
      await act(async () => {
        resolveFetch!(
          createMockResponse([
            'data: {"type":"done"}\n',
          ])
        );
        await sendPromise1;
      });
    });

    it('B8. sendMessage 应创建用户消息并通知 onSessionUpdate', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('hello world');
      });

      // onSessionUpdate 至少被调用过（创建 userMsg + streamingMsg + 最终更新）
      expect(onSessionUpdate).toHaveBeenCalled();

      // 第一次调用应包含用户消息
      const firstCall = onSessionUpdate.mock.calls[0][0];
      const userMsg = firstCall.messages.find((m: any) => m.role === 'user');
      expect(userMsg).toBeDefined();
      expect(userMsg.content).toBe('hello world');
    });

    it('B9. sendMessage 应创建流式 assistant 占位消息', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      // onSessionUpdate 应被多次调用（userMsg + streamingMsg + 最终更新）
      // 查找包含 assistant 消息的调用，验证流式占位消息曾被创建
      const allCalls = onSessionUpdate.mock.calls;
      const streamingCall = allCalls.find((call: any) =>
        call[0].messages.some((m: any) => m.role === 'assistant')
      );
      expect(streamingCall).toBeDefined();

      const assistantMsg = streamingCall![0].messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      // 流式消息最终会变为 isStreaming=false，但消息本身应存在
      expect(assistantMsg.id).toBe('test-uuid-0000-0000-000000000000');
    });

    it('B10. resetAutoRetry 应可调用且不抛错', async () => {
      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      expect(() => {
        act(() => {
          result.current.resetAutoRetry();
        });
      }).not.toThrow();
    });
  });

  // ==================== C. 流式消息处理 ====================

  describe('C. 流式消息处理', () => {
    it('C1. SSE text 事件应被累积到最终消息内容', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"text","content":"Hello"}\n',
          'data: {"type":"text","content":" World"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      // 最终更新应包含完整文本
      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.content).toBe('Hello World');
      expect(assistantMsg.isStreaming).toBe(false);
    });

    it('C2. SSE thinking 事件应被累积到 thinking 字段', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"thinking","content":"Let me think..."}\n',
          'data: {"type":"text","content":"Answer"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.thinking).toBe('Let me think...');
      expect(assistantMsg.content).toBe('Answer');
    });

    it('C3. SSE init 事件应设置模型信息', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"init","model":"gpt-4o","modelName":"GPT-4o"}\n',
          'data: {"type":"text","content":"Hi"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.model).toBe('GPT-4o');
    });

    it('C4. SSE tool_call 事件应被记录到 toolCalls', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"tool_call","toolCallId":"tc-1","toolName":"search","toolArgs":"{}","toolResult":"found"}\n',
          'data: {"type":"text","content":"Done"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.toolCalls).toHaveLength(1);
      expect(assistantMsg.toolCalls[0].name).toBe('search');
      expect(assistantMsg.toolCalls[0].result).toBe('found');
    });

    it('C5. SSE done 事件带错误码时应设置 metadata.error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done","errorCode":"RATE_LIMIT","errorMessage":"请求过于频繁"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.metadata).toBeDefined();
      expect(assistantMsg.metadata.errorCode).toBe('RATE_LIMIT');
      expect(assistantMsg.metadata.error).toBe('请求过于频繁');
    });

    it('C6. fetch 失败后应产生错误消息', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      expect(result.current.isLoading).toBe(false);

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.content).toContain('发送消息失败');
    });

    it('C7. stopGeneration 应中止 fetch 请求', async () => {
      // Spy on AbortController.prototype.abort
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

      let resolveFetch: (value: any) => void;
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFetch = resolve; })
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      let sendPromise: Promise<void>;
      act(() => {
        sendPromise = result.current.sendMessage('hello');
      });

      act(() => {
        result.current.stopGeneration();
      });

      // abort 应被调用
      expect(abortSpy).toHaveBeenCalled();

      abortSpy.mockRestore();

      // 清理
      await act(async () => {
        resolveFetch!(
          createMockResponse([
            'data: {"type":"done"}\n',
          ])
        );
        try { await sendPromise; } catch { /* abort error expected */ }
      });
    });
  });

  // ==================== D. SendMessageOptions 测试 ====================

  describe('D. SendMessageOptions', () => {
    it('D1. options.model 应覆盖 session.model', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const session = {
        id: 'session-1',
        title: 'Test',
        model: 'gpt-3.5',
        messages: [],
      };

      const { result } = renderHook(() => useChat(session, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('hello', { model: 'gpt-4o' });
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('gpt-4o');
    });

    it('D2. options.attachments 应传递到请求体', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      const attachments = [
        { id: 'att-1', fileId: 'file-1', type: 'image' as const, url: 'data:image/png;base64,abc', fileName: 'test.png', mimeType: 'image/png', size: 1024 },
      ];

      await act(async () => {
        await result.current.sendMessage('', { attachments });
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0].fileName).toBe('test.png');
    });

    it('D4. options.skillContext 和 skillId 应传递到请求体', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('query', {
          skillContext: 'You are a WMS expert',
          skillId: 'wms-assistant',
        });
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.skillContext).toBe('You are a WMS expert');
      expect(body.skillId).toBe('wms-assistant');
    });

    it('D5. 有历史消息时应包含 conversationHistory', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const session = {
        id: 'session-1',
        title: 'Test',
        model: 'auto',
        messages: [
          { id: 'm1', role: 'user' as const, content: 'previous question', timestamp: new Date() },
          { id: 'm2', role: 'assistant' as const, content: 'previous answer', timestamp: new Date() },
        ],
      };

      const { result } = renderHook(() => useChat(session, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('follow up');
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.conversationHistory).toHaveLength(2);
      expect(body.conversationHistory[0].role).toBe('user');
      expect(body.conversationHistory[1].role).toBe('assistant');
    });
  });

  // ==================== E. v8.5-fix: thinking 渲染修复 ====================
  // 修复内容:
  //   1. scheduleRender() 在 thinkingBuffer > 0 且 renderHandle !== null 时强制重调度
  //   2. thinking 事件始终调用 scheduleRender()，不再检查 renderHandle
  // 核心验证: 无论多少 thinking 事件、无论事件顺序如何，所有 thinking 内容最终被消费

  describe('E. v8.5-fix: thinking 渲染修复', () => {
    it('E1. 多个连续 thinking 事件应全部累积到 thinking 字段', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"thinking","content":"Let me analyze"}\n',
          'data: {"type":"thinking","content":" the data step by step."}\n',
          'data: {"type":"thinking","content":" First, check the database."}\n',
          'data: {"type":"text","content":"Here is the result:"}\n',
          'data: {"type":"text","content":" Table A has 100 rows."}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      // done 事件直接清空 thinkingBuffer 到 streamingMsg.thinking
      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      // 所有 thinking 分片被累积
      expect(assistantMsg.thinking).toBe('Let me analyze the data step by step. First, check the database.');
      expect(assistantMsg.content).toBe('Here is the result: Table A has 100 rows.');
      // thinkingDone 被标记
      expect(assistantMsg.thinkingDone).toBe(true);
    });

    it('E2. 仅 thinking 事件后接 done（无 text），thinking 被用做兜底内容', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"thinking","content":"First thought"}\n',
          'data: {"type":"thinking","content":" Second thought"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      // thinking 字段完整
      expect(assistantMsg.thinking).toBe('First thought Second thought');
      // content 用思考内容兜底（useChat.ts line ~898-908 逻辑）
      expect(assistantMsg.content).toContain('First thought');
      expect(assistantMsg.thinkingDone).toBe(true);
    });

    it('E3. thinking 事件大量快速到达时不应丢失内容', async () => {
      // 构造 30 个小型 thinking 事件（模拟深度思考场景）
      const lines: string[] = [];
      for (let i = 0; i < 30; i++) {
        lines.push(`data: {"type":"thinking","content":"Chunk ${i},"}\n`);
      }
      lines.push('data: {"type":"text","content":"Final answer"}\n');
      lines.push('data: {"type":"done"}\n');

      mockFetch.mockResolvedValueOnce(createMockResponse(lines));

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      // 验证所有 30 个 chunk 都在
      for (let i = 0; i < 30; i++) {
        expect(assistantMsg.thinking).toContain(`Chunk ${i},`);
      }
      expect(assistantMsg.content).toBe('Final answer');
    });

    it('E4. thinking 事件与 init/tool_call 等其他元数据事件交织不应阻塞', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"init","model":"gpt-4o","modelName":"GPT-4o"}\n',
          'data: {"type":"thinking","content":"Thinking step 1"}\n',
          'data: {"type":"tool_call","toolCallId":"tc-1","toolName":"search","toolArgs":"{}"}\n',
          'data: {"type":"thinking","content":" Thinking step 2"}\n',
          'data: {"type":"tool_call","toolCallId":"tc-2","toolName":"read","toolArgs":"{}","toolResult":"data"}\n',
          'data: {"type":"text","content":"Based on analysis, here is the answer."}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      // thinking 完整
      expect(assistantMsg.thinking).toBe('Thinking step 1 Thinking step 2');
      // toolCalls 存在
      expect(assistantMsg.toolCalls).toHaveLength(2);
      expect(assistantMsg.toolCalls[0].name).toBe('search');
      expect(assistantMsg.toolCalls[1].name).toBe('read');
      expect(assistantMsg.toolCalls[1].result).toBe('data');
      // content 完整
      expect(assistantMsg.content).toBe('Based on analysis, here is the answer.');
      // 模型信息正确
      expect(assistantMsg.model).toBe('GPT-4o');
    });

    it('E5. thinking 事件中 thinkingType 应被正确设置', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"thinking","content":"Deep reasoning...","thinkingType":"deep"}\n',
          'data: {"type":"text","content":"Answer"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.thinking).toBe('Deep reasoning...');
      expect(assistantMsg.thinkingType).toBe('deep');
    });

    it('E6. 思考 + 首次 text 事件应自动标记 thinkingDone', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"thinking","content":"Thinking..."}\n',
          // 收到首个 text 事件 → thinkingDone 设为 true
          'data: {"type":"text","content":"First output"}\n',
          'data: {"type":"text","content":" More output"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.thinkingDone).toBe(true);
      expect(assistantMsg.content).toBe('First output More output');
    });

    it('E7. 仅 text 无 thinking 事件时应无 thinking 且 thinkingDone=true', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          'data: {"type":"text","content":"Hello"}\n',
          'data: {"type":"text","content":" World"}\n',
          'data: {"type":"done"}\n',
        ])
      );

      const { useChat } = await import('../useChat');
      const onSessionUpdate = vi.fn();

      const { result } = renderHook(() => useChat(undefined, onSessionUpdate));

      await act(async () => {
        await result.current.sendMessage('test');
      });

      const lastCall = onSessionUpdate.mock.calls[onSessionUpdate.mock.calls.length - 1][0];
      const assistantMsg = lastCall.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.thinking).toBeFalsy();
      // done 事件总会标记 thinkingDone
      expect(assistantMsg.thinkingDone).toBe(true);
      expect(assistantMsg.content).toBe('Hello World');
    });
  });
});
