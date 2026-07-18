import { describe, it, expect } from 'vitest';
import {
  applyModelOverrideToSessionEntry,
  parseModelOverrideString,
  formatModelOverride,
  isDefaultModelOverride,
  type ModelOverrideSelection,
} from '../model-overrides.js';
import type { SessionRecord } from '../types.js';

function createMockSession(): SessionRecord {
  return {
    id: 'test-session-id',
    key: 'test-session-key',
    status: 'active',
    metadata: {},
    stats: {
      messageCount: 0,
      toolCallCount: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      totalDurationMs: 0,
    },
  };
}

describe('model-overrides — 模型覆盖配置', () => {
  describe('applyModelOverrideToSessionEntry', () => {
    it('应用非默认模型覆盖', () => {
      const entry = createMockSession();
      const selection: ModelOverrideSelection = {
        provider: 'openai',
        model: 'gpt-4',
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });
      expect(result.updated).toBe(true);
      expect(entry.metadata.provider).toBe('openai');
      expect(entry.metadata.modelId).toBe('gpt-4');
    });

    it('应用默认模型覆盖（清除现有覆盖）', () => {
      const entry = createMockSession();
      entry.metadata.provider = 'old-provider';
      entry.metadata.modelId = 'old-model';

      const selection: ModelOverrideSelection = {
        provider: 'default-provider',
        model: 'default-model',
        isDefault: true,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });
      expect(result.updated).toBe(true);
      expect(entry.metadata.provider).toBeUndefined();
      expect(entry.metadata.modelId).toBeUndefined();
    });

    it('相同的模型不触发更新', () => {
      const entry = createMockSession();
      entry.metadata.provider = 'openai';
      entry.metadata.modelId = 'gpt-4';

      const selection: ModelOverrideSelection = {
        provider: 'openai',
        model: 'gpt-4',
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });
      expect(result.updated).toBe(false);
    });

    it('应用配置文件覆盖', () => {
      const entry = createMockSession();
      const selection: ModelOverrideSelection = {
        provider: 'openai',
        model: 'gpt-4',
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: 'my-profile',
        profileOverrideSource: 'user',
      });

      expect(result.updated).toBe(true);
      expect(entry.metadata.tags?.authProfile).toBe('my-profile');
      expect(entry.metadata.tags?.authProfileSource).toBe('user');
    });

    it('preserveAuthProfileOverride 保留现有配置文件', () => {
      const entry = createMockSession();
      entry.metadata.tags = {
        authProfile: 'existing-profile',
        authProfileSource: 'user',
      };

      const selection: ModelOverrideSelection = {
        provider: 'openai',
        model: 'gpt-4',
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        preserveAuthProfileOverride: true,
      });

      expect(result.updated).toBe(true);
      expect(entry.metadata.tags?.authProfile).toBe('existing-profile');
    });

    it('更新时更新 lastActivityAt', () => {
      const entry = createMockSession();
      const oldActivityTime = entry.stats.lastActivityAt;

      const selection: ModelOverrideSelection = {
        provider: 'openai',
        model: 'gpt-4',
      };

      applyModelOverrideToSessionEntry({ entry, selection });
      expect(entry.stats.lastActivityAt).toBeGreaterThanOrEqual(oldActivityTime);
    });
  });

  describe('parseModelOverrideString', () => {
    it('解析 provider/model 格式', () => {
      const result = parseModelOverrideString('openai/gpt-4');
      expect(result).not.toBeUndefined();
      expect(result?.provider).toBe('openai');
      expect(result?.model).toBe('gpt-4');
    });

    it('使用默认提供者解析仅模型', () => {
      const result = parseModelOverrideString('gpt-4', 'openai');
      expect(result).not.toBeUndefined();
      expect(result?.provider).toBe('openai');
      expect(result?.model).toBe('gpt-4');
    });

    it('没有默认提供者时，仅模型返回 undefined', () => {
      const result = parseModelOverrideString('gpt-4');
      expect(result).toBeUndefined();
    });

    it('对空字符串返回 undefined', () => {
      expect(parseModelOverrideString('')).toBeUndefined();
      expect(parseModelOverrideString('  ')).toBeUndefined();
    });
  });

  describe('formatModelOverride', () => {
    it('格式化为 provider/model 字符串', () => {
      const selection: ModelOverrideSelection = {
        provider: 'openai',
        model: 'gpt-4',
      };
      expect(formatModelOverride(selection)).toBe('openai/gpt-4');
    });
  });

  describe('isDefaultModelOverride', () => {
    it('对默认模型返回 true', () => {
      const selection: ModelOverrideSelection = {
        provider: 'default-provider',
        model: 'default-model',
      };
      expect(isDefaultModelOverride(selection, 'default-provider', 'default-model')).toBe(true);
    });

    it('对非默认模型返回 false', () => {
      const selection: ModelOverrideSelection = {
        provider: 'other-provider',
        model: 'other-model',
      };
      expect(isDefaultModelOverride(selection, 'default-provider', 'default-model')).toBe(false);
    });

    it('对 undefined 返回 true', () => {
      expect(isDefaultModelOverride(undefined, 'default-provider', 'default-model')).toBe(true);
    });
  });
});
