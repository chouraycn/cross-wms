import { describe, it, expect } from 'vitest';
import * as deepseekAdapter from '../adapters/deepseek';
import * as alibabaAdapter from '../adapters/alibaba';
import * as kimiAdapter from '../adapters/kimi';
import * as stepfunAdapter from '../adapters/stepfun';
import * as doubaoAdapter from '../adapters/doubao';
import * as yiAdapter from '../adapters/yi';
import * as baichuanAdapter from '../adapters/baichuan';
import * as minimaxAdapter from '../adapters/minimax';

describe('Provider 适配器测试', () => {
  describe('DeepSeek 适配器', () => {
    it('应该正确转换普通请求', () => {
      const baseRequest = {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: '你好' }],
        temperature: 0.7,
      };

      const result = deepseekAdapter.transformRequest(baseRequest);

      expect(result.model).toBe('deepseek-chat');
      expect(result.messages).toHaveLength(1);
      expect(result.temperature).toBe(0.7);
      expect(result.enable_reasoning).toBeUndefined();
    });

    it('应该正确处理推理模式请求', () => {
      const baseRequest = {
        model: 'deepseek-reasoner',
        messages: [{ role: 'user', content: '请解释' }],
      };

      const result = deepseekAdapter.transformRequest(baseRequest, { enableReasoning: true });

      expect(result.enable_reasoning).toBe(true);
    });

    it('应该正确解析响应', () => {
      const response: deepseekAdapter.DeepSeekResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '你好！有什么可以帮你？' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      const result = deepseekAdapter.transformResponse(response);

      expect(result.content).toBe('你好！有什么可以帮你？');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(20);
    });

    it('应该正确解析包含推理内容的响应', () => {
      const response: deepseekAdapter.DeepSeekResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'deepseek-reasoner',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '答案',
              reasoning_content: '思考过程...',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          reasoning_tokens: 15,
        },
      };

      const result = deepseekAdapter.transformResponse(response);

      expect(result.content).toBe('答案');
      expect(result.reasoning).toBe('思考过程...');
      expect(result.usage.reasoningTokens).toBe(15);
    });

    it('应该正确检测推理模型', () => {
      expect(deepseekAdapter.isReasoningModel('deepseek-reasoner')).toBe(true);
      expect(deepseekAdapter.isReasoningModel('deepseek-chat')).toBe(false);
    });
  });

  describe('Alibaba (Qwen) 适配器', () => {
    it('应该正确转换普通请求', () => {
      const baseRequest = {
        model: 'qwen-turbo',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = alibabaAdapter.transformRequest(baseRequest);

      expect(result.model).toBe('qwen-turbo');
      expect(result.enable_search).toBeUndefined();
    });

    it('应该正确处理搜索增强请求', () => {
      const baseRequest = {
        model: 'qwen-max',
        messages: [{ role: 'user', content: '最新新闻' }],
      };

      const result = alibabaAdapter.transformRequest(baseRequest, {
        enableSearch: true,
        searchMaxResults: 5,
      });

      expect(result.enable_search).toBe(true);
      expect(result.search_max_results).toBe(5);
    });

    it('应该正确设置流式输出增量模式', () => {
      const baseRequest = {
        model: 'qwen-turbo',
        messages: [{ role: 'user', content: '你好' }],
        stream: true,
      };

      const result = alibabaAdapter.transformRequest(baseRequest);

      expect(result.incremental_output).toBe(true);
    });

    it('应该正确检测搜索增强模型', () => {
      expect(alibabaAdapter.shouldEnableSearch('qwen-max')).toBe(true);
      expect(alibabaAdapter.shouldEnableSearch('qwen-plus')).toBe(true);
      expect(alibabaAdapter.shouldEnableSearch('qwen-turbo')).toBe(false);
    });
  });

  describe('Kimi (Moonshot) 适配器', () => {
    it('应该正确转换普通请求', () => {
      const baseRequest = {
        model: 'moonshot-v1-8k',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = kimiAdapter.transformRequest(baseRequest);

      expect(result.model).toBe('moonshot-v1-8k');
      expect(result.file_ids).toBeUndefined();
    });

    it('应该正确处理文件上传请求', () => {
      const baseRequest = {
        model: 'moonshot-v1-8k',
        messages: [{ role: 'user', content: '分析文件' }],
      };

      const result = kimiAdapter.transformRequest(baseRequest, {
        fileIds: ['file-123', 'file-456'],
      });

      expect(result.file_ids).toEqual(['file-123', 'file-456']);
    });

    it('应该正确解析响应（包含 usage）', () => {
      const response: kimiAdapter.KimiResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'moonshot-v1-8k',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '回复内容' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const result = kimiAdapter.transformResponse(response);

      expect(result.content).toBe('回复内容');
      expect(result.usage?.promptTokens).toBe(100);
    });

    it('应该正确解析响应（不包含 usage）', () => {
      const response: kimiAdapter.KimiResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'moonshot-v1-8k',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '回复内容' },
            finish_reason: 'stop',
          },
        ],
      };

      const result = kimiAdapter.transformResponse(response);

      expect(result.content).toBe('回复内容');
      expect(result.usage).toBeUndefined();
    });
  });

  describe('StepFun 适配器', () => {
    it('应该正确转换请求', () => {
      const baseRequest = {
        model: 'step-1-8k',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = stepfunAdapter.transformRequest(baseRequest);

      expect(result.model).toBe('step-1-8k');
    });

    it('应该正确处理特殊参数', () => {
      const baseRequest = {
        model: 'step-1-8k',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = stepfunAdapter.transformRequest(baseRequest, {
        topK: 50,
        repetitionPenalty: 1.2,
      });

      expect(result.top_k).toBe(50);
      expect(result.repetition_penalty).toBe(1.2);
    });

    it('应该正确检测多模态模型', () => {
      expect(stepfunAdapter.isVisionModel('step-1v-8k')).toBe(true);
      expect(stepfunAdapter.isVisionModel('step-1-8k')).toBe(false);
    });
  });

  describe('Doubao 适配器', () => {
    it('应该正确转换请求', () => {
      const baseRequest = {
        model: 'doubao-pro-4k',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = doubaoAdapter.transformRequest(baseRequest);

      expect(result.model).toBe('doubao-pro-4k');
    });

    it('应该正确构建认证 header', () => {
      const headers = doubaoAdapter.buildAuthHeader('test-api-key');

      expect(headers['Authorization']).toBe('Bearer test-api-key');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('应该正确构建 API URL（包含 endpoint ID）', () => {
      const url = doubaoAdapter.buildApiUrl(
        'https://ark.cn-beijing.volces.com/api/v3',
        'endpoint-123',
      );

      expect(url).toContain('endpoint_id=endpoint-123');
    });
  });

  describe('Yi 适配器', () => {
    it('应该正确转换请求', () => {
      const baseRequest = {
        model: 'yi-large',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = yiAdapter.transformRequest(baseRequest);

      expect(result.model).toBe('yi-large');
    });

    it('应该正确处理特殊参数', () => {
      const baseRequest = {
        model: 'yi-large',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = yiAdapter.transformRequest(baseRequest, {
        topP: 0.9,
        frequencyPenalty: 0.5,
      });

      expect(result.top_p).toBe(0.9);
      expect(result.frequency_penalty).toBe(0.5);
    });
  });

  describe('Baichuan 适配器', () => {
    it('应该正确转换请求', () => {
      const baseRequest = {
        model: 'Baichuan4',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = baichuanAdapter.transformRequest(baseRequest);

      expect(result.model).toBe('Baichuan4');
    });

    it('应该正确处理搜索增强', () => {
      const baseRequest = {
        model: 'Baichuan3-Turbo',
        messages: [{ role: 'user', content: '搜索' }],
      };

      const result = baichuanAdapter.transformRequest(baseRequest, {
        withSearchEnhance: true,
      });

      expect(result.with_search_enhance).toBe(true);
    });

    it('应该正确构建认证 header', () => {
      const headers = baichuanAdapter.buildAuthHeader('test-api-key');

      expect(headers['Authorization']).toBe('Bearer test-api-key');
    });
  });

  describe('MiniMax 适配器', () => {
    it('应该正确转换请求（包含 group_id）', () => {
      const baseRequest = {
        model: 'abab6.5-chat',
        messages: [{ role: 'user', content: '你好' }],
      };

      const result = minimaxAdapter.transformRequest(baseRequest, {
        groupId: 'group-123',
      });

      expect(result.model).toBe('abab6.5-chat');
      expect(result.group_id).toBe('group-123');
    });

    it('应该正确解析响应（包含工具调用）', () => {
      const response: minimaxAdapter.MiniMaxResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'abab6.5-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call-123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "北京"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        base_resp: {
          status_code: 0,
          status_msg: 'success',
        },
      };

      const result = minimaxAdapter.transformResponse(response);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].name).toBe('get_weather');
    });

    it('应该正确处理错误响应', () => {
      const response: minimaxAdapter.MiniMaxResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'abab6.5-chat',
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        base_resp: {
          status_code: 1001,
          status_msg: 'Invalid request',
        },
      };

      expect(() => minimaxAdapter.transformResponse(response)).toThrow('MiniMax API 错误');
    });
  });
});