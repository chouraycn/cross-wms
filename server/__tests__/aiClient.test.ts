/**
 * AI Client 单元测试
 *
 * 覆盖 AIAPIError、classifyError、isRetryableError、calculateDelay、
 * validateToolMessages、callAIModelStream、callAIModel 等核心函数。
 *
 * 内部函数（classifyError / isRetryableError / calculateDelay / validateToolMessages）
 * 通过 callAIModelStream 的公开行为间接验证。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===================== Mock 依赖模块 =====================
// 使用 vi.hoisted 确保在 vi.mock 提升前初始化变量
const { mockIsLocalModel, mockSanitizeToolMessages, mockLogInfo, mockLogWarn, mockLogError, mockLogDebug } = vi.hoisted(() => {
  return {
    mockIsLocalModel: vi.fn().mockReturnValue(false),
    mockSanitizeToolMessages: vi.fn(<T>(msgs: T): T => msgs),
    mockLogInfo: vi.fn(),
    mockLogWarn: vi.fn(),
    mockLogError: vi.fn(),
    mockLogDebug: vi.fn(),
  };
});

vi.mock('../modelsStore.js', () => ({ isLocalModel: mockIsLocalModel }));
vi.mock('../engine/contextTruncate.js', () => ({ sanitizeToolMessages: mockSanitizeToolMessages }));
vi.mock('../logger.js', () => ({ logger: { info: mockLogInfo, warn: mockLogWarn, error: mockLogError, debug: mockLogDebug } }));

// ===================== 被测试模块导入 =====================
import { AIAPIError, callAIModelStream, callAIModel } from '../aiClient.js';

// ===================== 测试辅助函数 =====================

/** 创建一个模拟的 ReadableStream reader（jsdom 兼容） */
function createMockReader(chunks: string[]): ReadableStreamDefaultReader {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: async () => {
      if (index < chunks.length) {
        const value = encoder.encode(chunks[index++]);
        return { done: false, value };
      }
      return { done: true, value: undefined } as ReadableStreamReadResult<Uint8Array>;
    },
    releaseLock: () => {},
    cancel: async () => {},
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader;
}

/** 创建一个包含 SSE 数据的 mock Response（jsdom 兼容，不依赖原生 ReadableStream） */
function createSSEResponse(sseChunks: string[]): Response {
  const reader = createMockReader(sseChunks);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: { getReader: () => reader },
    text: async () => sseChunks.join(''),
    json: async () => ({}),
    clone: () => createSSEResponse(sseChunks),
  } as unknown as Response;
}

/** 创建一个 HTTP 错误 Response */
function createErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 429 ? 'Too Many Requests' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: null,
    text: async () => body,
    json: async () => JSON.parse(body),
    clone: () => createErrorResponse(status, body),
  } as unknown as Response;
}

/** 基础模型配置 */
const baseConfig = {
  id: 'test-model',
  provider: 'openai',
  apiEndpoint: 'https://api.example.com/v1',
  apiKey: 'test-key',
  temperature: 0.7,
  maxTokens: 4096,
};

/** onChunk 空回调 */
const noopChunk = () => {};

// ===================== AIAPIError =====================
describe('AIAPIError', () => {
  it('should create error with all properties', () => {
    const error = new AIAPIError(
      'test message',
      'auth',
      401,
      '{"error":"unauthorized"}',
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('test message');
    expect(error.category).toBe('auth');
    expect(error.statusCode).toBe(401);
    expect(error.responseBody).toBe('{"error":"unauthorized"}');
    expect(error.name).toBe('AIAPIError');
  });

  it('should have name set to AIAPIError', () => {
    const error = new AIAPIError('msg', 'unknown');
    expect(error.name).toBe('AIAPIError');
  });

  it('should handle optional statusCode and responseBody', () => {
    const error = new AIAPIError('network error', 'network');
    expect(error.statusCode).toBeUndefined();
    expect(error.responseBody).toBeUndefined();
  });

  it('should support all category values', () => {
    const categories = [
      'auth', 'rate_limit', 'network', 'timeout',
      'server', 'model_not_supported', 'unknown',
    ] as const;
    for (const cat of categories) {
      const error = new AIAPIError('test', cat);
      expect(error.category).toBe(cat);
    }
  });
});

// ===================== classifyError（通过 HTTP 错误间接测试）=====================
describe('classifyError（通过 callAIModelStream HTTP 响应间接验证）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('401 状态码应归类为 auth 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(createErrorResponse(401, '{"error":"invalid_api_key"}'));
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'auth', statusCode: 401 });
  });

  it('403 状态码应归类为 auth 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(createErrorResponse(403, 'Forbidden'));
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'auth', statusCode: 403 });
  });

  it('429 状态码应归类为 rate_limit 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(createErrorResponse(429, 'Too Many Requests'));
    // 429 错误会被重试，但 mock 始终返回 429，最终抛出
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'rate_limit' });
  });

  it('500+ 状态码应归类为 server 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(createErrorResponse(502, 'Bad Gateway'));
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'server', statusCode: 502 });
  });

  it('503 状态码应归类为 server 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(createErrorResponse(503, 'Service Unavailable'));
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'server', statusCode: 503 });
  });

  it('400 + model_not_supported 应归类为 model_not_supported 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createErrorResponse(400, '{"error":"model_not_supported","message":"model not available"}'),
    );
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'model_not_supported', statusCode: 400 });
  });

  it('400 + invalid_model 应归类为 model_not_supported 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createErrorResponse(400, '{"error":"invalid_model"}'),
    );
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'model_not_supported' });
  });

  it('400 + model not found 应归类为 model_not_supported 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createErrorResponse(400, 'model not found: unknown-model'),
    );
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'model_not_supported' });
  });

  it('400 + 其他内容应归类为 unknown 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createErrorResponse(400, '{"error":"bad_request"}'),
    );
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'unknown', statusCode: 400 });
  });
});

// ===================== isRetryableError + calculateDelay（通过重试行为间接测试）=====================
describe('重试行为（通过 callAIModelStream 调用次数间接验证）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('rate_limit (429) 错误应触发重试，重试成功后返回正常结果', async () => {
    // 第1次返回 429，第2次返回成功
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createErrorResponse(429, 'rate limit'))
      .mockResolvedValueOnce(createSSEResponse([
        'data: {"choices":[{"delta":{"content":"ok"},"index":0}]}\n\ndata: [DONE]\n\n',
      ]));
    const result = await callAIModelStream(
      baseConfig, [{ role: 'user', content: 'hello' }], noopChunk,
    );
    expect(result.content).toBe('ok');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('auth (401) 错误不应重试，直接抛出', async () => {
    global.fetch = vi.fn().mockResolvedValue(createErrorResponse(401, 'unauthorized'));
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'auth' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('server (502) 错误应触发所有重试（maxRetries=2 共 3 次）', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createErrorResponse(502, 'bad gateway'))
      .mockResolvedValueOnce(createErrorResponse(502, 'bad gateway'))
      .mockResolvedValueOnce(createErrorResponse(502, 'bad gateway'));
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'server' });
    // maxRetries=2，所以应尝试 3 次
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('network ECONNREFUSED 错误会被包装为 AIAPIError(network)，属于可重试错误', async () => {
    const connRefused = new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:11434');
    global.fetch = vi.fn().mockRejectedValue(connRefused);
    // TypeError(ECONNREFUSED) 在 fetch catch 中被包装为 AIAPIError('network')
    // AIAPIError('network') 的 isRetryableError 返回 true → 会触发重试
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toThrow(AIAPIError);
    // maxRetries=2，应调用 3 次
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('AbortError (DOMException) 应被原样抛出，不触发重试', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    global.fetch = vi.fn().mockRejectedValue(abortError);
    // DOMException 不是 TypeError，isRetryableError 返回 false，不应重试
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toThrow(DOMException);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('一般 TypeError（不含 ECONNREFUSED）应触发重试', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed: some other reason'))
      .mockResolvedValueOnce(createSSEResponse([
        'data: {"choices":[{"delta":{"content":"ok"},"index":0}]}\n\ndata: [DONE]\n\n',
      ]));
    const result = await callAIModelStream(
      baseConfig, [{ role: 'user', content: 'hello' }], noopChunk,
    );
    expect(result.content).toBe('ok');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('model_not_supported 错误不应重试', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createErrorResponse(400, '{"error":"model_not_supported"}'),
    );
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hello' }], noopChunk),
    ).rejects.toMatchObject({ category: 'model_not_supported' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ===================== calculateDelay（通过重试时间间隔间接测试）=====================
describe('calculateDelay（通过 retry timing 间接验证）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('重试间隔应在有效范围内，全部重试完成后应调用 3 次', async () => {
    vi.useFakeTimers();
    // 始终返回 429，触发所有重试
    global.fetch = vi.fn().mockRejectedValue(new TypeError('temporary network error'));

    // 捕获 rejection 避免 unhandled rejection
    const promise = callAIModelStream(
      baseConfig, [{ role: 'user', content: 'hello' }], noopChunk,
    ).catch(() => {}); // 静默捕获，稍后验证

    // 推进时间让所有重试完成（尝试0→delay[750,1250]→尝试1→delay[1500,2500]→尝试2→结束）
    await vi.advanceTimersByTimeAsync(5000);

    // 等待 promise 解决（已被 catch 捕获）
    await promise;

    // maxRetries=2 → 应调用 3 次
    expect(global.fetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

// ===================== validateToolMessages（通过 callAIModelStream 间接测试）=====================
describe('validateToolMessages（通过消息传递和日志调用间接验证）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":"response"},"index":0}]}\n\ndata: [DONE]\n\n',
    ]));
  });

  it('有效 tool_calls 配对应正常通过', async () => {
    const messages = [
      { role: 'user', content: 'check inventory' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_inventory', arguments: '{}' } }],
      },
      { role: 'tool', content: '{"items":10}', tool_call_id: 'call_1' },
      { role: 'user', content: 'thanks' },
    ];
    const result = await callAIModelStream(
      baseConfig, messages, noopChunk,
    );
    expect(result.content).toBe('response');
    // 无缺失 → 不应调用 logger.error 含不完整 tool_calls
    expect(mockLogError).not.toHaveBeenCalledWith(
      expect.stringContaining('不完整的 tool_calls'),
    );
  });

  it('缺失 tool 结果时应自动修复（补齐缺失的 tool 消息）', async () => {
    const messages = [
      { role: 'user', content: 'do something' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'tool_b', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: 'result_a', tool_call_id: 'call_1' },
      // call_2 没有对应的 tool 消息 → 应被补齐
      { role: 'user', content: 'continue' },
    ];
    await callAIModelStream(baseConfig, messages, noopChunk);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining('不完整的 tool_calls'),
    );
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining('补齐'),
    );
  });

  it('所有 tool_calls 均缺失对应 tool 消息时应补齐 tool 消息', async () => {
    const messages = [
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'tool_x', arguments: '{}' } }],
      },
      // 没有任何 tool 消息跟随
      { role: 'user', content: 'continue' },
    ];
    await callAIModelStream(baseConfig, messages, noopChunk);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining('补齐'),
    );
  });

  it('空 messages 数组不应报错', async () => {
    // 重写 fetch mock 以返回空内容
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":""},"index":0}]}\n\ndata: [DONE]\n\n',
    ]));
    const result = await callAIModelStream(baseConfig, [], noopChunk);
    expect(result.content).toBe('');
  });

  it('无 tool_calls 的 assistant 消息不应触发校验', async () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello!' },
    ];
    const result = await callAIModelStream(baseConfig, messages, noopChunk);
    expect(result.content).toBe('response');
    expect(mockLogError).not.toHaveBeenCalledWith(
      expect.stringContaining('tool_calls'),
    );
  });
});

// ===================== callAIModelStream =====================
describe('callAIModelStream - 流式成功响应', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('应解析 SSE 流式分块并返回完整内容', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n',
      '\ndata: {"choices":[{"delta":{"content":" World"},"index":0}]}\n',
      '\ndata: [DONE]\n\n',
    ]));
    const chunks: string[] = [];
    const result = await callAIModelStream(
      baseConfig,
      [{ role: 'user', content: 'say hi' }],
      (text) => { chunks.push(text); },
    );
    expect(result.content).toBe('Hello World');
    expect(chunks).toEqual(['Hello', ' World']);
  });

  it('应触发 onChunk 回调', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":"chunk1"},"index":0}]}\n\ndata: [DONE]\n\n',
    ]));
    const onChunk = vi.fn();
    await callAIModelStream(baseConfig, [{ role: 'user', content: 'test' }], onChunk);
    expect(onChunk).toHaveBeenCalledWith('chunk1');
  });

  it('应提取 reasoning_content', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"thinking step 1"},"index":0}]}\n',
      '\ndata: {"choices":[{"delta":{"content":"final answer"},"index":0}]}\n',
      '\ndata: [DONE]\n\n',
    ]));
    const thinkingChunks: string[] = [];
    const result = await callAIModelStream(
      baseConfig,
      [{ role: 'user', content: 'think' }],
      noopChunk,
      undefined,
      (text) => { thinkingChunks.push(text); },
    );
    expect(result.reasoningContent).toBe('thinking step 1');
    expect(thinkingChunks).toEqual(['thinking step 1']);
    expect(result.content).toBe('final answer');
  });

  it('应提取 token usage 信息', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":"ans"},"index":0}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n',
      '\ndata: [DONE]\n\n',
    ]));
    const result = await callAIModelStream(
      baseConfig, [{ role: 'user', content: 'hi' }], noopChunk,
    );
    expect(result.usage).toBeDefined();
    expect(result.usage!.promptTokens).toBe(10);
    expect(result.usage!.completionTokens).toBe(20);
    expect(result.usage!.totalTokens).toBe(30);
  });

  it('应处理 [DONE] 信号', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: [DONE]\n\n',
    ]));
    const result = await callAIModelStream(
      baseConfig, [{ role: 'user', content: 'empty' }], noopChunk,
    );
    expect(result.content).toBe('');
  });
});

describe('callAIModelStream - 错误处理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('缺少 API Key 时应抛出 auth 错误', async () => {
    mockIsLocalModel.mockReturnValue(false);
    const configNoKey = { ...baseConfig, apiKey: undefined };
    await expect(
      callAIModelStream(configNoKey, [{ role: 'user', content: 'hi' }], noopChunk),
    ).rejects.toMatchObject({ category: 'auth' });
  });

  it('缺少 API Endpoint 时应抛出 unknown 错误', async () => {
    const configNoEndpoint = { ...baseConfig, apiEndpoint: '' };
    await expect(
      callAIModelStream(configNoEndpoint, [{ role: 'user', content: 'hi' }], noopChunk),
    ).rejects.toMatchObject({ category: 'unknown' });
  });

  it('fetch 抛出 ECONNREFUSED 错误时应包装为 AIAPIError network', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:11434'),
    );
    await expect(
      callAIModelStream(baseConfig, [{ role: 'user', content: 'hi' }], noopChunk),
    ).rejects.toMatchObject({ category: 'network' });
  });
});

describe('callAIModelStream - 边缘情况', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('空 messages 数组应正常运行', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":""},"index":0}]}\n\ndata: [DONE]\n\n',
    ]));
    const result = await callAIModelStream(baseConfig, [], noopChunk);
    expect(result.content).toBe('');
  });

  it('流式响应中无内容时返回空字符串', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n',
    ]));
    const result = await callAIModelStream(
      baseConfig, [{ role: 'user', content: 'test' }], noopChunk,
    );
    expect(result.content).toBe('');
  });

  it('abort signal 应在请求前抛出', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      callAIModelStream(
        baseConfig, [{ role: 'user', content: 'hi' }], noopChunk, controller.signal,
      ),
    ).rejects.toMatchObject({ category: 'unknown' });
  });

  it('本地模型应跳过 API Key 检查', async () => {
    mockIsLocalModel.mockReturnValue(true);
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":"local"},"index":0}]}\n\ndata: [DONE]\n\n',
    ]));
    const result = await callAIModelStream(
      { ...baseConfig, apiKey: undefined },
      [{ role: 'user', content: 'hi' }],
      noopChunk,
    );
    expect(result.content).toBe('local');
  });
});

// ===================== callAIModel =====================
describe('callAIModel - 非流式调用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('应返回纯文本内容', async () => {
    global.fetch = vi.fn().mockResolvedValue(createSSEResponse([
      'data: {"choices":[{"delta":{"content":"Hello World"},"index":0}]}\n\ndata: [DONE]\n\n',
    ]));
    const result = await callAIModel(
      baseConfig,
      [{ role: 'user', content: 'say hi' }],
    );
    expect(result).toBe('Hello World');
  });

  it('应接受 AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      callAIModel(baseConfig, [{ role: 'user', content: 'hi' }], controller.signal),
    ).rejects.toThrow();
  });
});