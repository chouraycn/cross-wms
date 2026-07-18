import { describe, it, expect } from 'vitest';
import {
  resolveCommitmentsConfig,
  resolveCommitmentTimezone,
  DEBOUNCE_MS,
  BATCH_MAX_ITEMS,
  QUEUE_MAX_ITEMS,
  CONFIDENCE_THRESHOLD,
  CARE_CONFIDENCE_THRESHOLD,
  EXTRACTION_TIMEOUT_SECONDS,
  MAX_PER_HEARTBEAT,
  EXPIRE_AFTER_HOURS,
  MAX_PER_DAY,
  priorityToNumber,
  numberToPriority,
} from '../index.js';
import type { CommitmentsConfigInput, CommitmentPriority } from '../index.js';

describe('config', () => {
  describe('常量', () => {
    it('应该导出所有必要的常量', () => {
      expect(DEBOUNCE_MS).toBeGreaterThan(0);
      expect(BATCH_MAX_ITEMS).toBeGreaterThan(0);
      expect(QUEUE_MAX_ITEMS).toBeGreaterThan(0);
      expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
      expect(CARE_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
      expect(EXTRACTION_TIMEOUT_SECONDS).toBeGreaterThan(0);
      expect(MAX_PER_HEARTBEAT).toBeGreaterThan(0);
      expect(EXPIRE_AFTER_HOURS).toBeGreaterThan(0);
      expect(MAX_PER_DAY).toBeGreaterThan(0);
    });
  });

  describe('resolveCommitmentsConfig', () => {
    it('应该返回默认配置', () => {
      const config = resolveCommitmentsConfig();
      expect(config.enabled).toBe(false);
      expect(config.defaultPriority).toBe('medium');
      expect(config.maxPerDay).toBe(MAX_PER_DAY);
      expect(config.extraction).toBeDefined();
      expect(config.heartbeat).toBeDefined();
      expect(config.store).toBeDefined();
    });

    it('应该禁用时返回禁用配置', () => {
      const config = resolveCommitmentsConfig({ commitments: { enabled: false } });
      expect(config.enabled).toBe(false);
    });

    it('应该启用时返回启用配置', () => {
      const config = resolveCommitmentsConfig({ commitments: { enabled: true } });
      expect(config.enabled).toBe(true);
    });

    it('应该覆盖默认配置', () => {
      const input: CommitmentsConfigInput = {
        commitments: {
          enabled: true,
          defaultPriority: 'high',
          maxPerDay: 50,
        },
      };
      const config = resolveCommitmentsConfig(input);
      expect(config.enabled).toBe(true);
      expect(config.defaultPriority).toBe('high');
      expect(config.maxPerDay).toBe(50);
    });

    it('应该有提取配置', () => {
      const config = resolveCommitmentsConfig();
      expect(config.extraction.debounceMs).toBe(DEBOUNCE_MS);
      expect(config.extraction.batchMaxItems).toBe(BATCH_MAX_ITEMS);
      expect(config.extraction.queueMaxItems).toBe(QUEUE_MAX_ITEMS);
      expect(config.extraction.confidenceThreshold).toBe(CONFIDENCE_THRESHOLD);
      expect(config.extraction.careConfidenceThreshold).toBe(CARE_CONFIDENCE_THRESHOLD);
      expect(config.extraction.timeoutSeconds).toBe(EXTRACTION_TIMEOUT_SECONDS);
    });

    it('应该有心跳配置', () => {
      const config = resolveCommitmentsConfig();
      expect(config.heartbeat.maxPerHeartbeat).toBe(MAX_PER_HEARTBEAT);
      expect(config.heartbeat.enabled).toBeDefined();
    });

    it('应该有存储配置', () => {
      const config = resolveCommitmentsConfig();
      expect(config.store.atomicWrites).toBeDefined();
      expect(config.store.autoSaveIntervalMs).toBeGreaterThan(0);
    });
  });

  describe('resolveCommitmentTimezone', () => {
    it('应该返回默认时区', () => {
      const tz = resolveCommitmentTimezone();
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
    });

    it('应该从配置中读取时区', () => {
      const tz = resolveCommitmentTimezone({ commitments: { timezone: 'America/New_York' } });
      expect(tz).toBe('America/New_York');
    });

    it('空配置返回默认时区', () => {
      const tz = resolveCommitmentTimezone({});
      expect(typeof tz).toBe('string');
    });
  });

  describe('priorityToNumber', () => {
    it('应该将优先级转换为数字', () => {
      expect(priorityToNumber('urgent')).toBe(4);
      expect(priorityToNumber('high')).toBe(3);
      expect(priorityToNumber('medium')).toBe(2);
      expect(priorityToNumber('low')).toBe(1);
    });

    it('未知优先级返回默认值', () => {
      const result = priorityToNumber('unknown' as CommitmentPriority);
      expect(typeof result).toBe('number');
    });
  });

  describe('numberToPriority', () => {
    it('应该将数字转换为优先级', () => {
      expect(numberToPriority(4)).toBe('urgent');
      expect(numberToPriority(3)).toBe('high');
      expect(numberToPriority(2)).toBe('medium');
      expect(numberToPriority(1)).toBe('low');
    });

    it('超出范围的数字返回最近的优先级', () => {
      expect(numberToPriority(0)).toBe('low');
      expect(numberToPriority(10)).toBe('urgent');
    });
  });
});
