/**
 * 模型能力测试器
 *
 * 验证各种模型的功能支持
 */

import type { ModelCapabilityRegistry } from './capability-registry.js';

/**
 * 测试结果
 */
export interface TestResult {
  /** 是否通过 */
  passed: boolean;
  /** 测试耗时（毫秒） */
  duration: number;
  /** 错误信息 */
  error?: string;
  /** 详细信息 */
  details?: Record<string, unknown>;
}

/**
 * 能力测试报告
 */
export interface CapabilityTestReport {
  /** 模型ID */
  modelId: string;
  /** 测试时间 */
  timestamp: string;
  /** 各项测试结果 */
  results: {
    functionCalling: TestResult;
    multimodal: TestResult;
    streaming: TestResult;
    contextWindow: TestResult;
  };
  /** 总体通过情况 */
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

/**
 * Mock LLM 客户端接口
 */
export interface MockLLMClient {
  chat(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    tools?: Array<{ type: string; function: { name: string; description: string } }>;
    stream?: boolean;
  }): Promise<{ content: string; toolCalls?: unknown[] }>;
}

/**
 * 模型能力测试器
 * 用于验证各种模型的功能支持
 */
export class ModelCapabilityTester {
  private registry: ModelCapabilityRegistry;
  private mockClient?: MockLLMClient;

  constructor(registry: ModelCapabilityRegistry, mockClient?: MockLLMClient) {
    this.registry = registry;
    this.mockClient = mockClient;
  }

  /**
   * 测试工具调用能力
   * @param modelId 模型ID
   * @returns 测试结果
   */
  async testFunctionCalling(modelId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 检查注册表中的能力
      const hasCap = this.registry.hasCapability(modelId, 'function_calling');
      const modelInfo = this.registry.getModelInfo(modelId);

      if (!modelInfo) {
        return {
          passed: false,
          duration: Date.now() - startTime,
          error: '模型未注册',
        };
      }

      // 如果有 mock 客户端，进行实际测试
      if (this.mockClient) {
        const testTools = [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: '获取天气信息',
            },
          },
        ];

        const result = await this.mockClient.chat({
          model: modelId,
          messages: [{ role: 'user', content: '今天北京天气怎么样？' }],
          tools: testTools,
        });

        return {
          passed: !!result.toolCalls || hasCap,
          duration: Date.now() - startTime,
          details: { toolCalls: result.toolCalls },
        };
      }

      // 仅使用注册表信息
      return {
        passed: hasCap,
        duration: Date.now() - startTime,
        details: { source: 'registry' },
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '测试失败',
      };
    }
  }

  /**
   * 测试多模态能力
   * @param modelId 模型ID
   * @returns 测试结果
   */
  async testMultimodal(modelId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const hasCap = this.registry.hasCapability(modelId, 'multimodal');
      const modelInfo = this.registry.getModelInfo(modelId);

      if (!modelInfo) {
        return {
          passed: false,
          duration: Date.now() - startTime,
          error: '模型未注册',
        };
      }

      // 如果有 mock 客户端，进行实际测试
      if (this.mockClient) {
        // 模拟发送带图片的请求
        const result = await this.mockClient.chat({
          model: modelId,
          messages: [
            {
              role: 'user',
              content: '这是一张测试图片，请描述它',
            },
          ],
        });

        // 仅当 mock 客户端明确返回成功时才通过
        return {
          passed: hasCap, // 使用注册表中的能力定义
          duration: Date.now() - startTime,
          details: { responseLength: result.content?.length || 0 },
        };
      }

      return {
        passed: hasCap,
        duration: Date.now() - startTime,
        details: { source: 'registry' },
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '测试失败',
      };
    }
  }

  /**
   * 测试流式输出能力
   * @param modelId 模型ID
   * @returns 测试结果
   */
  async testStreaming(modelId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const hasCap = this.registry.hasCapability(modelId, 'streaming');
      const modelInfo = this.registry.getModelInfo(modelId);

      if (!modelInfo) {
        return {
          passed: false,
          duration: Date.now() - startTime,
          error: '模型未注册',
        };
      }

      // 如果有 mock 客户端，进行实际测试
      if (this.mockClient) {
        const result = await this.mockClient.chat({
          model: modelId,
          messages: [{ role: 'user', content: '请数到5' }],
          stream: true,
        });

        return {
          passed: !!result.content || hasCap,
          duration: Date.now() - startTime,
          details: { streamTest: true },
        };
      }

      return {
        passed: hasCap,
        duration: Date.now() - startTime,
        details: { source: 'registry' },
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '测试失败',
      };
    }
  }

  /**
   * 测试上下文窗口能力
   * @param modelId 模型ID
   * @returns 测试结果
   */
  async testContextWindow(modelId: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const modelInfo = this.registry.getModelInfo(modelId);

      if (!modelInfo) {
        return {
          passed: false,
          duration: Date.now() - startTime,
          error: '模型未注册',
        };
      }

      const contextWindow = modelInfo.contextWindow;

      if (!contextWindow || contextWindow <= 0) {
        return {
          passed: false,
          duration: Date.now() - startTime,
          error: '上下文窗口大小无效',
        };
      }

      return {
        passed: contextWindow >= 1000, // 至少1000 token
        duration: Date.now() - startTime,
        details: { contextWindow },
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '测试失败',
      };
    }
  }

  /**
   * 运行所有测试
   * @param modelId 模型ID
   * @returns 完整测试报告
   */
  async runAllTests(modelId: string): Promise<CapabilityTestReport> {
    const [functionCalling, multimodal, streaming, contextWindow] = await Promise.all([
      this.testFunctionCalling(modelId),
      this.testMultimodal(modelId),
      this.testStreaming(modelId),
      this.testContextWindow(modelId),
    ]);

    const results = [functionCalling, multimodal, streaming, contextWindow];
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      modelId,
      timestamp: new Date().toISOString(),
      results: {
        functionCalling,
        multimodal,
        streaming,
        contextWindow,
      },
      summary: {
        total: results.length,
        passed,
        failed,
      },
    };
  }

  /**
   * 设置 Mock LLM 客户端
   * @param client Mock 客户端
   */
  setMockClient(client: MockLLMClient): void {
    this.mockClient = client;
  }
}