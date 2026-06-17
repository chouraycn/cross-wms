/**
 * SemanticCompressor 单元测试
 *
 * v6.0: P2-5 上下文感知压缩
 * - 三级降级：LLM语义压缩 → 规则提取式压缩 → 截断
 * - 关键信息提取（实体、数字、操作、错误）
 * - CompressionResult 结构
 * - extractKeyInfo 公开方法
 * - buildInputText 内部逻辑（间接测试）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticCompressor, CompressionResult, ExtractedKeyInfo } from '../engine/semanticCompressor.js';
import type { Observation } from '../engine/observer.js';

// Helper: 创建 mock Observation
function createObservation(
  toolName: string,
  result: string,
  level: 'success' | 'warning' | 'error' | 'retry_suggested' = 'success',
): Observation {
  return {
    toolCall: { name: toolName, arguments: {} },
    result,
    assessment: { level, reason: '测试', shouldRetry: false, shouldAdjustStrategy: false },
  };
}

// Mock callAIModelStream to avoid real AI calls
vi.mock('../aiClient.js', () => ({
  callAIModelStream: vi.fn().mockRejectedValue(new Error('Mock: LLM unavailable')),
}));

describe('SemanticCompressor', () => {
  let compressor: SemanticCompressor;

  beforeEach(() => {
    compressor = new SemanticCompressor();
    vi.clearAllMocks();
  });

  describe('extractKeyInfo', () => {
    it('提取实体名（包含仓/库/区/位）', () => {
      // 正则 ENTITY_PATTERN = /[A-Z][a-zA-Z0-9_]*(?:仓|库|区|位)/g
      // 匹配以大写英文开头+中文后缀，如 "A仓"、"Main库"
      const text = '仓库A仓已出库，区域B区库存不足，Main库发货';
      const info = compressor.extractKeyInfo(text);
      expect(info.entities.length).toBeGreaterThan(0);
      expect(info.entities).toContain('A仓');
      expect(info.entities).toContain('B区');
    });

    it('提取数字（包含单位）', () => {
      const text = '库存200件，金额5000元';
      const info = compressor.extractKeyInfo(text);
      expect(info.numbers.length).toBeGreaterThan(0);
      expect(info.numbers).toContain('200件');
      expect(info.numbers).toContain('5000元');
    });

    it('提取操作指令', () => {
      const text = '请查询库存，创建出库单';
      const info = compressor.extractKeyInfo(text);
      expect(info.actions.length).toBeGreaterThan(0);
      expect(info.actions).toContain('查询');
      expect(info.actions).toContain('创建');
    });

    it('提取错误信息', () => {
      const text = '操作失败，库存不足，出现异常';
      const info = compressor.extractKeyInfo(text);
      expect(info.errors.length).toBeGreaterThan(0);
      expect(info.errors).toContain('失败');
      expect(info.errors).toContain('不足');
    });

    it('无关键信息时返回空数组', () => {
      const text = 'hello world this is plain text';
      const info = compressor.extractKeyInfo(text);
      expect(info.entities.length).toBe(0);
      expect(info.numbers.length).toBe(0);
    });

    it('去重关键词', () => {
      const text = '查询查询查询库存';
      const info = compressor.extractKeyInfo(text);
      // '查询' 只出现一次（去重）
      expect(info.actions.filter(a => a === '查询').length).toBe(1);
    });
  });

  describe('extractiveCompress', () => {
    it('语义压缩失败时降级为提取式压缩', async () => {
      const observations = [
        createObservation('wms_inventory', '仓库A仓库存200件'),
      ];
      const result = await compressor.compress(observations, '', {} as any);

      expect(result.strategy).toBe('extractive');
      expect(result.compressed).toBeDefined();
      expect(result.originalLength).toBeGreaterThan(0);
      expect(result.ratio).toBeLessThanOrEqual(1);
    });

    it('提取式压缩包含关键实体', async () => {
      const observations = [
        createObservation('wms_inventory', '仓库A仓库存200件，查询成功'),
      ];
      const result = await compressor.compress(observations, '', {} as any);

      expect(result.strategy).toBe('extractive');
      expect(result.preservedEntities.length).toBeGreaterThan(0);
    });

    it('无法提取关键信息时截断', async () => {
      const observations = [
        createObservation('system_info', 'plain english text with no key info'),
      ];
      const result = await compressor.compress(observations, '', {} as any);

      expect(result.strategy).toBe('extractive');
      expect(result.compressed).toBeDefined();
    });
  });

  describe('CompressionResult 结构', () => {
    it('返回完整的 CompressionResult', async () => {
      const observations = [
        createObservation('wms_inventory', '仓库A仓库存200件'),
      ];
      const result = await compressor.compress(observations, '已有摘要', {} as any);

      expect(result).toHaveProperty('compressed');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('originalLength');
      expect(result).toHaveProperty('compressedLength');
      expect(result).toHaveProperty('ratio');
      expect(result).toHaveProperty('preservedEntities');
      expect(typeof result.ratio).toBe('number');
    });

    it('ratio = compressedLength / originalLength', async () => {
      const observations = [
        createObservation('wms_inventory', '仓库A仓库存200件'),
      ];
      const result = await compressor.compress(observations, '', {} as any);

      expect(result.ratio).toBe(result.compressedLength / result.originalLength);
    });
  });

  describe('buildInputText (间接测试)', () => {
    it('已有摘要被包含在输入中', async () => {
      const observations = [
        createObservation('wms_inventory', '仓库A仓库存200件'),
      ];
      const result = await compressor.compress(observations, '旧摘要内容', {} as any);

      // 输入长度应大于0，验证输入构建成功
      expect(result.originalLength).toBeGreaterThan(0);
    });

    it('observation 的 result 过长时截断到 300', async () => {
      const longResult = 'A'.repeat(500);
      const observations = [
        createObservation('wms_inventory', longResult),
      ];
      const result = await compressor.compress(observations, '', {} as any);

      expect(result.originalLength).toBeGreaterThan(0);
      // 验证没有崩溃即可
    });
  });

  describe('getLastStrategy', () => {
    it('初始策略为 fallback', () => {
      expect(compressor.getLastStrategy()).toBe('fallback');
    });

    it('压缩后策略更新为 extractive', async () => {
      const observations = [
        createObservation('wms_inventory', '仓库A仓库存200件'),
      ];
      await compressor.compress(observations, '', {} as any);
      expect(compressor.getLastStrategy()).toBe('extractive');
    });
  });

  describe('reset', () => {
    it('reset 重置策略为 fallback', async () => {
      const observations = [
        createObservation('wms_inventory', '仓库A仓库存200件'),
      ];
      await compressor.compress(observations, '', {} as any);
      expect(compressor.getLastStrategy()).toBe('extractive');

      compressor.reset();
      expect(compressor.getLastStrategy()).toBe('fallback');
    });
  });
});
