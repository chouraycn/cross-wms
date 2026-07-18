import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelCapabilityRegistry } from '../capability-registry.js';
import { ModelCapabilityTester, type MockLLMClient } from '../capability-tester.js';

describe('ModelCapabilityTester', () => {
  let registry: ModelCapabilityRegistry;
  let tester: ModelCapabilityTester;
  let mockClient: MockLLMClient;

  beforeEach(() => {
    registry = new ModelCapabilityRegistry();
    registry.registerModel({
      modelId: 'test-model',
      name: 'Test Model',
      provider: 'test',
      capabilities: [
        { name: 'multimodal', value: true },
        { name: 'function_calling', value: true },
        { name: 'streaming', value: true },
      ],
      contextWindow: 8000,
      maxTokens: 2048,
    });

    mockClient = {
      chat: vi.fn().mockResolvedValue({
        content: 'This is a test response',
        toolCalls: [{ name: 'get_weather', args: { city: 'Beijing' } }],
      }),
    };

    tester = new ModelCapabilityTester(registry, mockClient);
  });

  // 测试 1: 测试工具调用能力 - 成功
  it('should test function calling capability successfully', async () => {
    const result = await tester.testFunctionCalling('test-model');

    expect(result.passed).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  // 测试 2: 测试工具调用能力 - 模型未注册
  it('should fail for unregistered model in function calling test', async () => {
    const result = await tester.testFunctionCalling('unknown-model');

    expect(result.passed).toBe(false);
    expect(result.error).toBe('模型未注册');
  });

  // 测试 3: 测试多模态能力
  it('should test multimodal capability', async () => {
    const result = await tester.testMultimodal('test-model');

    expect(result.passed).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  // 测试 4: 测试流式输出能力
  it('should test streaming capability', async () => {
    const result = await tester.testStreaming('test-model');

    expect(result.passed).toBe(true);
    expect(result.details?.streamTest).toBe(true);
  });

  // 测试 5: 测试上下文窗口能力
  it('should test context window capability', async () => {
    const result = await tester.testContextWindow('test-model');

    expect(result.passed).toBe(true);
    expect(result.details?.contextWindow).toBe(8000);
  });

  // 测试 6: 上下文窗口无效
  it('should fail for invalid context window', async () => {
    registry.registerModel({
      modelId: 'bad-model',
      name: 'Bad Model',
      provider: 'test',
      capabilities: [],
      contextWindow: 500, // 小于 1000
    });

    const result = await tester.testContextWindow('bad-model');

    expect(result.passed).toBe(false);
  });

  // 测试 7: 运行所有测试
  it('should run all tests', async () => {
    const report = await tester.runAllTests('test-model');

    expect(report.modelId).toBe('test-model');
    expect(report.timestamp).toBeDefined();
    expect(report.summary.total).toBe(4);
    expect(report.summary.passed).toBe(4);
    expect(report.summary.failed).toBe(0);
    expect(report.results.functionCalling.passed).toBe(true);
    expect(report.results.multimodal.passed).toBe(true);
    expect(report.results.streaming.passed).toBe(true);
    expect(report.results.contextWindow.passed).toBe(true);
  });

  // 测试 8: 使用注册表信息测试（无 mock 客户端）
  it('should test using registry without mock client', async () => {
    const testerWithoutMock = new ModelCapabilityTester(registry);

    const result = await testerWithoutMock.testFunctionCalling('test-model');

    expect(result.passed).toBe(true);
    expect(result.details?.source).toBe('registry');
  });

  // 测试 9: Mock 客户端返回工具调用
  it('should handle tool calls from mock client', async () => {
    vi.mocked(mockClient.chat).mockResolvedValueOnce({
      content: '',
      toolCalls: [{ name: 'test_tool', args: {} }],
    });

    const result = await tester.testFunctionCalling('test-model');

    expect(result.passed).toBe(true);
    expect(result.details?.toolCalls).toBeDefined();
  });

  // 测试 10: Mock 客户端抛出错误
  it('should handle mock client errors', async () => {
    vi.mocked(mockClient.chat).mockRejectedValueOnce(new Error('API Error'));

    const result = await tester.testFunctionCalling('test-model');

    expect(result.passed).toBe(false);
    expect(result.error).toBe('API Error');
  });

  // 测试 11: 设置新的 mock 客户端
  it('should set new mock client', async () => {
    const newMockClient: MockLLMClient = {
      chat: vi.fn().mockResolvedValue({ content: 'new response' }),
    };

    tester.setMockClient(newMockClient);

    await tester.testFunctionCalling('test-model');
    expect(newMockClient.chat).toHaveBeenCalled();
  });

  // 测试 12: 测试不支持的能力
  it('should test capability not supported', async () => {
    registry.registerModel({
      modelId: 'limited-model',
      name: 'Limited Model',
      provider: 'test',
      capabilities: [{ name: 'multimodal', value: false }],
      contextWindow: 8000,
    });

    const result = await tester.testMultimodal('limited-model');

    expect(result.passed).toBe(false);
  });
});