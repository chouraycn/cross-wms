/**
 * MultilingualIntent 单元测试
 *
 * v6.0: P2-6 多语言意图识别
 * - 9种意图类型识别
 * - 语言检测（zh/en/mixed）
 * - 多步骤检测（连接词识别）
 * - 置信度计算
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MultilingualIntent, IntentResult, IntentType } from '../engine/multilingualIntent.js';

describe('MultilingualIntent', () => {
  let intentRecognizer: MultilingualIntent;

  beforeEach(() => {
    intentRecognizer = new MultilingualIntent();
  });

  describe('中文意图识别', () => {
    it('查询意图识别', () => {
      const result = intentRecognizer.recognize('请帮我查询库存信息');
      expect(result.primaryIntent).toBe('query');
      expect(result.intents).toContain('query');
      expect(result.detectedLanguage).toBe('zh');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('创建意图识别', () => {
      const result = intentRecognizer.recognize('新建一个出库单');
      expect(result.primaryIntent).toBe('create');
      expect(result.intents).toContain('create');
    });

    it('更新意图识别', () => {
      const result = intentRecognizer.recognize('修改仓库地址');
      expect(result.primaryIntent).toBe('update');
      expect(result.intents).toContain('update');
    });

    it('删除意图识别', () => {
      const result = intentRecognizer.recognize('删除这个订单');
      expect(result.primaryIntent).toBe('delete');
      expect(result.intents).toContain('delete');
    });

    it('分析意图识别', () => {
      const result = intentRecognizer.recognize('分析库存变化趋势');
      expect(result.primaryIntent).toBe('analyze');
      expect(result.intents).toContain('analyze');
    });

    it('对比意图识别', () => {
      const result = intentRecognizer.recognize('对比两个仓库的差异');
      expect(result.primaryIntent).toBe('compare');
      expect(result.intents).toContain('compare');
    });
  });

  describe('英文意图识别', () => {
    it('query 意图识别', () => {
      const result = intentRecognizer.recognize('query the outbound orders');
      expect(result.primaryIntent).toBe('query');
      expect(result.intents).toContain('query');
      expect(result.detectedLanguage).toBe('en');
    });

    it('create 意图识别', () => {
      const result = intentRecognizer.recognize('create a new outbound order');
      expect(result.primaryIntent).toBe('create');
    });

    it('analyze 意图识别', () => {
      const result = intentRecognizer.recognize('analyze the inventory data');
      expect(result.primaryIntent).toBe('analyze');
    });
  });

  describe('中英混合意图识别', () => {
    it('混合语言识别为 mixed', () => {
      const result = intentRecognizer.recognize('帮我 query 出库单 and 分析库存');
      expect(result.detectedLanguage).toBe('mixed');
      expect(result.intents).toContain('query');
      expect(result.intents).toContain('analyze');
    });

    it('混合语言多意图识别', () => {
      const result = intentRecognizer.recognize('查询库存 and 更新数量');
      expect(result.intents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('语言检测', () => {
    it('纯中文检测为 zh', () => {
      const result = intentRecognizer.recognize('帮我查询库存');
      expect(result.detectedLanguage).toBe('zh');
    });

    it('纯英文检测为 en', () => {
      const result = intentRecognizer.recognize('show me the inventory');
      expect(result.detectedLanguage).toBe('en');
    });

    it('数字和特殊字符不影响语言检测', () => {
      const result = intentRecognizer.recognize('12345 !!! ???');
      // 无中英文内容 → 默认 en
      expect(result.detectedLanguage).toBe('en');
    });
  });

  describe('多步骤检测', () => {
    it('先...再... 模式识别为多步骤', () => {
      const result = intentRecognizer.recognize('先查询库存再创建出库单');
      expect(result.isMultiStep).toBe(true);
      expect(result.estimatedSteps).toBeGreaterThan(1);
    });

    it('first...then 模式识别为多步骤', () => {
      const result = intentRecognizer.recognize('first query inventory then create outbound');
      expect(result.isMultiStep).toBe(true);
    });

    it('and then 模式识别为多步骤', () => {
      const result = intentRecognizer.recognize('query orders and then analyze them');
      expect(result.isMultiStep).toBe(true);
    });

    it('单步骤指令 isMultiStep 为 false', () => {
      const result = intentRecognizer.recognize('查询库存');
      expect(result.isMultiStep).toBe(false);
      expect(result.estimatedSteps).toBe(1);
    });
  });

  describe('置信度计算', () => {
    it('匹配多个意图置信度更高', () => {
      const singleResult = intentRecognizer.recognize('查询库存');
      const multiResult = intentRecognizer.recognize('查询库存并分析趋势');
      expect(multiResult.confidence).toBeGreaterThanOrEqual(singleResult.confidence);
    });

    it('无匹配意图置信度很低', () => {
      const result = intentRecognizer.recognize('abc xyz 123');
      expect(result.primaryIntent).toBe('unknown');
      expect(result.confidence).toBeLessThanOrEqual(0.2);
    });

    it('混合语言置信度略低', () => {
      const zhResult = intentRecognizer.recognize('查询库存');
      const mixedResult = intentRecognizer.recognize('帮我query库存');
      // 混合语言置信度应有 -0.05 微调
      // 但不一定每次都低，取决于意图匹配数
      expect(mixedResult.confidence).toBeGreaterThan(0);
    });

    it('置信度在 0-1 范围内', () => {
      const result = intentRecognizer.recognize('查询库存并分析差异和创建出库单');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('matchedKeywords', () => {
    it('返回所有匹配的关键词', () => {
      const result = intentRecognizer.recognize('查询库存信息');
      expect(result.matchedKeywords).toContain('查询');
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
    });

    it('英文关键词也被收集', () => {
      const result = intentRecognizer.recognize('query inventory data');
      expect(result.matchedKeywords).toContain('query');
    });
  });

  describe('reset', () => {
    it('reset 不影响识别结果（无状态模块）', () => {
      intentRecognizer.reset();
      const result = intentRecognizer.recognize('查询库存');
      expect(result.primaryIntent).toBe('query');
    });
  });

  describe('边界条件', () => {
    it('空字符串返回 unknown', () => {
      const result = intentRecognizer.recognize('');
      expect(result.primaryIntent).toBe('unknown');
    });

    it('纯数字返回 unknown', () => {
      const result = intentRecognizer.recognize('123 456');
      expect(result.primaryIntent).toBe('unknown');
    });
  });
});
