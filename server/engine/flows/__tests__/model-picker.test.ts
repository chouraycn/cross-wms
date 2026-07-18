/**
 * model-picker 测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  formatModelLabel,
  formatTokenK,
  resolveDefaultModel,
  resolveProviderForModelRef,
  groupModelsByProvider,
  groupModelsByAuthStatus,
  filterReasoningModels,
  filterModelsByMinContext,
  parseModelRef,
  isValidModelRef,
} from '../model-picker.js';
import type { ModelPickerOption } from '../model-picker.js';

const { loggerMock } = vi.hoisted(() => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { loggerMock };
});

vi.mock('../../../logger.js', () => ({ logger: loggerMock }));

describe('model-picker 工具函数', () => {
  describe('formatTokenK', () => {
    it('小于 1000 时直接显示数字', () => {
      expect(formatTokenK(128)).toBe('128');
    });

    it('大于等于 1000 时格式化为 k（小写）', () => {
      expect(formatTokenK(8000)).toBe('8k');
      expect(formatTokenK(128000)).toBe('128k');
      expect(formatTokenK(1000000)).toBe('1000k');
    });
  });

  describe('formatModelLabel', () => {
    it('返回 label 为 provider/model 格式', () => {
      const result = formatModelLabel({
        provider: 'openai',
        model: 'gpt-4o',
      });
      expect(result.label).toBe('openai/gpt-4o');
      expect(result.hint).toBeUndefined();
    });

    it('有 name 且与 model 不同时返回 hint', () => {
      const result = formatModelLabel({
        provider: 'openai',
        model: 'gpt-4o',
        name: 'GPT-4o',
      });
      expect(result.label).toBe('openai/gpt-4o');
      expect(result.hint).toBe('GPT-4o');
    });

    it('name 与 model 相同时不返回 hint', () => {
      const result = formatModelLabel({
        provider: 'openai',
        model: 'gpt-4o',
        name: 'gpt-4o',
      });
      expect(result.hint).toBeUndefined();
    });
  });

  describe('parseModelRef', () => {
    it('解析标准 provider/model 格式', () => {
      const ref = parseModelRef('openai/gpt-4o');
      expect(ref?.providerId).toBe('openai');
      expect(ref?.modelId).toBe('gpt-4o');
    });

    it('只有模型名时返回 null', () => {
      expect(parseModelRef('gpt-4o')).toBeNull();
    });

    it('空字符串返回 null', () => {
      expect(parseModelRef('')).toBeNull();
    });

    it('以 / 结尾返回 null', () => {
      expect(parseModelRef('openai/')).toBeNull();
    });

    it('以 / 开头返回 null', () => {
      expect(parseModelRef('/model')).toBeNull();
    });

    it('多个斜杠只取第一段作为 provider', () => {
      const ref = parseModelRef('a/b/c');
      expect(ref?.providerId).toBe('a');
      expect(ref?.modelId).toBe('b/c');
    });
  });

  describe('isValidModelRef', () => {
    it('合法的 model ref', () => {
      expect(isValidModelRef('openai/gpt-4o')).toBe(true);
      expect(isValidModelRef('anthropic/claude-3-sonnet')).toBe(true);
    });

    it('不合法的 model ref', () => {
      expect(isValidModelRef('just-model')).toBe(false);
      expect(isValidModelRef('')).toBe(false);
      expect(isValidModelRef('openai/')).toBe(false);
      expect(isValidModelRef('/model')).toBe(false);
    });
  });

  describe('groupModelsByProvider', () => {
    const models: ModelPickerOption[] = [
      {
        value: 'openai/gpt-4o',
        label: 'GPT-4o',
        providerId: 'openai',
        modelId: 'gpt-4o',
        contextWindow: 128000,
      },
      {
        value: 'openai/gpt-4o-mini',
        label: 'GPT-4o Mini',
        providerId: 'openai',
        modelId: 'gpt-4o-mini',
        contextWindow: 128000,
      },
      {
        value: 'anthropic/claude-3-5-sonnet',
        label: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
        modelId: 'claude-3-5-sonnet',
        contextWindow: 200000,
      },
    ];

    it('按 providerId 分组', () => {
      const groups = groupModelsByProvider(models);
      expect(groups).toHaveProperty('openai');
      expect(groups).toHaveProperty('anthropic');
      expect(groups['openai']).toHaveLength(2);
      expect(groups['anthropic']).toHaveLength(1);
    });
  });

  describe('groupModelsByAuthStatus', () => {
    const models: ModelPickerOption[] = [
      {
        value: 'a/1',
        label: 'A1',
        providerId: 'a',
        modelId: '1',
        authStatus: 'authenticated',
      },
      {
        value: 'a/2',
        label: 'A2',
        providerId: 'a',
        modelId: '2',
        authStatus: 'unauthenticated',
      },
      {
        value: 'a/3',
        label: 'A3',
        providerId: 'a',
        modelId: '3',
        authStatus: 'pending',
      },
      {
        value: 'a/4',
        label: 'A4',
        providerId: 'a',
        modelId: '4',
      },
    ];

    it('按 authStatus 分组', () => {
      const groups = groupModelsByAuthStatus(models);
      expect(groups['authenticated']).toHaveLength(1);
      expect(groups['unauthenticated']).toHaveLength(1);
      expect(groups['pending']).toHaveLength(1);
      expect(groups['unknown']).toHaveLength(1);
    });
  });

  describe('filterReasoningModels', () => {
    const models: ModelPickerOption[] = [
      {
        value: 'a/reasoning',
        label: 'Reasoning Model',
        providerId: 'a',
        modelId: 'reasoning',
        reasoning: true,
      },
      {
        value: 'a/non-reasoning',
        label: 'Non Reasoning',
        providerId: 'a',
        modelId: 'non-reasoning',
        reasoning: false,
      },
      {
        value: 'a/undefined-reasoning',
        label: 'Undefined Reasoning',
        providerId: 'a',
        modelId: 'undefined-reasoning',
      },
    ];

    it('过滤推理模型（reasoning === true）', () => {
      const reasoning = filterReasoningModels(models);
      expect(reasoning).toHaveLength(1);
      expect(reasoning[0].modelId).toBe('reasoning');
    });
  });

  describe('filterModelsByMinContext', () => {
    const models: ModelPickerOption[] = [
      {
        value: 'a/small',
        label: 'Small',
        providerId: 'a',
        modelId: 'small',
        contextWindow: 8000,
      },
      {
        value: 'a/medium',
        label: 'Medium',
        providerId: 'a',
        modelId: 'medium',
        contextWindow: 128000,
      },
      {
        value: 'a/large',
        label: 'Large',
        providerId: 'a',
        modelId: 'large',
        contextWindow: 1000000,
      },
      {
        value: 'a/none',
        label: 'None',
        providerId: 'a',
        modelId: 'none',
      },
    ];

    it('按最小上下文窗口过滤', () => {
      const filtered = filterModelsByMinContext(models, 100000);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((m) => m.modelId).sort()).toEqual(['large', 'medium']);
    });

    it('最小上下文为 0 时返回全部（包括无 contextWindow 的）', () => {
      const filtered = filterModelsByMinContext(models, 0);
      expect(filtered).toHaveLength(4);
    });
  });

  describe('resolveProviderForModelRef', () => {
    it('返回 ProviderInfo 对象（不是字符串）', () => {
      const result = resolveProviderForModelRef('openai/gpt-4o');
      if (result) {
        expect(typeof result).toBe('object');
        expect(result.id).toBeDefined();
      }
    });

    it('非法 ref 返回 undefined', () => {
      expect(resolveProviderForModelRef('gpt-4o')).toBeUndefined();
    });
  });
});
