// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  IDENTIFIER_PRESERVATION_INSTRUCTIONS,
  resolveIdentifierPreservationInstructions,
  buildCompactionSummarizationInstructions,
  MERGE_SUMMARIES_INSTRUCTIONS,
  extractValidSummaryContent,
} from '../compaction-identifier.js';

describe('compaction-identifier', () => {
  describe('resolveIdentifierPreservationInstructions', () => {
    it('strict 策略应该返回通用标识符指令', () => {
      const result = resolveIdentifierPreservationInstructions({ policy: 'strict' });
      expect(result).toBeDefined();
      expect(result).toContain('UUIDs');
      expect(result).toContain('hostnames');
      expect(result).toContain('URLs');
      expect(result).not.toContain('WMS DOMAIN');
      expect(result).not.toContain('SKU');
    });

    it('off 策略应该返回 undefined', () => {
      const result = resolveIdentifierPreservationInstructions({ policy: 'off' });
      expect(result).toBeUndefined();
    });

    it('custom 策略有自定义指令时应该使用自定义', () => {
      const custom = 'Keep all custom IDs exactly as written.';
      const result = resolveIdentifierPreservationInstructions({
        policy: 'custom',
        customInstructions: custom,
      });
      expect(result).toBe(custom);
    });

    it('custom 策略没有自定义指令时应该回退到默认', () => {
      const result = resolveIdentifierPreservationInstructions({
        policy: 'custom',
        customInstructions: '',
      });
      expect(result).toBe(IDENTIFIER_PRESERVATION_INSTRUCTIONS);
    });

    it('默认应该使用 wms 策略', () => {
      const result = resolveIdentifierPreservationInstructions(undefined);
      expect(result).toBe(IDENTIFIER_PRESERVATION_INSTRUCTIONS);
      expect(result).toContain('UUIDs');
      expect(result).toContain('hostnames');
      expect(result).toContain('URLs');
      expect(result).toContain('WMS DOMAIN');
      expect(result).toContain('SKU');
    });
  });

  describe('buildCompactionSummarizationInstructions', () => {
    it('没有指令时应该返回 undefined', () => {
      const result = buildCompactionSummarizationInstructions(undefined, { policy: 'off' });
      expect(result).toBeUndefined();
    });

    it('只有自定义指令时应该返回自定义', () => {
      const custom = 'Focus on important decisions.';
      const result = buildCompactionSummarizationInstructions(custom, { policy: 'off' });
      expect(result).toContain(custom);
      expect(result).toContain('Additional focus');
    });

    it('只有标识符保留时应该返回标识符指令', () => {
      const result = buildCompactionSummarizationInstructions(undefined, { policy: 'wms' });
      expect(result).toBe(IDENTIFIER_PRESERVATION_INSTRUCTIONS);
    });

    it('两者都有时应该合并', () => {
      const custom = 'Focus on important decisions.';
      const result = buildCompactionSummarizationInstructions(custom, { policy: 'wms' });
      expect(result).toContain(IDENTIFIER_PRESERVATION_INSTRUCTIONS);
      expect(result).toContain(custom);
      expect(result).toContain('Additional focus');
    });
  });

  describe('IDENTIFIER_PRESERVATION_INSTRUCTIONS', () => {
    it('应该包含所有标识符类型', () => {
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('UUIDs');
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('IDs');
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('URLs');
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('IPs');
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('hostnames');
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('File paths');
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('Hashes');
    });

    it('应该有示例', () => {
      expect(IDENTIFIER_PRESERVATION_INSTRUCTIONS).toContain('Examples of identifiers to preserve:');
    });
  });

  describe('MERGE_SUMMARIES_INSTRUCTIONS', () => {
    it('应该包含合并要点', () => {
      expect(MERGE_SUMMARIES_INSTRUCTIONS).toContain('Merge these partial summaries');
      expect(MERGE_SUMMARIES_INSTRUCTIONS).toContain('MUST PRESERVE');
      expect(MERGE_SUMMARIES_INSTRUCTIONS).toContain('Active tasks');
      expect(MERGE_SUMMARIES_INSTRUCTIONS).toContain('Batch operation progress');
      expect(MERGE_SUMMARIES_INSTRUCTIONS).toContain('PRIORITIZE');
    });
  });

  describe('extractValidSummaryContent', () => {
    it('正常摘要应该直接返回', () => {
      const summary = 'This is a valid summary.';
      const result = extractValidSummaryContent(summary);
      expect(result).toBe(summary);
    });

    it('空摘要应该返回默认值', () => {
      const result = extractValidSummaryContent('');
      expect(result).toContain('No summary available');
    });

    it('空白摘要应该返回默认值', () => {
      const result = extractValidSummaryContent('   ');
      expect(result).toContain('No summary available');
    });

    it('超长摘要应该截断', () => {
      const longSummary = 'x'.repeat(20000);
      const result = extractValidSummaryContent(longSummary, 10, 1000);
      expect(result.length).toBeLessThan(longSummary.length);
      expect(result).toContain('...');
    });
  });
});
