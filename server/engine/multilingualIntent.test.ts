/**
 * multilingualIntent 多语言意图识别 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MultilingualIntent } from './multilingualIntent.js';

describe('MultilingualIntent', () => {
  let intent: MultilingualIntent;

  beforeEach(() => {
    intent = new MultilingualIntent();
  });

  describe('recognize - 中文意图识别', () => {
    it('识别查询意图', () => {
      const result = intent.recognize('帮我查询出库单');
      expect(result.primaryIntent).toBe('query');
      expect(result.intents).toContain('query');
      expect(result.detectedLanguage).toBe('zh');
      expect(result.matchedKeywords).toContain('查询');
      expect(result.isMultiStep).toBe(false);
      expect(result.estimatedSteps).toBe(1);
    });

    it('识别创建意图', () => {
      const result = intent.recognize('创建一个新的入库单');
      expect(result.primaryIntent).toBe('create');
      expect(result.matchedKeywords).toContain('创建');
    });

    it('识别更新意图', () => {
      const result = intent.recognize('修改订单状态');
      expect(result.primaryIntent).toBe('update');
    });

    it('识别删除意图', () => {
      const result = intent.recognize('删除这条记录');
      expect(result.primaryIntent).toBe('delete');
    });

    it('识别分析意图', () => {
      const result = intent.recognize('统计本月销售数据');
      expect(result.primaryIntent).toBe('analyze');
    });

    it('识别总结意图', () => {
      const result = intent.recognize('总结一下当前进度');
      expect(result.primaryIntent).toBe('summarize');
    });

    it('识别执行意图', () => {
      const result = intent.recognize('运行这个任务');
      expect(result.primaryIntent).toBe('execute');
    });
  });

  describe('recognize - 英文意图识别', () => {
    it('识别英文 query 意图', () => {
      const result = intent.recognize('please search for outbound orders');
      expect(result.detectedLanguage).toBe('en');
      expect(result.primaryIntent).toBe('query');
      expect(result.matchedKeywords.some(k => k.toLowerCase() === 'search')).toBe(true);
    });

    it('识别英文 create 意图', () => {
      const result = intent.recognize('create a new record');
      expect(result.primaryIntent).toBe('create');
    });

    it('识别英文 delete 意图', () => {
      const result = intent.recognize('remove this item');
      expect(result.primaryIntent).toBe('delete');
    });

    it('识别英文 analyze 意图', () => {
      const result = intent.recognize('evaluate the result');
      expect(result.primaryIntent).toBe('analyze');
    });
  });

  describe('recognize - 语言检测', () => {
    it('纯中文返回 zh', () => {
      const result = intent.recognize('查询订单');
      expect(result.detectedLanguage).toBe('zh');
    });

    it('纯英文返回 en', () => {
      const result = intent.recognize('query orders');
      expect(result.detectedLanguage).toBe('en');
    });

    it('中英混合返回 mixed', () => {
      // 中文比例 > 30% 且英文比例 > 20%
      const result = intent.recognize('帮我 query 出库单 and 分析');
      expect(result.detectedLanguage).toBe('mixed');
    });

    it('仅数字/符号时回退为 en', () => {
      const result = intent.recognize('12345');
      expect(result.detectedLanguage).toBe('en');
    });

    it('无关键词时主意图为 unknown', () => {
      const result = intent.recognize('hello world');
      expect(result.primaryIntent).toBe('unknown');
      expect(result.matchedKeywords).toHaveLength(0);
    });
  });

  describe('recognize - 多步骤检测', () => {
    it('中文 先...再 触发多步骤', () => {
      // 注意：先与再之间不能含 ，。 等分隔符（正则 [^，。,.]* 限制）
      const result = intent.recognize('先查询订单再分析结果');
      expect(result.isMultiStep).toBe(true);
      expect(result.estimatedSteps).toBeGreaterThan(1);
    });

    it('中文 之后...再 触发多步骤', () => {
      const result = intent.recognize('查询订单之后再次确认');
      expect(result.isMultiStep).toBe(true);
    });

    it('中文 第一步 触发多步骤', () => {
      const result = intent.recognize('第一步查询订单');
      expect(result.isMultiStep).toBe(true);
    });

    it('英文 first then 触发多步骤', () => {
      const result = intent.recognize('first query orders then analyze results');
      expect(result.isMultiStep).toBe(true);
      expect(result.estimatedSteps).toBeGreaterThan(1);
    });

    it('英文 and then 触发多步骤', () => {
      const result = intent.recognize('fetch data and then process it');
      expect(result.isMultiStep).toBe(true);
    });

    it('无连接词时不是多步骤', () => {
      const result = intent.recognize('查询订单');
      expect(result.isMultiStep).toBe(false);
      expect(result.estimatedSteps).toBe(1);
    });

    it('步骤数上限为 8', () => {
      const msg = 'first do it and then do it after that next finally additionally also and first then';
      const result = intent.recognize(msg);
      expect(result.estimatedSteps).toBeLessThanOrEqual(8);
    });
  });

  describe('recognize - 置信度计算', () => {
    it('无匹配意图时置信度低 (0.1)', () => {
      const result = intent.recognize('hello');
      expect(result.confidence).toBeCloseTo(0.1, 5);
    });

    it('单意图置信度合理', () => {
      const result = intent.recognize('查询订单');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('多意图置信度高于单意图', () => {
      const single = intent.recognize('查询订单');
      const multi = intent.recognize('查询订单并分析结果');
      expect(multi.confidence).toBeGreaterThanOrEqual(single.confidence);
    });

    it('置信度始终在 [0,1] 范围内', () => {
      const cases = ['查询', 'first then query create delete', '123', ''];
      for (const c of cases) {
        const result = intent.recognize(c);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('recognize - 多意图排序', () => {
    it('主意图为匹配关键词最多的意图', () => {
      // "查询查找" 匹配 query 两个词，"分析" 匹配 analyze 一个词
      const result = intent.recognize('查询查找分析');
      expect(result.primaryIntent).toBe('query');
      expect(result.intents).toContain('analyze');
    });

    it('intents 列表按匹配关键词数降序', () => {
      const result = intent.recognize('查询查找搜索分析');
      expect(result.intents.length).toBeGreaterThanOrEqual(2);
      // query 应排在 analyze 前
      const queryIdx = result.intents.indexOf('query');
      const analyzeIdx = result.intents.indexOf('analyze');
      expect(queryIdx).toBeLessThan(analyzeIdx);
    });
  });

  describe('recognize - 边界条件', () => {
    it('空字符串返回 unknown 意图', () => {
      const result = intent.recognize('');
      expect(result.primaryIntent).toBe('unknown');
      expect(result.matchedKeywords).toHaveLength(0);
      expect(result.isMultiStep).toBe(false);
    });

    it('大小写不敏感匹配', () => {
      const result = intent.recognize('QUERY orders');
      expect(result.primaryIntent).toBe('query');
    });

    it('返回结构包含所有必需字段', () => {
      const result = intent.recognize('查询');
      expect(result).toHaveProperty('primaryIntent');
      expect(result).toHaveProperty('intents');
      expect(result).toHaveProperty('detectedLanguage');
      expect(result).toHaveProperty('isMultiStep');
      expect(result).toHaveProperty('estimatedSteps');
      expect(result).toHaveProperty('matchedKeywords');
      expect(result).toHaveProperty('confidence');
      expect(Array.isArray(result.intents)).toBe(true);
      expect(Array.isArray(result.matchedKeywords)).toBe(true);
    });
  });

  describe('reset', () => {
    it('调用 reset 不抛错（无状态模块）', () => {
      expect(() => intent.reset()).not.toThrow();
    });
  });
});
