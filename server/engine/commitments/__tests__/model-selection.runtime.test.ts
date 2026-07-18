import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommitmentModelSelector,
  selectCommitmentModel,
  configureCommitmentModelSelection,
} from '../index.js';
import type { CommitmentKind, CommitmentSensitivity } from '../index.js';

describe('model-selection', () => {
  let selector: CommitmentModelSelector;

  beforeEach(() => {
    selector = new CommitmentModelSelector();
    selector.reset();
  });

  describe('基本选择', () => {
    it('无上下文时应该返回默认模型', () => {
      const result = selector.selectModel();
      expect(result.model).toBe('default');
      expect(result.reason).toBe('default model');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('应该根据 kind 选择模型', () => {
      selector.setConfig({
        perKindModels: { follow_up: 'followup-model' },
      });
      const result = selector.selectModel({ kind: 'follow_up' as CommitmentKind });
      expect(result.model).toBe('followup-model');
    });

    it('应该根据 sensitivity 选择模型', () => {
      selector.setConfig({
        perSensitivityModels: { care: 'care-model' },
      });
      const result = selector.selectModel({ sensitivity: 'care' as CommitmentSensitivity });
      expect(result.model).toBe('care-model');
    });

    it('care 敏感度应该使用 care 模型', () => {
      selector.setConfig({ careModel: 'special-care' });
      const result = selector.selectModel({ sensitivity: 'care' as CommitmentSensitivity });
      expect(result.model).toBe('special-care');
    });

    it('复杂上下文应该使用 highPriority 模型', () => {
      selector.setConfig({ highPriorityModel: 'high-priority-model' });
      const result = selector.selectModel({ hasComplexContext: true });
      expect(result.model).toBe('high-priority-model');
    });

    it('简单单条提取应该使用 fast 模型', () => {
      selector.setConfig({ fastModel: 'fast-model' });
      const result = selector.selectModel({ batchSize: 1, hasComplexContext: false });
      expect(result.model).toBe('fast-model');
    });

    it('大批量不使用 fast 模型', () => {
      selector.setConfig({ fastModel: 'fast-model', defaultModel: 'default' });
      const result = selector.selectModel({ batchSize: 5, hasComplexContext: false });
      expect(result.model).not.toBe('fast-model');
    });
  });

  describe('模型可用性', () => {
    it('不可用的模型应该被跳过', () => {
      selector.setConfig({ fastModel: 'fast-model' });
      selector.setModelAvailable('fast-model', false);
      const result = selector.selectModel({ batchSize: 1 });
      expect(result.model).not.toBe('fast-model');
    });

    it('所有模型不可用时返回默认模型', () => {
      selector.setModelAvailable('default', false);
      selector.setModelAvailable('fast', false);
      const result = selector.selectModel();
      expect(result.model).toBe('default');
      expect(result.reason).toContain('all candidates unavailable');
    });

    it('availableModels 应该限制可选范围', () => {
      selector.setConfig({ fastModel: 'fast-model' });
      const result = selector.selectModel({
        batchSize: 1,
        availableModels: ['default'],
      });
      expect(result.model).toBe('default');
    });
  });

  describe('首选模型', () => {
    it('应该优先使用首选模型', () => {
      const result = selector.selectModel({
        preferredModels: ['my-model'],
      });
      expect(result.model).toBe('my-model');
      expect(result.reason).toBe('preferred model');
    });

    it('首选模型按顺序优先级', () => {
      selector.setModelAvailable('second', false);
      const result = selector.selectModel({
        preferredModels: ['first', 'second'],
        availableModels: ['first', 'default'],
      });
      expect(result.model).toBe('first');
    });
  });

  describe('批量模型选择', () => {
    it('应该为批量选择合适的模型', () => {
      const items = [
        { kind: 'follow_up' as CommitmentKind, sensitivity: 'normal' as CommitmentSensitivity },
        { kind: 'reminder' as CommitmentKind, sensitivity: 'normal' as CommitmentSensitivity },
      ];
      const result = selector.selectBatchModel(items);
      expect(result.model).toBeDefined();
    });

    it('包含 care 的批量应该使用 care 模型', () => {
      selector.setConfig({ careModel: 'care-batch-model' });
      const items = [
        { kind: 'follow_up' as CommitmentKind, sensitivity: 'care' as CommitmentSensitivity },
      ];
      const result = selector.selectBatchModel(items);
      expect(result.model).toBe('care-batch-model');
    });
  });

  describe('缓存', () => {
    it('相同上下文应该返回缓存结果', () => {
      const result1 = selector.selectModel({ kind: 'follow_up' as CommitmentKind });
      const result2 = selector.selectModel({ kind: 'follow_up' as CommitmentKind });
      expect(result1.model).toBe(result2.model);

      const stats = selector.getStats();
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(1);
    });

    it('配置变化应该使缓存失效', () => {
      selector.selectModel({ kind: 'follow_up' as CommitmentKind });
      selector.setConfig({ defaultModel: 'new-default' });
      const result = selector.selectModel({ kind: 'follow_up' as CommitmentKind });
      expect(result.model).toBe('new-default');
    });

    it('禁用缓存应该不使用缓存', () => {
      selector.setCacheEnabled(false);
      selector.selectModel();
      selector.selectModel();
      const stats = selector.getStats();
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(2);
    });

    it('invalidateCache 应该清除缓存', () => {
      selector.selectModel();
      selector.invalidateCache();
      expect(selector.getCacheSize()).toBe(0);
    });
  });

  describe('统计', () => {
    it('应该跟踪选择次数', () => {
      selector.selectModel();
      selector.selectModel();
      const stats = selector.getStats();
      expect(stats.totalSelections).toBe(2);
    });

    it('应该跟踪每个模型的使用次数', () => {
      selector.selectModel();
      selector.setConfig({ fastModel: 'fast-model' });
      selector.selectModel({ batchSize: 1 });
      const stats = selector.getStats();
      expect(stats.perModelCount['default']).toBeGreaterThanOrEqual(1);
    });

    it('resetStats 应该重置统计', () => {
      selector.selectModel();
      selector.resetStats();
      const stats = selector.getStats();
      expect(stats.totalSelections).toBe(0);
    });
  });

  describe('置信度', () => {
    it('首选模型应该有最高置信度', () => {
      const result = selector.selectModel({
        preferredModels: ['my-model'],
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('默认模型应该有较低置信度', () => {
      const result = selector.selectModel();
      expect(result.confidence).toBeLessThanOrEqual(0.6);
    });
  });

  describe('全局函数', () => {
    beforeEach(() => {
      configureCommitmentModelSelection({ defaultModel: 'default' });
    });

    it('selectCommitmentModel 应该工作', () => {
      const result = selectCommitmentModel();
      expect(result.model).toBeDefined();
    });

    it('configureCommitmentModelSelection 应该工作', () => {
      configureCommitmentModelSelection({ defaultModel: 'custom-default' });
      const result = selectCommitmentModel();
      expect(result.model).toBe('custom-default');
    });
  });
});
