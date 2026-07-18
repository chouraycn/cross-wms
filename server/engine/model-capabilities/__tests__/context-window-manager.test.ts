import { describe, it, expect, beforeEach } from 'vitest';
import { ModelCapabilityRegistry } from '../capability-registry.js';
import { ContextWindowManager, type Message } from '../context-window-manager.js';

describe('ContextWindowManager', () => {
  let registry: ModelCapabilityRegistry;
  let manager: ContextWindowManager;

  beforeEach(() => {
    registry = new ModelCapabilityRegistry();
    registry.registerModel({
      modelId: 'test-model',
      name: 'Test Model',
      provider: 'test',
      capabilities: [],
      contextWindow: 4000,
      maxTokens: 1000,
    });

    manager = new ContextWindowManager(registry);
  });

  // 测试 1: 估算文本 token 数
  it('should estimate tokens for text', () => {
    const chineseText = '你好世界'; // 4个中文字符
    const tokens = manager.estimateTokens(chineseText);

    // 中文约 1.5 tokens/字符，所以大约 6 tokens
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  // 测试 2: 估算英文文本
  it('should estimate tokens for English text', () => {
    const englishText = 'Hello World'; // 2个英文单词
    const tokens = manager.estimateTokens(englishText);

    // 英文约 1 token/词
    expect(tokens).toBeGreaterThan(0);
  });

  // 测试 3: 估算消息列表 token 数
  it('should estimate messages tokens', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    const tokens = manager.estimateMessagesTokens(messages);

    expect(tokens).toBeGreaterThan(0);
    // 包含内容和消息开销
    expect(tokens).toBeGreaterThan(20);
  });

  // 测试 4: 适配上下文窗口 - 无需截断
  it('should fit context without truncation', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    const fitted = manager.fitContext('test-model', messages, 1000);

    expect(fitted).toEqual(messages);
  });

  // 测试 5: 适配上下文窗口 - 需要截断
  it('should fit context with truncation', () => {
    const longContent = 'A'.repeat(10000);
    const messages: Message[] = [
      { role: 'system', content: 'System message' },
      { role: 'user', content: longContent },
    ];

    const fitted = manager.fitContext('test-model', messages, 1000);

    expect(fitted.length).toBeLessThanOrEqual(messages.length);
    const fittedTokens = manager.estimateMessagesTokens(fitted);
    expect(fittedTokens).toBeLessThan(3000);
  });

  // 测试 6: 截断消息列表
  it('should truncate messages', () => {
    const messages: Message[] = [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'A'.repeat(500) },
      { role: 'assistant', content: 'B'.repeat(500) },
      { role: 'user', content: 'C'.repeat(500) },
    ];

    const truncated = manager.truncate(messages, 100);

    // 截断后的消息应该更少或相等
    expect(truncated.length).toBeLessThanOrEqual(messages.length);
    // 应保留系统消息
    expect(truncated[0].role).toBe('system');
  });

  // 测试 7: 分割上下文
  it('should split context into chunks', () => {
    const messages: Message[] = [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'User 1' },
      { role: 'assistant', content: 'Assistant 1' },
      { role: 'user', content: 'User 2' },
      { role: 'assistant', content: 'Assistant 2' },
    ];

    const chunks = manager.splitContext(messages, 50);

    expect(chunks.length).toBeGreaterThan(0);
    // 每个块都应该包含系统消息
    chunks.forEach((chunk) => {
      expect(chunk[0].role).toBe('system');
    });
  });

  // 测试 8: 获取上下文窗口信息
  it('should get context info', () => {
    const info = manager.getContextInfo('test-model');

    expect(info.contextWindow).toBe(4000);
    expect(info.maxInputTokens).toBeGreaterThan(0);
    expect(info.recommendedReserve).toBeGreaterThan(0);
  });

  // 测试 9: 检查是否超出上下文窗口
  it('should check overflow', () => {
    const shortMessages: Message[] = [{ role: 'user', content: 'Hi' }];
    expect(manager.isOverflow('test-model', shortMessages)).toBe(false);

    // 创建超长消息，确保超过上下文窗口（4000 - 1024 = 2976）
    const longMessages: Message[] = [
      { role: 'user', content: 'A'.repeat(50000) },
      { role: 'assistant', content: 'B'.repeat(50000) },
    ];
    expect(manager.isOverflow('test-model', longMessages)).toBe(true);
  });

  // 测试 10: 空消息列表处理
  it('should handle empty messages', () => {
    const fitted = manager.fitContext('test-model', [], 1000);
    expect(fitted).toEqual([]);

    const truncated = manager.truncate([], 1000);
    expect(truncated).toEqual([]);

    const chunks = manager.splitContext([], 1000);
    expect(chunks).toEqual([]);
  });
});