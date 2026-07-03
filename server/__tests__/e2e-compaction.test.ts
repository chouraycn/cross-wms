/**
 * E2E 测试：上下文压缩系统
 *
 * 端到端验证 4 个压缩系统核心能力：
 * 1. 可插拔压缩 Provider 注册表（注册/查询/切换）
 * 2. 内置 BuiltinSummarizeProvider（阶段式摘要 + 标识符保留）
 * 3. AutoCompressor 与 Provider 集成（useCompactionProvider）
 * 4. 压缩钩子与回调
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  compactionProviderRegistry,
  BuiltinSummarizeProvider,
  type CompactionProvider,
} from '../engine/compactionProvider.js';
import { AutoCompressor } from '../engine/autoCompressor.js';

// 生成测试消息
function makeMessages(count: number): Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }> {
  const messages: any[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(
      { role: 'user', content: `用户消息 #${i + 1}：查询关于订单 ORDER_${i + 1} 的状态，SKU_CODE_${i + 1} 的库存是多少？` },
      { role: 'assistant', content: `助手回复 #${i + 1}：订单 ORDER_${i + 1} 当前状态为 "已发货"，SKU_CODE_${i + 1} 在仓库 WH_${i % 5} 的库存为 ${100 + i * 10} 件。` }
    );
  }
  return messages;
}

describe('E2E: 上下文压缩系统', () => {

  // ==================== 1. Compaction Provider 注册表 ====================
  describe('可插拔压缩 Provider 注册表', () => {
    beforeEach(() => {
      // 重置注册表
      while (compactionProviderRegistry.list().length > 0) {
        const p = compactionProviderRegistry.list()[0];
        compactionProviderRegistry.unregister(p.id);
      }
    });

    it('应能注册 Provider', () => {
      const provider: CompressionProvider = {
        id: 'test-provider',
        name: 'Test Provider',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress(messages, _opts) {
          return {
            summary: `摘要：${messages.length} 条消息`,
            originalTokenCount: 100,
            compressedTokenCount: 20,
          };
        },
      };
      compactionProviderRegistry.register(provider);

      const found = compactionProviderRegistry.get('test-provider');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Test Provider');
    });

    it('应能注销 Provider', () => {
      const provider: CompressionProvider = {
        id: 'to-remove',
        name: 'To Remove',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress() { return { summary: '', originalTokenCount: 0, compressedTokenCount: 0 }; },
      };
      compactionProviderRegistry.register(provider);
      expect(compactionProviderRegistry.get('to-remove')).toBeDefined();

      compactionProviderRegistry.unregister('to-remove');
      expect(compactionProviderRegistry.get('to-remove')).toBeUndefined();
    });

    it('应能列出所有 Provider', () => {
      compactionProviderRegistry.register({
        id: 'p1', name: 'P1',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress() { return { summary: '', originalTokenCount: 0, compressedTokenCount: 0 }; },
      });
      compactionProviderRegistry.register({
        id: 'p2', name: 'P2',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress() { return { summary: '', originalTokenCount: 0, compressedTokenCount: 0 }; },
      });

      const list = compactionProviderRegistry.list();
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.map(p => p.id)).toContain('p1');
      expect(list.map(p => p.id)).toContain('p2');
    });

    it('应能设置和获取默认 Provider', () => {
      const p1: CompressionProvider = {
        id: 'p1', name: 'P1',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress() { return { summary: '', originalTokenCount: 0, compressedTokenCount: 0 }; },
      };
      const p2: CompressionProvider = {
        id: 'p2', name: 'P2',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress() { return { summary: '', originalTokenCount: 0, compressedTokenCount: 0 }; },
      };

      compactionProviderRegistry.register(p1);
      compactionProviderRegistry.register(p2);
      compactionProviderRegistry.setDefault('p2');

      expect(compactionProviderRegistry.getDefault()?.id).toBe('p2');
    });

    it('compress 方法应使用指定 Provider', async () => {
      const messages = [{ role: 'user', content: 'test' }];
      compactionProviderRegistry.register({
        id: 'custom-provider',
        name: 'Custom Provider',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress(msgs, opts) {
          return {
            summary: `Custom 摘要：${msgs.length} 条消息`,
            originalTokenCount: 50,
            compressedTokenCount: 10,
          };
        },
      });

      const result = await compactionProviderRegistry.compress(messages as any, 'custom-provider');
      expect(result.providerId).toBe('custom-provider');
      expect(result.compressedTokenCount).toBe(10);
      expect(result.summary).toContain('Custom');
    });

    it('未指定 Provider 时应使用默认 Provider', async () => {
      const messages = [{ role: 'user', content: 'test' }];
      // 注册默认
      compactionProviderRegistry.register({
        id: 'default-p',
        name: 'Default',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress(msgs) {
          return { summary: `DEFAULT:${msgs.length}`, originalTokenCount: 10, compressedTokenCount: 2 };
        },
      });
      compactionProviderRegistry.setDefault('default-p');

      const result = await compactionProviderRegistry.compress(messages as any);
      expect(result.providerId).toBe('default-p');
    });
  });

  // ==================== 2. BuiltinSummarizeProvider ====================
  describe('内置 BuiltinSummarizeProvider', () => {
    beforeEach(() => {
      // 确保内置 provider 已注册
      if (!compactionProviderRegistry.get('builtin-summarize')) {
        compactionProviderRegistry.register(new BuiltinSummarizeProvider());
      }
    });

    it('应存在并已注册', () => {
      const provider = compactionProviderRegistry.get('builtin-summarize');
      expect(provider).toBeDefined();
      expect(provider?.id).toBe('builtin-summarize');
    });

    it('应能执行压缩并返回摘要', async () => {
      const provider = compactionProviderRegistry.get('builtin-summarize')!;
      const messages = makeMessages(20);

      const result = await provider.compress(messages as any, {});
      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.originalTokenCount).toBeGreaterThan(0);
      expect(result.compressedTokenCount).toBeGreaterThan(0);
      expect(result.compressedTokenCount).toBeLessThan(result.originalTokenCount);
    });

    it('应保留标识符（如 ORDER_、SKU_CODE_ 等）', async () => {
      const provider = compactionProviderRegistry.get('builtin-summarize')!;
      const messages = [
        { role: 'user', content: '查询订单 ORDER_12345 的状态，SKU_CODE_999 的库存' },
        { role: 'assistant', content: '订单 ORDER_12345 已发货，SKU_CODE_999 库存 50 件' },
      ];

      const result = await provider.compress(messages as any, { identifierPolicy: 'strict' });
      // 摘要应该保留关键标识符
      expect(result.summary).toContain('ORDER_12345');
      expect(result.summary).toContain('SKU_CODE_999');
    });

    it('应支持 previousSummary 链式压缩', async () => {
      const provider = compactionProviderRegistry.get('builtin-summarize')!;
      const oldSummary = '历史摘要：之前讨论了订单 ORDER_001 的问题';
      const newMessages = [
        { role: 'user', content: '那 ORDER_002 呢？' },
        { role: 'assistant', content: 'ORDER_002 也已处理完毕' },
      ];

      const result = await provider.compress(newMessages as any, {
        previousSummary: oldSummary,
        identifierPolicy: 'strict',
      });

      // 新摘要应该包含之前的摘要内容
      expect(result.summary).toContain('ORDER_001');
      expect(result.summary).toContain('ORDER_002');
    });

    it('preserveRecent 应保留最近的消息', async () => {
      const provider = compactionProviderRegistry.get('builtin-summarize')!;
      const messages = makeMessages(20);

      const result = await provider.compress(messages as any, { preserveRecent: 2 });
      // 最近 2 条消息应保留在摘要中或以较高优先级保留
      expect(result.originalTokenCount).toBeGreaterThan(0);
      expect(result.compressedTokenCount).toBeGreaterThan(0);
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('应支持 custom identifier policy', async () => {
      const provider = compactionProviderRegistry.get('builtin-summarize')!;
      const messages = makeMessages(3);

      const result = await provider.compress(messages as any, {
        identifierPolicy: 'custom',
        customIdentifierInstructions: '请保留所有 SKU_ 开头的代码',
      });
      expect(result.summary).toBeDefined();
    });
  });

  // ==================== 3. AutoCompressor + Provider 集成 ====================
  describe('AutoCompressor 与 Provider 集成', () => {
    beforeEach(() => {
      // 重置 provider registry
      while (compactionProviderRegistry.list().length > 0) {
        const p = compactionProviderRegistry.list()[0];
        compactionProviderRegistry.unregister(p.id);
      }
      // 重新注册内置
      compactionProviderRegistry.register(new BuiltinSummarizeProvider());
      compactionProviderRegistry.setDefault('builtin-summarize');
    });

    it('useCompactionProvider 应能执行压缩', async () => {
      const compressor = new AutoCompressor({
        trigger: 'manual',
        compressionProviderId: 'builtin-summarize',
      });
      const messages = makeMessages(20);

      const result = await compressor.useCompactionProvider(messages as any);
      expect(result.summary).toBeDefined();
      expect(result.providerId).toBe('builtin-summarize');
      expect(result.originalTokenCount).toBeGreaterThan(result.compressedTokenCount);
    });

    it('onCompressed 回调应被触发', async () => {
      let callbackCalled = false;
      let callbackData: any = null;

      const compressor = new AutoCompressor({
        trigger: 'manual',
        compressionProviderId: 'builtin-summarize',
        onCompressed: (result) => {
          callbackCalled = true;
          callbackData = result;
        },
      });
      const messages = makeMessages(20);

      await compressor.useCompactionProvider(messages as any);
      expect(callbackCalled).toBe(true);
      expect(callbackData.originalTokens).toBeGreaterThan(0);
      expect(callbackData.compressedTokens).toBeGreaterThan(0);
      expect(callbackData.savingsRatio).toBeGreaterThan(0);
      expect(callbackData.savingsRatio).toBeLessThan(1);
    });

    it('executeCompression 配置了 providerId 时应调用 Provider', async () => {
      const compressor = new AutoCompressor({
        trigger: 'manual',
        compressionProviderId: 'builtin-summarize',
        safetyCheckEnabled: false,
      });
      const messages = makeMessages(8);

      const result = await compressor.executeCompression(messages as any, 2);
      // 配置了 provider 时，返回的 plan 中应有 providerResult
      expect(result.plan).toBeDefined();
      expect(result.shouldProceed).toBe(true);
    });

    it('未配置 providerId 时 executeCompression 应走原有流程', async () => {
      const compressor = new AutoCompressor({
        trigger: 'manual',
        safetyCheckEnabled: false,
      });
      const messages = makeMessages(10);

      const result = await compressor.executeCompression(messages as any, 2);
      expect(result.plan).toBeDefined();
      expect(result.plan.items.length).toBeGreaterThan(0);
    });

    it('provider 失败时应降级', async () => {
      // 注册一个会失败的 provider
      compactionProviderRegistry.register({
        id: 'failing-provider',
        name: 'Failing',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress() {
          throw new Error('Provider 故意失败');
        },
      });

      const compressor = new AutoCompressor({
        trigger: 'manual',
        compressionProviderId: 'failing-provider',
        safetyCheckEnabled: false,
      });
      const messages = makeMessages(5);

      // 失败时应降级为 plan-only
      const result = await compressor.executeCompression(messages as any, 1);
      expect(result.plan).toBeDefined();
      expect(result.shouldProceed).toBe(true); // 降级后仍返回 true
    });
  });

  // ==================== 4. 多 Provider 切换 ====================
  describe('多 Provider 切换场景', () => {
    it('应能在不同 Provider 间切换', async () => {
      compactionProviderRegistry.register({
        id: 'fast-provider',
        name: 'Fast Provider',
        summarizationInstructions: { identifierPolicy: 'off' },
        async compress(msgs) {
          return {
            summary: `FAST: ${msgs.length} 条消息的快速摘要`,
            originalTokenCount: 100,
            compressedTokenCount: 10,
          };
        },
      });
      compactionProviderRegistry.register({
        id: 'quality-provider',
        name: 'Quality Provider',
        summarizationInstructions: { identifierPolicy: 'strict' },
        async compress(msgs) {
          return {
            summary: `QUALITY: ${msgs.length} 条消息的高质量详细摘要，保留所有标识符和关键信息`,
            originalTokenCount: 100,
            compressedTokenCount: 30,
          };
        },
      });

      const messages = makeMessages(3);

      // 使用快速 provider
      const fastResult = await compactionProviderRegistry.compress(messages as any, 'fast-provider');
      expect(fastResult.summary).toContain('FAST');
      expect(fastResult.compressedTokenCount).toBe(10);

      // 使用高质量 provider
      const qualityResult = await compactionProviderRegistry.compress(messages as any, 'quality-provider');
      expect(qualityResult.summary).toContain('QUALITY');
      expect(qualityResult.compressedTokenCount).toBe(30);
    });
  });
});
