import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  coerceAuthProfileState,
  mergeAuthProfileState,
  loadPersistedAuthProfileState,
  buildPersistedAuthProfileState,
  savePersistedAuthProfileState,
} from '../state.js';
import type { AuthProfileState, AuthProfileStateStore } from '../state.js';

describe('state', () => {
  describe('coerceAuthProfileState', () => {
    it('应返回空对象当输入为 null', () => {
      const result = coerceAuthProfileState(null);
      expect(result).toEqual({});
    });

    it('应返回空对象当输入为 undefined', () => {
      const result = coerceAuthProfileState(undefined);
      expect(result).toEqual({});
    });

    it('应返回空对象当输入为非对象类型', () => {
      expect(coerceAuthProfileState('string')).toEqual({});
      expect(coerceAuthProfileState(123)).toEqual({});
      expect(coerceAuthProfileState(true)).toEqual({});
    });

    it('应返回空对象当输入为空数组', () => {
      const result = coerceAuthProfileState([]);
      expect(result).toEqual({});
    });

    it('应返回空对象当输入为空对象', () => {
      const result = coerceAuthProfileState({});
      expect(result).toEqual({});
    });

    it('应正确规范化有效的 order 数据', () => {
      const input = {
        order: {
          openai: ['profile1', 'profile2'],
          anthropic: ['profile3'],
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.order).toEqual({
        openai: ['profile1', 'profile2'],
        anthropic: ['profile3'],
      });
    });

    it('应规范化 provider ID 为小写并去除空格', () => {
      const input = {
        order: {
          '  OpenAI  ': ['profile1'],
          'ANTHROPIC': ['profile2'],
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.order).toEqual({
        openai: ['profile1'],
        anthropic: ['profile2'],
      });
    });

    it('应过滤掉无效的 order 条目', () => {
      const input = {
        order: {
          openai: ['profile1', '', '  ', null, undefined, 123],
          '': ['profile3'],
          '  ': ['profile4'],
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.order).toEqual({
        openai: ['profile1'],
      });
    });

    it('应过滤掉非数组类型的 order 值', () => {
      const input = {
        order: {
          openai: 'not-an-array',
          anthropic: 123,
          valid: ['profile1'],
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.order).toEqual({
        valid: ['profile1'],
      });
    });

    it('应正确规范化 lastGood 数据', () => {
      const input = {
        lastGood: {
          openai: 'profile1',
          anthropic: 'profile2',
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.lastGood).toEqual({
        openai: 'profile1',
        anthropic: 'profile2',
      });
    });

    it('应过滤掉无效的 lastGood 条目', () => {
      const input = {
        lastGood: {
          openai: '',
          anthropic: '  ',
          '': 'profile3',
          '  ': 'profile4',
          valid: 'profile5',
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.lastGood).toEqual({
        valid: 'profile5',
      });
    });

    it('应正确规范化 usageStats 数据', () => {
      const input = {
        usageStats: {
          profile1: {
            lastUsed: 1234567890,
            errorCount: 5,
            lastFailureAt: 1234567891,
          },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.usageStats).toEqual({
        profile1: {
          lastUsed: 1234567890,
          errorCount: 5,
          lastFailureAt: 1234567891,
        },
      });
    });

    it('应过滤掉无效的 usageStats 条目', () => {
      const input = {
        usageStats: {
          '': { lastUsed: 123 },
          '  ': { lastUsed: 456 },
          profile1: null,
          profile2: 'not-an-object',
          validProfile: { errorCount: 10 },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.usageStats).toEqual({
        validProfile: { errorCount: 10 },
      });
    });

    it('应正确处理 blockedReason 和 blockedSource 枚举值', () => {
      const input = {
        usageStats: {
          profile1: {
            blockedReason: 'subscription_limit',
            blockedSource: 'codex_rate_limits',
            blockedUntil: 1234567890,
          },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1).toEqual({
        blockedReason: 'subscription_limit',
        blockedSource: 'codex_rate_limits',
        blockedUntil: 1234567890,
      });
    });

    it('应过滤掉无效的 blockedReason 枚举值', () => {
      const input = {
        usageStats: {
          profile1: {
            blockedReason: 'invalid_reason',
            blockedSource: 'invalid_source',
          },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1).toBeUndefined();
    });

    it('应正确处理 failureCounts', () => {
      const input = {
        usageStats: {
          profile1: {
            failureCounts: {
              auth: 3,
              timeout: 5,
              rate_limit: 2,
            },
          },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1?.failureCounts).toEqual({
        auth: 3,
        timeout: 5,
        rate_limit: 2,
      });
    });

    it('应过滤掉无效的 failureCounts 条目', () => {
      const input = {
        usageStats: {
          profile1: {
            failureCounts: {
              invalid_reason: 10,
              auth: 0,
              timeout: -5,
              rate_limit: 3,
              billing: NaN,
            },
          },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1?.failureCounts).toEqual({
        rate_limit: 3,
      });
    });

    it('应处理完整的状态对象', () => {
      const input = {
        order: {
          openai: ['p1', 'p2'],
        },
        lastGood: {
          openai: 'p1',
        },
        usageStats: {
          p1: {
            lastUsed: 123,
            errorCount: 5,
          },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result).toEqual(input);
    });

    it('应过滤掉非 Finite 数值', () => {
      const input = {
        usageStats: {
          profile1: {
            lastUsed: NaN,
            errorCount: Infinity,
            lastFailureAt: -Infinity,
            blockedUntil: 'not-a-number',
          },
        },
      };
      const result = coerceAuthProfileState(input);
      expect(result.usageStats).toBeUndefined();
    });
  });

  describe('mergeAuthProfileState', () => {
    it('应返回 undefined 当两个状态都为空', () => {
      const result = mergeAuthProfileState({}, {});
      expect(result).toEqual({});
    });

    it('应返回 override 的副本当 base 为空', () => {
      const override: AuthProfileState = {
        order: { openai: ['p1'] },
        lastGood: { openai: 'p1' },
      };
      const result = mergeAuthProfileState({}, override);
      expect(result).toEqual(override);
    });

    it('应返回 base 的副本当 override 为空', () => {
      const base: AuthProfileState = {
        order: { openai: ['p1'] },
        lastGood: { openai: 'p1' },
      };
      const result = mergeAuthProfileState(base, {});
      expect(result).toEqual(base);
    });

    it('应正确合并 order 字段', () => {
      const base: AuthProfileState = {
        order: { openai: ['p1', 'p2'], anthropic: ['p3'] },
      };
      const override: AuthProfileState = {
        order: { openai: ['p4'], google: ['p5'] },
      };
      const result = mergeAuthProfileState(base, override);
      expect(result.order).toEqual({
        openai: ['p4'],
        anthropic: ['p3'],
        google: ['p5'],
      });
    });

    it('应正确合并 lastGood 字段', () => {
      const base: AuthProfileState = {
        lastGood: { openai: 'p1', anthropic: 'p3' },
      };
      const override: AuthProfileState = {
        lastGood: { openai: 'p2', google: 'p5' },
      };
      const result = mergeAuthProfileState(base, override);
      expect(result.lastGood).toEqual({
        openai: 'p2',
        anthropic: 'p3',
        google: 'p5',
      });
    });

    it('应正确合并 usageStats 字段', () => {
      const base: AuthProfileState = {
        usageStats: {
          p1: { lastUsed: 123, errorCount: 5 },
          p2: { lastUsed: 456 },
        },
      };
      const override: AuthProfileState = {
        usageStats: {
          p1: { lastUsed: 789 },
          p3: { errorCount: 10 },
        },
      };
      const result = mergeAuthProfileState(base, override);
      expect(result.usageStats).toEqual({
        p1: { lastUsed: 789 },
        p2: { lastUsed: 456 },
        p3: { errorCount: 10 },
      });
    });

    it('应处理部分字段为空的情况', () => {
      const base: AuthProfileState = {
        order: { openai: ['p1'] },
      };
      const override: AuthProfileState = {
        lastGood: { openai: 'p1' },
      };
      const result = mergeAuthProfileState(base, override);
      expect(result).toEqual({
        order: { openai: ['p1'] },
        lastGood: { openai: 'p1' },
      });
    });

    it('不应修改原始状态对象', () => {
      const base: AuthProfileState = {
        order: { openai: ['p1'] },
      };
      const override: AuthProfileState = {
        order: { anthropic: ['p2'] },
      };
      const baseBefore = JSON.stringify(base);
      const overrideBefore = JSON.stringify(override);

      mergeAuthProfileState(base, override);

      expect(JSON.stringify(base)).toBe(baseBefore);
      expect(JSON.stringify(override)).toBe(overrideBefore);
    });
  });

  describe('buildPersistedAuthProfileState', () => {
    it('应返回 null 当状态为空对象', () => {
      const result = buildPersistedAuthProfileState({});
      expect(result).toBeNull();
    });

    it('应返回 null 当所有字段都为 undefined', () => {
      const result = buildPersistedAuthProfileState({
        order: undefined,
        lastGood: undefined,
        usageStats: undefined,
      });
      expect(result).toBeNull();
    });

    it('应构建有效的 AuthProfileStateStore 对象', () => {
      const state: AuthProfileState = {
        order: { openai: ['p1'] },
        lastGood: { openai: 'p1' },
        usageStats: { p1: { errorCount: 5 } },
      };
      const result = buildPersistedAuthProfileState(state);

      expect(result).toEqual({
        version: 1,
        order: { openai: ['p1'] },
        lastGood: { openai: 'p1' },
        usageStats: { p1: { errorCount: 5 } },
      });
    });

    it('应包含 version 字段', () => {
      const result = buildPersistedAuthProfileState({
        order: { openai: ['p1'] },
      });
      expect(result?.version).toBe(1);
    });

    it('应只包含有值的字段', () => {
      const result = buildPersistedAuthProfileState({
        order: { openai: ['p1'] },
      });
      expect(result).toHaveProperty('order');
      expect(result).not.toHaveProperty('lastGood');
      expect(result).not.toHaveProperty('usageStats');
    });

    it('应先规范化输入状态', () => {
      const result = buildPersistedAuthProfileState({
        order: { '': [] },
      } as unknown);
      expect(result).toBeNull();
    });
  });

  describe('loadPersistedAuthProfileState', () => {
    it('应加载并规范化持久化的状态', () => {
      const state: AuthProfileState = {
        order: { openai: ['p1'] },
        lastGood: { openai: 'p1' },
      };
      savePersistedAuthProfileState(state);

      const loaded = loadPersistedAuthProfileState();
      expect(loaded).toEqual(state);
    });

    it('应返回空对象当没有持久化状态', () => {
      savePersistedAuthProfileState({});
      const loaded = loadPersistedAuthProfileState();
      expect(loaded).toEqual({});
    });
  });

  describe('savePersistedAuthProfileState', () => {
    it('应保存状态并返回 payload', () => {
      const state: AuthProfileState = {
        order: { openai: ['p1'] },
      };
      const result = savePersistedAuthProfileState(state);

      expect(result).not.toBeNull();
      expect(result?.order).toEqual({ openai: ['p1'] });
    });

    it('应保存 null 当状态为空', () => {
      const result = savePersistedAuthProfileState({});
      expect(result).toBeNull();
    });

    it('应在状态改变时更新持久化存储', () => {
      const state1: AuthProfileState = {
        order: { openai: ['p1'] },
      };
      const state2: AuthProfileState = {
        order: { openai: ['p2'] },
      };

      savePersistedAuthProfileState(state1);
      const loaded1 = loadPersistedAuthProfileState();
      expect(loaded1.order).toEqual({ openai: ['p1'] });

      savePersistedAuthProfileState(state2);
      const loaded2 = loadPersistedAuthProfileState();
      expect(loaded2.order).toEqual({ openai: ['p2'] });
    });

    it('应在状态相同时不更新存储', () => {
      const state: AuthProfileState = {
        order: { openai: ['p1'] },
      };

      savePersistedAuthProfileState(state);
      const result1 = savePersistedAuthProfileState(state);

      expect(result1?.order).toEqual({ openai: ['p1'] });
    });
  });

  describe('integration scenarios', () => {
    it('应处理完整的状态生命周期', () => {
      const initialState: AuthProfileState = {
        order: {
          openai: ['profile1', 'profile2'],
          anthropic: ['profile3'],
        },
        lastGood: {
          openai: 'profile1',
        },
        usageStats: {
          profile1: {
            lastUsed: 1234567890,
            errorCount: 0,
          },
          profile2: {
            lastUsed: 1234567891,
            errorCount: 2,
            failureCounts: {
              timeout: 2,
            },
          },
        },
      };

      savePersistedAuthProfileState(initialState);
      const loaded = loadPersistedAuthProfileState();

      expect(loaded).toEqual(initialState);

      const update: AuthProfileState = {
        usageStats: {
          profile2: {
            lastUsed: 1234567892,
            errorCount: 3,
            failureCounts: {
              timeout: 3,
            },
          },
        },
      };

      const merged = mergeAuthProfileState(loaded, update);
      savePersistedAuthProfileState(merged);
      const finalLoaded = loadPersistedAuthProfileState();

      expect(finalLoaded.usageStats?.profile2?.errorCount).toBe(3);
      expect(finalLoaded.usageStats?.profile2?.failureCounts?.timeout).toBe(3);
      expect(finalLoaded.order).toEqual(initialState.order);
    });

    it('应正确处理无效输入并恢复为有效状态', () => {
      const invalidInput = {
        order: {
          '': [''],
          '  ': ['  '],
        },
        lastGood: {
          '': '',
        },
        usageStats: {
          '': null,
        },
      };

      const result = coerceAuthProfileState(invalidInput);
      expect(result).toEqual({});

      const payload = buildPersistedAuthProfileState(result);
      expect(payload).toBeNull();
    });

    it('应处理所有有效的 failure reason 类型', () => {
      const failureReasons = [
        'auth',
        'auth_permanent',
        'format',
        'overloaded',
        'rate_limit',
        'billing',
        'timeout',
        'model_not_found',
        'session_expired',
        'empty_response',
        'no_error_details',
        'unclassified',
        'unknown',
      ];

      const failureCounts: Record<string, number> = {};
      failureReasons.forEach((reason, index) => {
        failureCounts[reason] = index + 1;
      });

      const input = {
        usageStats: {
          profile1: {
            failureCounts,
          },
        },
      };

      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1?.failureCounts).toEqual(failureCounts);
    });

    it('应处理所有有效的 blocked reason 和 source 类型', () => {
      const blockedReasons = ['subscription_limit'];
      const blockedSources = ['codex_rate_limits', 'wham'];

      blockedReasons.forEach((reason) => {
        blockedSources.forEach((source) => {
          const input = {
            usageStats: {
              profile1: {
                blockedReason: reason,
                blockedSource: source,
                blockedUntil: 1234567890,
              },
            },
          };

          const result = coerceAuthProfileState(input);
          expect(result.usageStats?.profile1?.blockedReason).toBe(reason);
          expect(result.usageStats?.profile1?.blockedSource).toBe(source);
        });
      });
    });

    it('应处理 cooldown 相关字段', () => {
      const input = {
        usageStats: {
          profile1: {
            cooldownUntil: 1234567890,
            cooldownReason: 'rate_limit',
            cooldownModel: 'gpt-4',
          },
        },
      };

      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1).toEqual({
        cooldownUntil: 1234567890,
        cooldownReason: 'rate_limit',
        cooldownModel: 'gpt-4',
      });
    });

    it('应处理 disabled 相关字段', () => {
      const input = {
        usageStats: {
          profile1: {
            disabledUntil: 1234567890,
            disabledReason: 'auth_permanent',
          },
        },
      };

      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1).toEqual({
        disabledUntil: 1234567890,
        disabledReason: 'auth_permanent',
      });
    });

    it('应处理字符串数值转换', () => {
      const input = {
        usageStats: {
          profile1: {
            lastUsed: '1234567890' as unknown,
            errorCount: '5' as unknown,
          },
        },
      };

      const result = coerceAuthProfileState(input);
      expect(result.usageStats).toBeUndefined();
    });

    it('应处理浮点数的截断', () => {
      const input = {
        usageStats: {
          profile1: {
            failureCounts: {
              auth: 3.7,
              timeout: 5.2,
            },
          },
        },
      };

      const result = coerceAuthProfileState(input);
      expect(result.usageStats?.profile1?.failureCounts).toEqual({
        auth: 3,
        timeout: 5,
      });
    });

    it('应处理多个 provider 的 order', () => {
      const input = {
        order: {
          openai: ['p1', 'p2', 'p3'],
          anthropic: ['p4'],
          google: ['p5', 'p6'],
          azure: [],
        },
      };

      const result = coerceAuthProfileState(input);
      expect(Object.keys(result.order || {})).toHaveLength(3);
      expect(result.order?.azure).toBeUndefined();
    });
  });
});