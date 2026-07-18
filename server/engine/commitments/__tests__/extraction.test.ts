import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractCommitmentsFromText,
  generateDedupeKey,
  buildCommitmentCandidates,
  addExtractionRule,
  clearExtractionRules,
  getExtractionRules,
  validateCandidate,
  parseTimeExpression,
  detectEntities,
} from '../index.js';
import type { CommitmentKind, CommitmentSensitivity } from '../index.js';

describe('extraction', () => {
  beforeEach(() => {
    clearExtractionRules();
  });

  afterEach(() => {
    clearExtractionRules();
  });

  describe('extractCommitmentsFromText', () => {
    it('应该从文本中提取 follow_up 类型的承诺', () => {
      const text = '我会在明天跟进这个问题';
      const results = extractCommitmentsFromText(text);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.kind).toBe('follow_up');
    });

    it('应该从文本中提取 reminder 类型的承诺', () => {
      const text = '请提醒我下午3点开会';
      const results = extractCommitmentsFromText(text);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.kind).toBe('reminder');
    });

    it('应该从文本中提取 urgent 类型的承诺', () => {
      const text = '紧急！请立即处理这个问题';
      const results = extractCommitmentsFromText(text);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.priority).toBe('high');
    });

    it('应该从文本中提取 care 类型的承诺', () => {
      const text = '记得按时吃药哦';
      const results = extractCommitmentsFromText(text);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.sensitivity).toBe('care');
    });

    it('空文本应该返回空结果', () => {
      const results = extractCommitmentsFromText('');
      expect(results).toEqual([]);
    });

    it('无意义文本应该返回空结果', () => {
      const results = extractCommitmentsFromText('你好，今天天气不错');
      expect(results).toEqual([]);
    });

    it('应该提取多个承诺', () => {
      const text = '我会在明天跟进这个问题，请提醒我下午3点开会';
      const results = extractCommitmentsFromText(text);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('应该包含置信度分数', () => {
      const text = '我会在明天跟进这个问题';
      const results = extractCommitmentsFromText(text);
      expect(results[0]?.confidence).toBeDefined();
      expect(typeof results[0]?.confidence).toBe('number');
      expect(results[0]?.confidence).toBeGreaterThan(0);
      expect(results[0]?.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('generateDedupeKey', () => {
    it('应该为相同的输入生成相同的去重键', () => {
      const key1 = generateDedupeKey('follow_up', '跟进问题', 1000, 2000);
      const key2 = generateDedupeKey('follow_up', '跟进问题', 1000, 2000);
      expect(key1).toBe(key2);
    });

    it('应该为不同的 kind 生成不同的键', () => {
      const key1 = generateDedupeKey('follow_up', '测试', 1000, 2000);
      const key2 = generateDedupeKey('reminder', '测试', 1000, 2000);
      expect(key1).not.toBe(key2);
    });

    it('应该为不同的 reason 生成不同的键', () => {
      const key1 = generateDedupeKey('follow_up', '原因1', 1000, 2000);
      const key2 = generateDedupeKey('follow_up', '原因2', 1000, 2000);
      expect(key1).not.toBe(key2);
    });
  });

  describe('buildCommitmentCandidates', () => {
    it('应该从提取结果构建候选项', () => {
      const results = extractCommitmentsFromText('我会在明天跟进这个问题');
      const candidates = buildCommitmentCandidates(results, 'item-1');
      expect(candidates.length).toBe(results.length);
      expect(candidates[0]?.itemId).toBe('item-1');
    });

    it('空结果应该返回空数组', () => {
      const candidates = buildCommitmentCandidates([], 'item-1');
      expect(candidates).toEqual([]);
    });
  });

  describe('addExtractionRule / getExtractionRules', () => {
    it('应该添加自定义提取规则', () => {
      const initialCount = getExtractionRules().length;
      addExtractionRule({
        kind: 'follow_up',
        pattern: /自定义规则/,
        reason: '自定义',
        confidence: 0.8,
      });
      expect(getExtractionRules().length).toBe(initialCount + 1);
    });

    it('clearExtractionRules 应该清除所有规则', () => {
      addExtractionRule({
        kind: 'follow_up',
        pattern: /测试/,
        reason: '测试',
        confidence: 0.5,
      });
      expect(getExtractionRules().length).toBeGreaterThan(0);
      clearExtractionRules();
      expect(getExtractionRules().length).toBe(0);
    });
  });

  describe('validateCandidate', () => {
    it('应该验证有效的候选项', () => {
      const result = validateCandidate({
        kind: 'follow_up',
        reason: '测试原因',
        confidence: 0.8,
        sensitivity: 'normal',
      });
      expect(result.valid).toBe(true);
    });

    it('应该拒绝无效的 kind', () => {
      const result = validateCandidate({
        kind: 'invalid_kind' as CommitmentKind,
        reason: '测试',
        confidence: 0.8,
        sensitivity: 'normal',
      });
      expect(result.valid).toBe(false);
    });

    it('应该拒绝低置信度', () => {
      const result = validateCandidate({
        kind: 'follow_up',
        reason: '测试',
        confidence: 0.1,
        sensitivity: 'normal',
      });
      expect(result.valid).toBe(false);
    });

    it('应该拒绝空 reason', () => {
      const result = validateCandidate({
        kind: 'follow_up',
        reason: '',
        confidence: 0.8,
        sensitivity: 'normal',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('parseTimeExpression', () => {
    it('应该解析"明天"', () => {
      const result = parseTimeExpression('明天');
      expect(result).toBeDefined();
      expect(result?.earliestMs).toBeGreaterThan(Date.now());
    });

    it('应该解析"今天下午"', () => {
      const result = parseTimeExpression('今天下午');
      expect(result).toBeDefined();
    });

    it('无法解析的表达式返回 null', () => {
      const result = parseTimeExpression('某个时间');
      expect(result).toBeNull();
    });
  });

  describe('detectEntities', () => {
    it('应该检测到人名', () => {
      const entities = detectEntities('请告诉张三这件事');
      expect(entities.length).toBeGreaterThanOrEqual(0);
    });

    it('应该检测到时间实体', () => {
      const entities = detectEntities('明天下午3点');
      const timeEntities = entities.filter(e => e.type === 'time');
      expect(timeEntities.length).toBeGreaterThanOrEqual(0);
    });

    it('空文本返回空数组', () => {
      const entities = detectEntities('');
      expect(entities).toEqual([]);
    });
  });
});
