/**
 * CircuitBreaker 单元测试
 *
 * v6.0: P0-2 工具熔断器
 * - 初始状态为 closed
 * - 连续 2 次失败变为 half_open，getAlternativeSuggestion 返回建议
 * - 连续 3 次失败变为 open，isOpen 返回 true
 * - recordSuccess 重置为 closed
 * - 未知工具返回 closed
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../engine/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker();
  });

  describe('初始状态', () => {
    it('未知工具状态应为 closed', () => {
      expect(cb.getState('unknown_tool')).toBe('closed');
    });

    it('未知工具 isOpen 应为 false', () => {
      expect(cb.isOpen('unknown_tool')).toBe(false);
    });

    it('未知工具 isHalfOpen 应为 false', () => {
      expect(cb.isHalfOpen('unknown_tool')).toBe(false);
    });
  });

  describe('状态转换：closed -> half_open -> open', () => {
    it('1次失败后仍为 closed', () => {
      const state = cb.recordFailure('web_api_call', 'timeout');
      expect(state).toBe('closed');
      expect(cb.getState('web_api_call')).toBe('closed');
    });

    it('连续2次失败变为 half_open', () => {
      cb.recordFailure('web_api_call', 'timeout');
      const state = cb.recordFailure('web_api_call', 'timeout');
      expect(state).toBe('half_open');
      expect(cb.isHalfOpen('web_api_call')).toBe(true);
    });

    it('连续3次失败变为 open', () => {
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      const state = cb.recordFailure('web_api_call', 'timeout');
      expect(state).toBe('open');
      expect(cb.isOpen('web_api_call')).toBe(true);
    });

    it('不同工具的熔断状态相互独立', () => {
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      expect(cb.isHalfOpen('web_api_call')).toBe(true);
      expect(cb.getState('web_fetch')).toBe('closed');
    });
  });

  describe('getAlternativeSuggestion', () => {
    it('closed 状态返回 null', () => {
      expect(cb.getAlternativeSuggestion('web_api_call')).toBeNull();
    });

    it('half_open 状态返回备选工具建议（有映射的工具）', () => {
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      const suggestion = cb.getAlternativeSuggestion('web_api_call');
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain('web_api_call');
      expect(suggestion).toContain('web_fetch');
      expect(suggestion).toContain('2');
    });

    it('open 状态返回备选工具建议', () => {
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      const suggestion = cb.getAlternativeSuggestion('web_api_call');
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain('3');
    });

    it('无映射的工具返回通用建议', () => {
      cb.recordFailure('custom_unknown_tool', 'error');
      cb.recordFailure('custom_unknown_tool', 'error');
      const suggestion = cb.getAlternativeSuggestion('custom_unknown_tool');
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain('建议换用其他工具或调整参数');
    });
  });

  describe('recordSuccess 重置', () => {
    it('成功执行后重置为 closed', () => {
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      expect(cb.isHalfOpen('web_api_call')).toBe(true);

      cb.recordSuccess('web_api_call');
      expect(cb.getState('web_api_call')).toBe('closed');
      expect(cb.isOpen('web_api_call')).toBe(false);
    });

    it('open 状态成功后重置为 closed', () => {
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      expect(cb.isOpen('web_api_call')).toBe(true);

      cb.recordSuccess('web_api_call');
      expect(cb.getState('web_api_call')).toBe('closed');
    });
  });

  describe('reset 清空所有状态', () => {
    it('reset 清空后所有工具回到 closed', () => {
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');
      cb.recordFailure('web_api_call', 'timeout');

      cb.recordFailure('web_fetch', 'error');
      cb.recordFailure('web_fetch', 'error');

      cb.reset();

      expect(cb.getState('web_api_call')).toBe('closed');
      expect(cb.getState('web_fetch')).toBe('closed');
    });
  });

  describe('getRecord', () => {
    it('未记录的工具返回 undefined', () => {
      expect(cb.getRecord('unknown')).toBeUndefined();
    });

    it('记录后返回正确的记录信息', () => {
      cb.recordFailure('web_api_call', 'timeout error');
      const record = cb.getRecord('web_api_call');
      expect(record).toBeDefined();
      expect(record!.consecutiveFailures).toBe(1);
      expect(record!.lastFailureReason).toBe('timeout error');
      expect(record!.alternativeTool).toBe('web_fetch');
    });
  });
});
