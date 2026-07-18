/**
 * Provider 抽象层测试 — 覆盖所有 12 个 Provider 的注册、元数据、请求构造、
 * 流式 chunk 解析、usage 解析、finish_reason 映射。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Model } from '../types.js';
import type { ProviderRequestContext } from '../providers/types.js';
import {
  registerBuiltinProviders,
  clearProviderRegistry,
  getProvider,
  listProviders,
  listProviderNames,
  listProvidersByRegion,
  listCnProviders,
  openaiProvider,
  anthropicProvider,
  googleProvider,
  azureProvider,
  bedrockProvider,
  ollamaProvider,
  deepseekProvider,
  moonshotProvider,
  qwenProvider,
  zhipuProvider,
  minimaxProvider,
  baichuanProvider,
  ernieProvider,
  sparkProvider,
  yiProvider,
  parseDeepSeekStreamChunk,
  buildMinimaxRequestBody,
  parseAzureDeploymentMap,
  resolveAzureDeployment,
  buildAzureEndpoint,
  buildGoogleEndpoint,
  buildBedrockEndpoint,
  buildOllamaEmbeddingBody,
  splitAnthropicSystemMessages,
} from '../index.js';

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'test-model',
    name: 'Test',
    provider: 'test',
    api: 'openai-completions',
    contextWindow: 128_000,
    cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0 },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ProviderRequestContext> = {}): ProviderRequestContext {
  return {
    apiKey: 'test-key',
    model: makeModel(),
    options: {
      model: 'test/test-model',
      messages: [{ role: 'user', content: 'hello' }],
    },
    ...overrides,
  };
}

describe('Provider 注册表', () => {
  beforeEach(() => {
    clearProviderRegistry();
  });

  it('registerBuiltinProviders 注册全部 15 个 Provider', () => {
    registerBuiltinProviders();
    const names = listProviderNames();
    expect(names).toHaveLength(15);
    expect(names).toContain('openai');
    expect(names).toContain('anthropic');
    expect(names).toContain('google');
    expect(names).toContain('azure');
    expect(names).toContain('bedrock');
    expect(names).toContain('ollama');
    expect(names).toContain('deepseek');
    expect(names).toContain('moonshot');
    expect(names).toContain('qwen');
    expect(names).toContain('zhipu');
    expect(names).toContain('minimax');
    expect(names).toContain('baichuan');
    expect(names).toContain('ernie');
    expect(names).toContain('spark');
    expect(names).toContain('yi');
  });

  it('getProvider 返回已注册的 Provider，未注册返回 undefined', () => {
    registerBuiltinProviders();
    expect(getProvider('openai')?.info.name).toBe('openai');
    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('listProvidersByRegion 按 region 过滤', () => {
    registerBuiltinProviders();
    const cn = listProvidersByRegion('cn');
    const cnNames = cn.map((p) => p.name);
    expect(cnNames).toEqual(expect.arrayContaining(['deepseek', 'moonshot', 'qwen', 'zhipu', 'minimax', 'baichuan', 'ernie', 'spark', 'yi']));
    expect(cnNames).not.toContain('openai');
  });

  it('listCnProviders 仅返回国内 Provider', () => {
    registerBuiltinProviders();
    const cn = listCnProviders();
    expect(cn).toHaveLength(9);
    for (const p of cn) expect(p.region).toBe('cn');
  });

  it('listProviders 返回完整元数据列表', () => {
    registerBuiltinProviders();
    const all = listProviders();
    expect(all).toHaveLength(15);
    for (const p of all) {
      expect(p.name).toBeTruthy();
      expect(p.displayName).toBeTruthy();
      expect(p.envKeys.length).toBeGreaterThan(0);
      // Azure 的 baseUrl 为空是合法的（端点客户特定）
      if (p.name !== 'azure') {
        expect(p.baseUrl).toBeTruthy();
      }
      expect(p.supportedApis.length).toBeGreaterThan(0);
    }
  });
});

describe('OpenAI Provider', () => {
  it('Chat Completions 请求体包含 model 和 messages', () => {
    const ctx = makeCtx({ model: makeModel({ api: 'openai-completions', id: 'gpt-4o' }) });
    const body = openaiProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('Responses API 请求体使用 input 字段与 reasoning effort', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'openai-responses', id: 'o1', reasoning: true }),
      options: {
        model: 'openai/o1',
        messages: [{ role: 'user', content: 'think' }],
        thinkingLevel: 'high',
      },
    });
    const body = openaiProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.input).toBeDefined();
    expect(body.reasoning).toEqual({ effort: 'high' });
  });

  it('请求头包含 Bearer 鉴权', () => {
    const ctx = makeCtx({ apiKey: 'sk-test' });
    const headers = openaiProvider.buildHeaders(ctx);
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('解析 Chat Completions 流式 chunk 文本与 usage', () => {
    const events = openaiProvider.parseStreamChunk({
      choices: [{ delta: { content: 'hi' }, finish_reason: null }],
      usage: { prompt_tokens: 5, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 2 } },
    });
    expect(events).toContainEqual({ type: 'text', content: 'hi' });
    const usageEvt = events.find((e) => e.type === 'usage');
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.input).toBe(5);
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.cacheRead).toBe(2);
  });

  it('解析 Responses API 流式 delta', () => {
    const events = openaiProvider.parseStreamChunk({
      type: 'response.output_text.delta',
      delta: 'world',
    });
    expect(events).toContainEqual({ type: 'text', content: 'world' });
  });

  it('mapFinishReason 正确映射 OpenAI 停止原因', () => {
    expect(openaiProvider.mapFinishReason('stop')).toBe('stop');
    expect(openaiProvider.mapFinishReason('length')).toBe('length');
    expect(openaiProvider.mapFinishReason('tool_calls')).toBe('tool_call');
    expect(openaiProvider.mapFinishReason('content_filter')).toBe('error');
    expect(openaiProvider.mapFinishReason('whatever')).toBe('unknown');
  });
});

describe('Anthropic Provider', () => {
  it('请求头使用 x-api-key + anthropic-version', () => {
    const ctx = makeCtx({ apiKey: 'ant-key' });
    const headers = anthropicProvider.buildHeaders(ctx);
    expect(headers['x-api-key']).toBe('ant-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('请求体将 system 抽到顶层并设置 max_tokens', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'anthropic-messages', id: 'claude-3-5-sonnet', maxOutputTokens: 4096 }),
      options: {
        model: 'anthropic/claude',
        messages: [
          { role: 'system', content: 'be nice' },
          { role: 'user', content: 'hi' },
        ],
      },
    });
    const body = anthropicProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.system).toBe('be nice');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.max_tokens).toBe(4096);
  });

  it('thinking 模式根据 reasoning 模型启用', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'anthropic-messages', reasoning: true }),
      options: {
        model: 'anthropic/claude',
        messages: [{ role: 'user', content: 'think' }],
        thinkingLevel: 'high',
      },
    });
    const body = anthropicProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
  });

  it('非 reasoning 模型即使指定 thinkingLevel 也不启用 thinking', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'anthropic-messages', reasoning: false }),
      options: {
        model: 'anthropic/claude',
        messages: [{ role: 'user', content: 'hi' }],
        thinkingLevel: 'high',
      },
    });
    const body = anthropicProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.thinking).toBeUndefined();
  });

  it('解析流式 message_start 与 content_block_delta', () => {
    const startEvents = anthropicProvider.parseStreamChunk({
      type: 'message_start',
      message: { usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 5 } },
    });
    const usageEvt = startEvents.find((e) => e.type === 'usage');
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.input).toBe(10);

    const deltaEvents = anthropicProvider.parseStreamChunk({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'foo' },
    });
    expect(deltaEvents).toContainEqual({ type: 'text', content: 'foo' });
  });

  it('splitAnthropicSystemMessages 抽出 system 并合并 tool 到 user', () => {
    const { system, messages } = splitAnthropicSystemMessages([
      { role: 'system', content: 's1' },
      { role: 'user', content: 'u1' },
      { role: 'system', content: 's2' },
      { role: 'tool', content: 't1' },
    ]);
    expect(system).toBe('s1\n\ns2');
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('user');
  });

  it('mapFinishReason 映射 Anthropic stop_reason', () => {
    expect(anthropicProvider.mapFinishReason('end_turn')).toBe('stop');
    expect(anthropicProvider.mapFinishReason('max_tokens')).toBe('length');
    expect(anthropicProvider.mapFinishReason('tool_use')).toBe('tool_call');
  });
});

describe('Google Gemini Provider', () => {
  it('请求头不含 Authorization（key 在 URL 中）', () => {
    const ctx = makeCtx({ apiKey: 'gem-key' });
    const headers = googleProvider.buildHeaders(ctx);
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('buildGoogleEndpoint 包含 model + key', () => {
    const ctx = makeCtx({
      apiKey: 'gem-key',
      model: makeModel({ api: 'google-gemini', id: 'gemini-1.5-pro' }),
    });
    const url = buildGoogleEndpoint(ctx, true);
    expect(url).toContain('models/gemini-1.5-pro:streamGenerateContent');
    expect(url).toContain('key=gem-key');
  });

  it('请求体将 system 移到 systemInstruction，assistant 转为 model', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'google-gemini' }),
      options: {
        model: 'google/gemini',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'u' },
          { role: 'assistant', content: 'a' },
        ],
      },
    });
    const body = googleProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    const contents = body.contents as Array<{ role: string }>;
    expect(contents[0].role).toBe('user');
    expect(contents[1].role).toBe('model');
  });

  it('解析 Gemini 流式 chunk 数组', () => {
    const events = googleProvider.parseStreamChunk([
      {
        candidates: [{ content: { parts: [{ text: 'hi' }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, cachedContentTokenCount: 0 },
      },
    ]);
    expect(events).toContainEqual({ type: 'text', content: 'hi' });
    const usageEvt = events.find((e) => e.type === 'usage');
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.input).toBe(3);
  });

  it('mapFinishReason 映射 Gemini finishReason', () => {
    expect(googleProvider.mapFinishReason('STOP')).toBe('stop');
    expect(googleProvider.mapFinishReason('MAX_TOKENS')).toBe('length');
    expect(googleProvider.mapFinishReason('SAFETY')).toBe('error');
  });
});

describe('Azure Provider', () => {
  it('parseAzureDeploymentMap 解析 model=deployment 列表', () => {
    const map = parseAzureDeploymentMap('gpt-4=prod-gpt4, gpt-4o=prod-gpt4o, broken');
    expect(map.get('gpt-4')).toBe('prod-gpt4');
    expect(map.get('gpt-4o')).toBe('prod-gpt4o');
    expect(map.get('broken')).toBeUndefined();
  });

  it('resolveAzureDeployment 缺失映射时回退为模型 ID', () => {
    expect(resolveAzureDeployment({ modelId: 'unknown' })).toBe('unknown');
    expect(
      resolveAzureDeployment({ modelId: 'gpt-4', deploymentMap: 'gpt-4=prod' }),
    ).toBe('prod');
  });

  it('buildAzureEndpoint 拼接 endpoint + deployment + api-version', () => {
    const url = buildAzureEndpoint({
      endpoint: 'https://example.openai.azure.com/',
      deployment: 'prod-gpt4',
    });
    expect(url).toBe(
      'https://example.openai.azure.com/openai/deployments/prod-gpt4/chat/completions?api-version=2024-10-21',
    );
  });

  it('请求头使用 api-key 而非 Bearer', () => {
    const ctx = makeCtx({ apiKey: 'azure-key' });
    const headers = azureProvider.buildHeaders(ctx);
    expect(headers['api-key']).toBe('azure-key');
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('Bedrock Provider', () => {
  it('buildBedrockEndpoint 拼接 modelId + action', () => {
    const invoke = buildBedrockEndpoint({ modelId: 'anthropic.claude-3', region: 'us-west-2' });
    expect(invoke).toContain('bedrock-runtime.us-west-2.amazonaws.com');
    expect(invoke).toContain('/model/anthropic.claude-3/invoke');
    const stream = buildBedrockEndpoint({ modelId: 'meta.llama3', stream: true });
    expect(stream).toContain('invoke-with-response-stream');
  });

  it('Anthropic 模型请求体使用 anthropic_version + system 顶层', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'aws-bedrock', id: 'anthropic.claude-3-5-sonnet', provider: 'bedrock' }),
      options: {
        model: 'bedrock/claude',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'u' },
        ],
        maxTokens: 1024,
      },
    });
    const body = bedrockProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.anthropic_version).toBe('bedrock-2023-05-31');
    expect(body.system).toBe('sys');
    expect(body.max_tokens).toBe(1024);
  });

  it('Llama 模型请求体使用 prompt + max_gen_len', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'aws-bedrock', id: 'meta.llama3-1-70b', provider: 'bedrock' }),
      options: {
        model: 'bedrock/llama',
        messages: [{ role: 'user', content: 'hi' }],
      },
    });
    const body = bedrockProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.prompt).toContain('hi');
    expect(body.max_gen_len).toBeDefined();
  });

  it('解析 Bedrock 流式 chunk（payload 内含 delta.text）', () => {
    const events = bedrockProvider.parseStreamChunk({
      payload: { delta: { text: 'hi' } },
    });
    expect(events).toContainEqual({ type: 'text', content: 'hi' });
  });
});

describe('Ollama Provider', () => {
  it('请求头不含鉴权字段', () => {
    const ctx = makeCtx({ apiKey: '' });
    const headers = ollamaProvider.buildHeaders(ctx);
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('请求体使用 messages 数组 + stream=true', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'ollama', id: 'llama3.1', provider: 'ollama' }),
    });
    const body = ollamaProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.model).toBe('llama3.1');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('buildOllamaEmbeddingBody 构造嵌入请求', () => {
    const body = buildOllamaEmbeddingBody('llama3.1', 'embed me');
    expect(body).toEqual({ model: 'llama3.1', prompt: 'embed me' });
  });

  it('解析流式 message.content 与 done usage', () => {
    const events = ollamaProvider.parseStreamChunk({
      message: { content: 'hi' },
      done: false,
    });
    expect(events).toContainEqual({ type: 'text', content: 'hi' });

    const doneEvents = ollamaProvider.parseStreamChunk({
      done: true,
      prompt_eval_count: 4,
      eval_count: 2,
    });
    const usageEvt = doneEvents.find((e) => e.type === 'usage');
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.input).toBe(4);
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.output).toBe(2);
  });
});

describe('国内 OpenAI 兼容 Provider', () => {
  it('DeepSeek 请求体使用 OpenAI Chat 格式', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'deepseek-chat', id: 'deepseek-chat', provider: 'deepseek' }),
    });
    const body = deepseekProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(deepseekProvider.info.region).toBe('cn');
  });

  it('Moonshot 请求头使用 Bearer 鉴权', () => {
    const ctx = makeCtx({
      apiKey: 'moon-key',
      model: makeModel({ api: 'moonshot-chat', provider: 'moonshot' }),
    });
    const headers = moonshotProvider.buildHeaders(ctx);
    expect(headers.Authorization).toBe('Bearer moon-key');
    expect(moonshotProvider.info.envKeys).toContain('KIMI_API_KEY');
  });

  it('Qwen baseUrl 指向 dashscope 兼容模式', () => {
    expect(qwenProvider.info.baseUrl).toContain('dashscope.aliyuncs.com');
    expect(qwenProvider.info.envKeys).toContain('DASHSCOPE_API_KEY');
  });

  it('Zhipu 默认模型包含 GLM-4-Plus', () => {
    const glm4Plus = zhipuProvider.info.defaultModels?.find((m) => m.id === 'glm-4-plus');
    expect(glm4Plus).toBeDefined();
    expect(glm4Plus?.cost.input).toBeGreaterThan(0);
  });

  it('MiniMax 请求体使用 OpenAI 兼容字段', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'minimax-chat', id: 'abab6.5s-chat', provider: 'minimax' }),
      options: {
        model: 'minimax/abab',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.7,
        maxTokens: 512,
      },
    });
    const body = minimaxProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.model).toBe('abab6.5s-chat');
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(512);
  });

  it('Baichuan 解析 OpenAI 兼容 chunk', () => {
    const events = baichuanProvider.parseStreamChunk({
      choices: [{ delta: { content: 'bc' } }],
    });
    expect(events).toContainEqual({ type: 'text', content: 'bc' });
  });

  it('MiniMax mapFinishReason 映射 function_call', () => {
    expect(minimaxProvider.mapFinishReason('function_call')).toBe('tool_call');
  });
});

describe('百度文心 ERNIE Provider', () => {
  it('元数据：region=cn，baseUrl 指向 qianfan，envKeys 含 ERNIE_API_KEY/BAIDU_API_KEY/QIANFAN_API_KEY', () => {
    expect(ernieProvider.info.name).toBe('ernie');
    expect(ernieProvider.info.region).toBe('cn');
    expect(ernieProvider.info.baseUrl).toBe('https://qianfan.baidubce.com/v2');
    expect(ernieProvider.info.envKeys).toContain('ERNIE_API_KEY');
    expect(ernieProvider.info.envKeys).toContain('BAIDU_API_KEY');
    expect(ernieProvider.info.envKeys).toContain('QIANFAN_API_KEY');
    expect(ernieProvider.info.supportedApis).toContain('ernie-chat');
  });

  it('请求头使用 Bearer 鉴权', () => {
    const ctx = makeCtx({ apiKey: 'ernie-key' });
    const headers = ernieProvider.buildHeaders(ctx);
    expect(headers.Authorization).toBe('Bearer ernie-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('请求体包含 model/messages，且传递 user_id 合规字段', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'ernie-chat', id: 'ernie-4.0-8k-latest', provider: 'ernie' }),
      options: {
        model: 'ernie/ernie-4.0',
        messages: [{ role: 'user', content: 'hi' }],
        userId: 'user-001',
      },
    });
    const body = ernieProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.model).toBe('ernie-4.0-8k-latest');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.user_id).toBe('user-001');
  });

  it('未设置 userId 时不包含 user_id 字段', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'ernie-chat', provider: 'ernie' }),
    });
    const body = ernieProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.user_id).toBeUndefined();
  });

  it('解析流式 chunk：reasoning_content 为思考内容（先于正文 result）', () => {
    const events = ernieProvider.parseStreamChunk({
      result: 'hi',
      reasoning_content: '思考中',
    });
    expect(events[0]).toEqual({ type: 'thinking', content: '思考中' });
    expect(events[1]).toEqual({ type: 'text', content: 'hi' });
  });

  it('解析流式 chunk usage 字段', () => {
    const events = ernieProvider.parseStreamChunk({
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });
    const usageEvt = events.find((e) => e.type === 'usage');
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.input).toBe(5);
    expect(usageEvt && usageEvt.type === 'usage' && usageEvt.usage.output).toBe(2);
  });

  it('mapFinishReason 映射 sensitive（内容安全）为 error', () => {
    expect(ernieProvider.mapFinishReason('sensitive')).toBe('error');
    expect(ernieProvider.mapFinishReason('content_filter')).toBe('error');
    expect(ernieProvider.mapFinishReason('normal')).toBe('stop');
    expect(ernieProvider.mapFinishReason('function_call')).toBe('tool_call');
    expect(ernieProvider.mapFinishReason('length')).toBe('length');
  });
});

describe('讯飞星火 Spark Provider', () => {
  it('元数据：region=cn，baseUrl 指向 xf-yun.com，envKeys 含 SPARK_API_KEY/IFLYTEK_API_KEY/XINGHUO_API_KEY', () => {
    expect(sparkProvider.info.name).toBe('spark');
    expect(sparkProvider.info.region).toBe('cn');
    expect(sparkProvider.info.baseUrl).toContain('xf-yun.com');
    expect(sparkProvider.info.envKeys).toContain('SPARK_API_KEY');
    expect(sparkProvider.info.envKeys).toContain('IFLYTEK_API_KEY');
    expect(sparkProvider.info.envKeys).toContain('XINGHUO_API_KEY');
    expect(sparkProvider.info.supportedApis).toContain('spark-chat');
  });

  it('请求头使用 Bearer 鉴权', () => {
    const ctx = makeCtx({ apiKey: 'spark-key' });
    const headers = sparkProvider.buildHeaders(ctx);
    expect(headers.Authorization).toBe('Bearer spark-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('请求体传递 uid 合规字段（OpenAI 兼容）', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'spark-chat', id: '4.0Ultra', provider: 'spark' }),
      options: {
        model: 'spark/4.0Ultra',
        messages: [{ role: 'user', content: 'hi' }],
        userId: 'user-002',
      },
    });
    const body = sparkProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.model).toBe('4.0Ultra');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.uid).toBe('user-002');
  });

  it('未设置 userId 时不包含 uid 字段', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'spark-chat', provider: 'spark' }),
    });
    const body = sparkProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.uid).toBeUndefined();
  });
});

describe('零一万物 Yi Provider', () => {
  it('元数据：region=cn，baseUrl 指向 lingyiwanwu.com，envKeys 含 YI_API_KEY 和 LINGYIWANWU_API_KEY', () => {
    expect(yiProvider.info.name).toBe('yi');
    expect(yiProvider.info.region).toBe('cn');
    expect(yiProvider.info.baseUrl).toContain('lingyiwanwu.com');
    expect(yiProvider.info.envKeys).toContain('YI_API_KEY');
    expect(yiProvider.info.envKeys).toContain('LINGYIWANWU_API_KEY');
    expect(yiProvider.info.supportedApis).toContain('yi-chat');
  });

  it('请求头使用 Bearer 鉴权', () => {
    const ctx = makeCtx({ apiKey: 'yi-key' });
    const headers = yiProvider.buildHeaders(ctx);
    expect(headers.Authorization).toBe('Bearer yi-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('请求体使用 OpenAI 兼容格式', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'yi-chat', id: 'yi-lightning', provider: 'yi' }),
    });
    const body = yiProvider.buildRequestBody(ctx) as Record<string, unknown>;
    expect(body.model).toBe('yi-lightning');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('默认模型包含 yi-lightning', () => {
    const yiLightning = yiProvider.info.defaultModels?.find((m) => m.id === 'yi-lightning');
    expect(yiLightning).toBeDefined();
    expect(yiLightning?.cost.input).toBeGreaterThan(0);
  });
});

describe('DeepSeek R1 思考模式', () => {
  it('解析 delta.reasoning_content 生成 thinking 事件', () => {
    const events = parseDeepSeekStreamChunk({
      choices: [{ delta: { reasoning_content: '思考中' } }],
    });
    expect(events).toContainEqual({ type: 'thinking', content: '思考中' });
  });

  it('解析 delta.content 正文', () => {
    const events = parseDeepSeekStreamChunk({
      choices: [{ delta: { content: '正文' } }],
    });
    expect(events).toContainEqual({ type: 'text', content: '正文' });
  });

  it('思考内容事件先于正文事件', () => {
    const events = parseDeepSeekStreamChunk({
      choices: [{ delta: { reasoning_content: '先思考', content: '后正文' } }],
    });
    expect(events[0]).toEqual({ type: 'thinking', content: '先思考' });
    expect(events[1]).toEqual({ type: 'text', content: '后正文' });
  });

  it('解析 completion_tokens_details.reasoning_tokens 思考 token', () => {
    const events = parseDeepSeekStreamChunk({
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        completion_tokens_details: { reasoning_tokens: 3 },
      },
    });
    const usageEvents = events.filter((e) => e.type === 'usage');
    expect(usageEvents).toHaveLength(2);
    // 第一个 usage：标准 input/output
    const main = usageEvents[0];
    expect(main.type === 'usage' && main.usage.input).toBe(10);
    expect(main.type === 'usage' && main.usage.output).toBe(5);
    // 第二个 usage：思考 token（output 字段）
    const reasoning = usageEvents[1];
    expect(reasoning.type === 'usage' && reasoning.usage.output).toBe(3);
  });
});

describe('MiniMax 协议补全', () => {
  it('system 消息转换为 bot_setting 格式（含 bot_name 和 content）', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'minimax-chat', id: 'abab6.5s-chat', provider: 'minimax' }),
      options: {
        model: 'minimax/abab',
        messages: [
          { role: 'system', content: '你是一个 AI 助手' },
          { role: 'user', content: 'hi' },
        ],
      },
    });
    const body = buildMinimaxRequestBody(ctx) as Record<string, unknown>;
    expect(body.bot_setting).toBeDefined();
    const botSetting = body.bot_setting as Array<{ bot_name: string; content: string }>;
    expect(botSetting).toHaveLength(1);
    expect(botSetting[0].bot_name).toBeTruthy();
    expect(botSetting[0].content).toBe('你是一个 AI 助手');
    // system 消息不再出现在 messages 中
    const messages = body.messages as Array<{ role: string }>;
    expect(messages.find((m) => m.role === 'system')).toBeUndefined();
  });

  it('默认包含 beams=1 和 search_width=1', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'minimax-chat', provider: 'minimax' }),
    });
    const body = buildMinimaxRequestBody(ctx) as Record<string, unknown>;
    expect(body.beams).toBe(1);
    expect(body.search_width).toBe(1);
  });

  it('传递 user_id 字段用于合规审计', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'minimax-chat', provider: 'minimax' }),
      options: {
        model: 'minimax/abab',
        messages: [{ role: 'user', content: 'hi' }],
        userId: 'user-minimax',
      },
    });
    const body = buildMinimaxRequestBody(ctx) as Record<string, unknown>;
    expect(body.user_id).toBe('user-minimax');
  });

  it('当有工具时设置 tool_choice 为 auto', () => {
    const ctx = makeCtx({
      model: makeModel({ api: 'minimax-chat', provider: 'minimax' }),
      options: {
        model: 'minimax/abab',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [
          {
            name: 'search',
            description: '搜索',
            parameters: { type: 'object', properties: {} },
          },
        ],
      },
    });
    const body = buildMinimaxRequestBody(ctx) as Record<string, unknown>;
    expect(body.tool_choice).toBe('auto');
    expect(body.tools).toBeDefined();
  });
});
