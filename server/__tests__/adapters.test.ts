/**
 * AI API 适配器单元测试
 *
 * 覆盖：
 * - 适配器注册表（注册、获取、判断、推断）
 * - OpenAI Chat 适配器（端点补全、认证、角色映射、System 回退、思考级别、媒体校验）
 * - Anthropic 适配器（端点补全、认证、消息转换、思考预算）
 * - Google 适配器（端点格式、消息转换）
 * - OpenAI Completions 适配器（prompt 转换、不支持 tool）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ===================== Mock 依赖模块 =====================
// logger 在所有适配器与注册表中均有引用，mock 以避免 pino 噪声
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// aiClient.ts 依赖较多（modelsStore、contextTruncate、localServiceManager 等），
// 适配器仅需要 AIAPIError 与 classifyError，故 mock 整个模块以隔离副作用。
vi.mock('../aiClient.js', () => {
  class AIAPIError extends Error {
    constructor(
      message: string,
      public readonly category: 'auth' | 'rate_limit' | 'network' | 'timeout' | 'server' | 'model_not_supported' | 'unknown',
      public readonly statusCode?: number,
      public readonly responseBody?: string,
    ) {
      super(message);
      this.name = 'AIAPIError';
    }
  }
  function classifyError(statusCode: number, _responseBody: string): AIAPIError['category'] {
    if (statusCode === 401 || statusCode === 403) return 'auth';
    if (statusCode === 429) return 'rate_limit';
    if (statusCode >= 500) return 'server';
    if (statusCode >= 400) return 'unknown';
    return 'unknown';
  }
  return { AIAPIError, classifyError };
});

// ===================== 被测模块导入 =====================
import {
  getAdapter,
  hasAdapter,
  getRegisteredApiTypes,
  inferApiType,
  initBuiltinAdapters,
} from '../adapters/registry.js';
import { OpenAIChatAdapter } from '../adapters/openAIChatAdapter.js';
import { AnthropicAdapter } from '../adapters/anthropicAdapter.js';
import { GoogleGenerativeAIAdapter } from '../adapters/googleGenerativeAIAdapter.js';
import { OpenAICompletionsAdapter } from '../adapters/openAICompletionsAdapter.js';
import type { AdapterConfig, StreamCallbacks } from '../adapters/types.js';
import type { MessageContent, AIResponse, ToolCall } from '../aiClient.js';

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

/** 创建一个包含 SSE 数据的 mock Response */
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
    statusText: 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: null,
    text: async () => body,
    json: async () => JSON.parse(body),
    clone: () => createErrorResponse(status, body),
  } as unknown as Response;
}

/** 捕获 fetch 调用参数并返回指定 Response */
function mockFetchOnce(response: Response): { calls: Array<{ url: string; opts: RequestInit }> } {
  const calls: Array<{ url: string; opts: RequestInit }> = [];
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    calls.push({ url, opts: opts || ({} as RequestInit) });
    return response;
  });
  return { calls };
}

/** 构建基础 AdapterConfig */
function baseConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    apiEndpoint: 'https://api.example.com/v1',
    apiKey: 'test-key',
    modelId: 'test-model',
    authMode: 'api-key',
    temperature: 0.7,
    maxTokens: 1024,
    ...overrides,
  };
}

/** 构建空回调（收集 chunk/thinking/toolCall/usage） */
function captureCallbacks(): StreamCallbacks & {
  chunks: string[];
  thinking: string[];
  toolCalls: ToolCall[];
  usage?: AIResponse['usage'];
} {
  const chunks: string[] = [];
  const thinking: string[] = [];
  const toolCalls: ToolCall[] = [];
  let usage: AIResponse['usage'] | undefined;
  return {
    chunks,
    thinking,
    toolCalls,
    usage,
    onChunk: (t: string) => chunks.push(t),
    onThinking: (t: string) => thinking.push(t),
    onToolCall: (tc: ToolCall) => toolCalls.push(tc),
    onUsage: (u: AIResponse['usage']) => {
      usage = u;
    },
  };
}

// ===================== 适配器注册表测试 =====================

describe('适配器注册表', () => {
  beforeEach(() => {
    initBuiltinAdapters();
  });

  it('应注册 4 种内置适配器', () => {
    const types = getRegisteredApiTypes();
    expect(types).toContain('openai-chat');
    expect(types).toContain('openai-completions');
    expect(types).toContain('anthropic-messages');
    expect(types).toContain('google-generative-ai');
    expect(types).toHaveLength(4);
  });

  it('hasAdapter 应正确判断已注册类型', () => {
    expect(hasAdapter('openai-chat')).toBe(true);
    expect(hasAdapter('openai-completions')).toBe(true);
    expect(hasAdapter('anthropic-messages')).toBe(true);
    expect(hasAdapter('google-generative-ai')).toBe(true);
  });

  it('hasAdapter 应正确判断未注册类型', () => {
    expect(hasAdapter('non-existent')).toBe(false);
    expect(hasAdapter('')).toBe(false);
  });

  it('getAdapter 应返回对应适配器实例', () => {
    const adapter = getAdapter('openai-chat');
    expect(adapter).not.toBeNull();
    expect(adapter?.apiType).toBe('openai-chat');
  });

  it('getAdapter 不存在时返回 null', () => {
    const adapter = getAdapter('non-existent' as never);
    expect(adapter).toBeNull();
  });

  it('每次 getAdapter 应返回新实例', () => {
    const a1 = getAdapter('openai-chat');
    const a2 = getAdapter('openai-chat');
    expect(a1).not.toBe(a2);
  });

  describe('inferApiType', () => {
    it('anthropic provider 应推断为 anthropic-messages', () => {
      expect(inferApiType('anthropic', 'https://api.anthropic.com/v1')).toBe('anthropic-messages');
    });

    it('anthropic 域名应推断为 anthropic-messages', () => {
      expect(inferApiType(undefined, 'https://api.anthropic.com/v1')).toBe('anthropic-messages');
    });

    it('包含 /messages 应推断为 anthropic-messages', () => {
      expect(inferApiType(undefined, 'https://api.example.com/v1/messages')).toBe('anthropic-messages');
    });

    it('google provider 应推断为 google-generative-ai', () => {
      expect(inferApiType('google', 'https://generativelanguage.googleapis.com/v1beta')).toBe('google-generative-ai');
    });

    it('gemini provider 应推断为 google-generative-ai', () => {
      expect(inferApiType('gemini', undefined)).toBe('google-generative-ai');
    });

    it('google 域名应推断为 google-generative-ai', () => {
      expect(inferApiType(undefined, 'https://generativelanguage.googleapis.com/v1beta')).toBe('google-generative-ai');
    });

    it('包含 /completions 但不包含 /chat/completions 应推断为 openai-completions', () => {
      expect(inferApiType(undefined, 'https://api.example.com/v1/completions')).toBe('openai-completions');
    });

    it('包含 /chat/completions 应推断为 openai-chat', () => {
      expect(inferApiType(undefined, 'https://api.example.com/v1/chat/completions')).toBe('openai-chat');
    });

    it('默认应推断为 openai-chat', () => {
      expect(inferApiType('openai', 'https://api.openai.com/v1')).toBe('openai-chat');
    });

    it('无信息时默认为 openai-chat', () => {
      expect(inferApiType(undefined, undefined)).toBe('openai-chat');
    });

    it('provider 大小写不敏感', () => {
      expect(inferApiType('Anthropic', undefined)).toBe('anthropic-messages');
      expect(inferApiType('GOOGLE', undefined)).toBe('google-generative-ai');
    });
  });
});

// ===================== OpenAI Chat 适配器测试 =====================

describe('OpenAIChatAdapter', () => {
  let adapter: OpenAIChatAdapter;

  beforeEach(() => {
    adapter = new OpenAIChatAdapter();
    global.fetch = vi.fn();
  });

  it('apiType 应为 openai-chat', () => {
    expect(adapter.apiType).toBe('openai-chat');
  });

  describe('端点自动补全', () => {
    it('缺少 /chat/completions 时应自动追加', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiEndpoint: 'https://api.example.com/v1' }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).toBe('https://api.example.com/v1/chat/completions');
    });

    it('已有 /chat/completions 时不重复追加', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiEndpoint: 'https://api.example.com/v1/chat/completions' }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).toBe('https://api.example.com/v1/chat/completions');
    });

    it('尾部斜杠应被去除', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiEndpoint: 'https://api.example.com/v1///' }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).toBe('https://api.example.com/v1/chat/completions');
    });
  });

  describe('认证头', () => {
    it('api-key 模式应设置 Bearer Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'my-key', authMode: 'api-key' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-key');
    });

    it('token 模式应设置 Bearer Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'my-token', authMode: 'token' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('oauth 模式应设置 Bearer Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'oauth-token', authMode: 'oauth' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer oauth-token');
    });

    it('aws-sdk 模式不设置 Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'aws-key', authMode: 'aws-sdk' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('无 apiKey 时不设置 Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: '', authMode: 'api-key' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('compat.apiVersion 应作为请求头', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ compat: { apiVersion: '2024-02-15' } }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['api-version']).toBe('2024-02-15');
    });

    it('compat.extraHeaders 应被合并', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ compat: { extraHeaders: { 'X-Custom': 'val' } } }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('val');
    });
  });

  describe('角色映射', () => {
    it('应按 roleMap 映射消息角色', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ compat: { roleMap: { user: 'human', assistant: 'assistant' } } }),
        [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.messages[0].role).toBe('human');
      expect(body.messages[1].role).toBe('assistant');
    });

    it('未映射的角色保持原值', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ compat: { roleMap: { user: 'human' } } }),
        [{ role: 'system', content: 'sys' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.messages[0].role).toBe('system');
    });
  });

  describe('System 消息回退', () => {
    it('merge-to-first-user：system 内容合并到首条 user 消息', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          compat: {
            supportsSystemMessage: false,
            systemMessageFallback: 'merge-to-first-user',
          },
        }),
        [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'hi' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      // system 消息应被移除
      expect(body.messages.filter((m: { role: string }) => m.role === 'system')).toHaveLength(0);
      // 首条 user 消息应包含 system 内容
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toContain('You are helpful.');
      expect(body.messages[0].content).toContain('hi');
    });

    it('ignore：system 消息应被移除', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          compat: {
            supportsSystemMessage: false,
            systemMessageFallback: 'ignore',
          },
        }),
        [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'hi' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toBe('hi');
    });

    it('未设置 fallback 时保留 system 消息', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ compat: { supportsSystemMessage: false } }),
        [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'hi' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.messages.filter((m: { role: string }) => m.role === 'system')).toHaveLength(1);
    });
  });

  describe('思考级别映射', () => {
    it('high 级别应映射为 reasoning_effort=high', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'high',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.reasoning_effort).toBe('high');
    });

    it('low 级别应映射为 reasoning_effort=low', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'low',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.reasoning_effort).toBe('low');
    });

    it('medium 级别应映射为 reasoning_effort=medium', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'medium',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.reasoning_effort).toBe('medium');
    });

    it('off 级别不应设置 reasoning_effort', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'off',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.reasoning_effort).toBeUndefined();
    });

    it('supportsReasoning 为 false 时不设置 reasoning_effort', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'high',
          compat: { supportsReasoning: false },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.reasoning_effort).toBeUndefined();
    });

    it('可通过 compat.thinking.paramField 自定义字段名', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'high',
          compat: {
            supportsReasoning: true,
            thinking: { paramField: 'reasoning' },
          },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.reasoning).toBe('high');
      expect(body.reasoning_effort).toBeUndefined();
    });

    it('可通过 compat.thinking.levelMap 自定义级别值', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'high',
          compat: {
            supportsReasoning: true,
            thinking: { levelMap: { high: 'HEAVY' } },
          },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.reasoning_effort).toBe('HEAVY');
    });
  });

  describe('媒体校验', () => {
    it('maxImages 应截断超出数量的图片', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      const content: MessageContent = [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aaa' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,bbb' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,ccc' } },
      ];
      await adapter.call(
        baseConfig({ compat: { maxImages: 1 } }),
        [{ role: 'user', content }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      const images = body.messages[0].content.filter((c: { type: string }) => c.type === 'image_url');
      expect(images).toHaveLength(1);
    });

    it('maxImages 未设置时不截断', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      const content: MessageContent = [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aaa' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,bbb' } },
      ];
      await adapter.call(
        baseConfig({}),
        [{ role: 'user', content }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      const images = body.messages[0].content.filter((c: { type: string }) => c.type === 'image_url');
      expect(images).toHaveLength(2);
    });
  });

  describe('流式响应解析', () => {
    it('应正确解析 SSE 文本 chunk 并调用 onChunk', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.chunks).toEqual(['Hello', ' world']);
      expect(result.content).toBe('Hello world');
    });

    it('应解析 reasoning_content 并调用 onThinking', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.thinking).toEqual(['thinking...']);
      expect(result.reasoningContent).toBe('thinking...');
      expect(result.content).toBe('answer');
    });

    it('应解析 tool_calls 并调用 onToolCall', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":"{\\"city\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Beijing\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'weather?' }],
        cbs,
      );
      expect(cbs.toolCalls).toHaveLength(1);
      expect(cbs.toolCalls[0].id).toBe('call_1');
      expect(cbs.toolCalls[0].function.name).toBe('get_weather');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.arguments).toContain('Beijing');
    });

    it('应解析 usage 数据', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
        'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
      expect(result.usage?.totalTokens).toBe(15);
    });
  });

  describe('错误处理', () => {
    it('HTTP 401 应抛出 AIAPIError(category=auth)', async () => {
      mockFetchOnce(createErrorResponse(401, '{"error":"invalid api key"}'));
      await expect(
        adapter.call(baseConfig(), [{ role: 'user', content: 'hi' }]),
      ).rejects.toMatchObject({ name: 'AIAPIError', category: 'auth' });
    });

    it('HTTP 429 应抛出 AIAPIError(category=rate_limit)', async () => {
      mockFetchOnce(createErrorResponse(429, 'Too Many Requests'));
      await expect(
        adapter.call(baseConfig(), [{ role: 'user', content: 'hi' }]),
      ).rejects.toMatchObject({ name: 'AIAPIError', category: 'rate_limit' });
    });

    it('HTTP 500 应抛出 AIAPIError(category=server)', async () => {
      mockFetchOnce(createErrorResponse(500, 'Internal Server Error'));
      await expect(
        adapter.call(baseConfig(), [{ role: 'user', content: 'hi' }]),
      ).rejects.toMatchObject({ name: 'AIAPIError', category: 'server' });
    });

    it('fetch 抛出 ECONNREFUSED 应包装为 AIAPIError(network)', async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:8080'),
      );
      await expect(
        adapter.call(baseConfig(), [{ role: 'user', content: 'hi' }]),
      ).rejects.toMatchObject({ name: 'AIAPIError', category: 'network' });
    });
  });
});

// ===================== Anthropic 适配器测试 =====================

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
    global.fetch = vi.fn();
  });

  it('apiType 应为 anthropic-messages', () => {
    expect(adapter.apiType).toBe('anthropic-messages');
  });

  describe('端点补全', () => {
    it('缺少 /messages 时应自动追加', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiEndpoint: 'https://api.anthropic.com/v1' }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    });

    it('已有 /messages 时不重复追加', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiEndpoint: 'https://api.anthropic.com/v1/messages' }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    });
  });

  describe('认证头', () => {
    it('api-key 模式应设置 x-api-key', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'anthropic-key', authMode: 'api-key' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('anthropic-key');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('token 模式应设置 Bearer Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'anthropic-token', authMode: 'token' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer anthropic-token');
      expect(headers['x-api-key']).toBeUndefined();
    });

    it('oauth 模式应设置 Bearer Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'oauth-token', authMode: 'oauth' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer oauth-token');
    });

    it('应包含 anthropic-version 头', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ compat: { apiVersion: '2023-06-01' } }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });
  });

  describe('消息格式转换', () => {
    it('system 消息应被提取到 body.system', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'hi' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.system).toBe('You are helpful.');
      expect(body.messages.filter((m: { role: string }) => m.role === 'system')).toHaveLength(0);
    });

    it('多条 system 消息应合并', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'system', content: 'Rule 1.' },
          { role: 'system', content: 'Rule 2.' },
          { role: 'user', content: 'hi' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.system).toContain('Rule 1.');
      expect(body.system).toContain('Rule 2.');
    });

    it('tool 消息应转换为 user role + tool_result content block', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: 'let me check',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"BJ"}' } }],
          } as never,
          { role: 'tool', content: 'sunny', tool_call_id: 'call_1' } as never,
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      // tool 消息应被转换为 user role
      const toolResultMsg = body.messages.find(
        (m: { content: Array<{ type: string }> | string }) =>
          Array.isArray(m.content) && m.content.some((c: { type: string }) => c.type === 'tool_result'),
      );
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg.role).toBe('user');
      const toolResultBlock = toolResultMsg.content.find((c: { type: string }) => c.type === 'tool_result');
      expect(toolResultBlock.tool_use_id).toBe('call_1');
      expect(toolResultBlock.content).toBe('sunny');
    });

    it('assistant 的 tool_calls 应转换为 tool_use content blocks', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: 'let me check',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"BJ"}' } }],
          } as never,
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      const assistantMsg = body.messages.find((m: { role: string }) => m.role === 'assistant');
      const toolUseBlock = assistantMsg.content.find((c: { type: string }) => c.type === 'tool_use');
      expect(toolUseBlock).toBeDefined();
      expect(toolUseBlock.id).toBe('call_1');
      expect(toolUseBlock.name).toBe('get_weather');
      expect(toolUseBlock.input).toEqual({ city: 'BJ' });
    });
  });

  describe('思考级别映射（budget tokens）', () => {
    it('high 级别应设置 thinking_budget_tokens 为 maxTokens 的 60%', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          maxTokens: 1000,
          thinkingLevel: 'high',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.thinking).toBeDefined();
      expect(body.thinking.type).toBe('enabled');
      expect(body.thinking.thinking_budget_tokens).toBe(600);
    });

    it('medium 级别应设置 thinking_budget_tokens 为 maxTokens 的 40%', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          maxTokens: 1000,
          thinkingLevel: 'medium',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.thinking.thinking_budget_tokens).toBe(400);
    });

    it('minimal 级别应设置 thinking_budget_tokens 为 maxTokens 的 15%', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          maxTokens: 1000,
          thinkingLevel: 'minimal',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.thinking.thinking_budget_tokens).toBe(150);
    });

    it('max 级别应设置 thinking_budget_tokens 为 maxTokens 的 80%', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          maxTokens: 1000,
          thinkingLevel: 'max',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.thinking.thinking_budget_tokens).toBe(800);
    });

    it('off 级别不设置 thinking', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          thinkingLevel: 'off',
          compat: { supportsReasoning: true },
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.thinking).toBeUndefined();
    });
  });

  describe('流式响应解析', () => {
    it('应解析 content_block_delta 的 text', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":" world"}}\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.chunks).toEqual(['Hello', ' world']);
      expect(result.content).toBe('Hello world');
    });

    it('应解析 thinking_delta', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"type":"content_block_start","content_block":{"type":"thinking","thinking":"initial"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":" more"}}\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.thinking).toContain('initial');
      expect(cbs.thinking).toContain(' more');
      expect(result.reasoningContent).toContain('initial');
      expect(result.reasoningContent).toContain(' more');
    });

    it('应解析 tool_use content block', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"call_1","name":"get_weather"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"\\"BJ\\"}"}}\n\n',
        'data: {"type":"content_block_stop"}\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.toolCalls).toHaveLength(1);
      expect(cbs.toolCalls[0].id).toBe('call_1');
      expect(cbs.toolCalls[0].function.name).toBe('get_weather');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.arguments).toBe('{"city":"BJ"}');
    });
  });
});

// ===================== Google Generative AI 适配器测试 =====================

describe('GoogleGenerativeAIAdapter', () => {
  let adapter: GoogleGenerativeAIAdapter;

  beforeEach(() => {
    adapter = new GoogleGenerativeAIAdapter();
    global.fetch = vi.fn();
  });

  it('apiType 应为 google-generative-ai', () => {
    expect(adapter.apiType).toBe('google-generative-ai');
  });

  describe('端点格式', () => {
    it('应包含 :streamGenerateContent 和 ?key= 参数', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
          apiKey: 'google-key',
          modelId: 'gemini-pro',
        }),
        [{ role: 'user', content: 'hi' }],
      );
      const url = calls[0].url;
      expect(url).toContain(':streamGenerateContent');
      expect(url).toContain('models/gemini-pro:streamGenerateContent');
      expect(url).toContain('?key=google-key');
      expect(url).toContain('alt=sse');
    });

    it('无 apiKey 时不附加 ?key=', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
          apiKey: '',
          modelId: 'gemini-pro',
        }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).not.toContain('?key=');
    });

    it('已有 :streamGenerateContent 时不重复追加', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({
          apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
          apiKey: 'k',
          modelId: 'gemini-pro',
        }),
        [{ role: 'user', content: 'hi' }],
      );
      // 不应出现两次 models/gemini-pro:streamGenerateContent
      const url = calls[0].url;
      const count = (url.match(/streamGenerateContent/g) || []).length;
      expect(count).toBe(1);
    });
  });

  describe('消息格式转换', () => {
    it('assistant 角色应映射为 model', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'bye' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[1].role).toBe('model');
      expect(body.contents[2].role).toBe('user');
    });

    it('system 消息应提取到 systemInstruction', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'hi' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe('You are helpful.');
      expect(body.contents.filter((c: { role: string }) => c.role === 'system')).toHaveLength(0);
    });

    it('tool 消息应转换为 functionResponse', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: 'checking',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"BJ"}' } }],
          } as never,
          { role: 'tool', content: '{"temp":25}', tool_call_id: 'call_1', name: 'get_weather' } as never,
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      const toolRespMsg = body.contents.find(
        (c: { parts: Array<{ functionResponse?: unknown }> }) =>
          c.parts.some((p: { functionResponse?: unknown }) => p.functionResponse),
      );
      expect(toolRespMsg).toBeDefined();
      expect(toolRespMsg.role).toBe('user');
      const fr = toolRespMsg.parts.find((p: { functionResponse?: { name: string } }) => p.functionResponse);
      expect(fr.functionResponse.name).toBe('get_weather');
      expect(fr.functionResponse.response).toEqual({ temp: 25 });
    });

    it('assistant 的 tool_calls 应转换为 functionCall', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: 'checking',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"BJ"}' } }],
          } as never,
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      const assistantContent = body.contents.find((c: { role: string }) => c.role === 'model');
      const fc = assistantContent.parts.find((p: { functionCall?: unknown }) => p.functionCall);
      expect(fc).toBeDefined();
      expect(fc.functionCall.name).toBe('get_weather');
      expect(fc.functionCall.args).toEqual({ city: 'BJ' });
    });
  });

  describe('流式响应解析', () => {
    it('应解析 candidates 中的 text', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.chunks).toEqual(['Hello', ' world']);
      expect(result.content).toBe('Hello world');
    });

    it('应解析 functionCall', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_weather","args":{"city":"BJ"}}}]}}]}\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.toolCalls).toHaveLength(1);
      expect(cbs.toolCalls[0].function.name).toBe('get_weather');
      expect(result.toolCalls).toHaveLength(1);
    });

    it('应解析 usageMetadata', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
      expect(result.usage?.totalTokens).toBe(15);
    });
  });
});

// ===================== OpenAI Completions 适配器测试 =====================

describe('OpenAICompletionsAdapter', () => {
  let adapter: OpenAICompletionsAdapter;

  beforeEach(() => {
    adapter = new OpenAICompletionsAdapter();
    global.fetch = vi.fn();
  });

  it('apiType 应为 openai-completions', () => {
    expect(adapter.apiType).toBe('openai-completions');
  });

  describe('端点补全', () => {
    it('缺少 /completions 时应自动追加', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiEndpoint: 'https://api.example.com/v1' }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).toBe('https://api.example.com/v1/completions');
    });

    it('已有 /completions 时不重复追加', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiEndpoint: 'https://api.example.com/v1/completions' }),
        [{ role: 'user', content: 'hi' }],
      );
      expect(calls[0].url).toBe('https://api.example.com/v1/completions');
    });
  });

  describe('消息转 prompt', () => {
    it('应将消息列表转换为 prompt 字符串', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.prompt).toContain('System: Be helpful.');
      expect(body.prompt).toContain('User: hi');
      expect(body.prompt).toContain('Assistant: hello');
      expect(body.prompt).toContain('Assistant:');
      // 不应包含 messages 字段
      expect(body.messages).toBeUndefined();
    });

    it('数组形式 content 应被拼接', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig(),
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'line1' },
              { type: 'text', text: 'line2' },
            ],
          },
        ],
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.prompt).toContain('line1');
      expect(body.prompt).toContain('line2');
    });
  });

  describe('不支持 tool calling', () => {
    it('传入 tools 应被忽略且不报错', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      const tools = [{
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object' as const, properties: {} },
        },
      }];
      await adapter.call(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        tools,
      );
      const body = JSON.parse(calls[0].opts.body as string);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
    });
  });

  describe('认证头', () => {
    it('api-key 模式应设置 Bearer Authorization', async () => {
      const { calls } = mockFetchOnce(createSSEResponse(['data: [DONE]\n\n']));
      await adapter.call(
        baseConfig({ apiKey: 'comp-key', authMode: 'api-key' }),
        [{ role: 'user', content: 'hi' }],
      );
      const headers = calls[0].opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer comp-key');
    });
  });

  describe('流式响应解析', () => {
    it('应解析 choices[0].text', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"choices":[{"text":"Hello"}]}\n\n',
        'data: {"choices":[{"text":" world"}]}\n\n',
        'data: [DONE]\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(cbs.chunks).toEqual(['Hello', ' world']);
      expect(result.content).toBe('Hello world');
    });

    it('应解析 usage', async () => {
      mockFetchOnce(createSSEResponse([
        'data: {"choices":[{"text":"hi"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ]));
      const cbs = captureCallbacks();
      const result = await adapter.callStream(
        baseConfig(),
        [{ role: 'user', content: 'hi' }],
        cbs,
      );
      expect(result.usage).toBeDefined();
      expect(result.usage?.totalTokens).toBe(15);
    });
  });
});
