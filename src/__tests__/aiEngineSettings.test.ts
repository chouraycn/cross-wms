import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeWithDefaults } from '../contexts/AppSettingsContext';
import type { AiEngineConfig, ToolProfile, CompactionStrategy } from '../contexts/AppSettingsContext';

describe('AI 引擎配置 - 工具 Profile 和上下文压缩', () => {
  describe('默认配置', () => {
    it('默认 toolProfile 应为 full', () => {
      expect(DEFAULT_SETTINGS.aiEngine.toolProfile).toBe('full');
    });

    it('默认 compaction.enabled 应为 true', () => {
      expect(DEFAULT_SETTINGS.aiEngine.compaction.enabled).toBe(true);
    });

    it('默认 compaction.strategy 应为 semantic', () => {
      expect(DEFAULT_SETTINGS.aiEngine.compaction.strategy).toBe('semantic');
    });

    it('默认 compaction.thresholdRatio 应为 0.75', () => {
      expect(DEFAULT_SETTINGS.aiEngine.compaction.thresholdRatio).toBe(0.75);
    });

    it('默认 compaction.preserveRecent 应为 6', () => {
      expect(DEFAULT_SETTINGS.aiEngine.compaction.preserveRecent).toBe(6);
    });
  });

  describe('mergeWithDefaults - 配置迁移', () => {
    it('旧版本配置（无 toolProfile 和 compaction）应合并默认值', () => {
      const oldConfig = {
        aiEngine: {
          defaultExecutionMode: 'legacy' as const,
          defaultQueueMode: 'followup' as const,
          maxHistoryTurns: 0,
        },
      };

      const merged = mergeWithDefaults(oldConfig as any);

      expect(merged.aiEngine.toolProfile).toBe('full');
      expect(merged.aiEngine.compaction.enabled).toBe(true);
      expect(merged.aiEngine.compaction.strategy).toBe('semantic');
      expect(merged.aiEngine.compaction.thresholdRatio).toBe(0.75);
      expect(merged.aiEngine.compaction.preserveRecent).toBe(6);
    });

    it('部分 compaction 配置应与默认值深度合并', () => {
      const partialConfig = {
        aiEngine: {
          toolProfile: 'coding' as ToolProfile,
          compaction: {
            strategy: 'truncation' as CompactionStrategy,
            thresholdRatio: 0.85,
          },
        },
      };

      const merged = mergeWithDefaults(partialConfig as any);

      expect(merged.aiEngine.toolProfile).toBe('coding');
      expect(merged.aiEngine.compaction.enabled).toBe(true);
      expect(merged.aiEngine.compaction.strategy).toBe('truncation');
      expect(merged.aiEngine.compaction.thresholdRatio).toBe(0.85);
      expect(merged.aiEngine.compaction.preserveRecent).toBe(6);
    });

    it('完整 compaction 配置应保留用户设置', () => {
      const fullConfig = {
        aiEngine: {
          toolProfile: 'minimal' as ToolProfile,
          compaction: {
            enabled: false,
            strategy: 'extractive' as CompactionStrategy,
            thresholdRatio: 0.5,
            preserveRecent: 3,
          },
        },
      };

      const merged = mergeWithDefaults(fullConfig as any);

      expect(merged.aiEngine.toolProfile).toBe('minimal');
      expect(merged.aiEngine.compaction.enabled).toBe(false);
      expect(merged.aiEngine.compaction.strategy).toBe('extractive');
      expect(merged.aiEngine.compaction.thresholdRatio).toBe(0.5);
      expect(merged.aiEngine.compaction.preserveRecent).toBe(3);
    });
  });

  describe('AiEngineConfig 类型完整性', () => {
    it('AiEngineConfig 应包含所有必要字段', () => {
      const config: AiEngineConfig = DEFAULT_SETTINGS.aiEngine;

      expect(config).toHaveProperty('defaultExecutionMode');
      expect(config).toHaveProperty('defaultQueueMode');
      expect(config).toHaveProperty('maxHistoryTurns');
      expect(config).toHaveProperty('toolProfile');
      expect(config).toHaveProperty('compaction');
      expect(config.compaction).toHaveProperty('enabled');
      expect(config.compaction).toHaveProperty('strategy');
      expect(config.compaction).toHaveProperty('thresholdRatio');
      expect(config.compaction).toHaveProperty('preserveRecent');
    });

    it('ToolProfile 类型应支持四个值', () => {
      const profiles: ToolProfile[] = ['minimal', 'coding', 'messaging', 'full'];
      expect(profiles).toHaveLength(4);
    });

    it('CompactionStrategy 类型应支持三个值', () => {
      const strategies: CompactionStrategy[] = ['semantic', 'extractive', 'truncation'];
      expect(strategies).toHaveLength(3);
    });
  });
});
