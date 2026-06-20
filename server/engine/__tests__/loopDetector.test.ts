import { describe, it, expect } from 'vitest';
import { LoopDetector } from '../loopDetector.js';
import type { Observation } from '../observer.js';

describe('LoopDetector', () => {
  it('should not detect loop on first observation', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'ok',
      assessment: { level: 'success', reason: 'ok', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    const result = ld.detectLoop(obs, 0);
    expect(result.isLoop).toBe(false);
    expect(result.similarity).toBe(0);
  });

  it('should detect loop with identical observations', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'error timeout',
      assessment: { level: 'error', reason: 'timeout', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    // 连续 3 轮相同
    ld.detectLoop(obs, 0);
    const r1 = ld.detectLoop(obs, 1);
    expect(r1.isLoop).toBe(false); // 1 轮不够
    const r2 = ld.detectLoop(obs, 2);
    expect(r2.isLoop).toBe(false); // 2 轮不够
    const r3 = ld.detectLoop(obs, 3);
    expect(r3.isLoop).toBe(true);  // 3 轮触发
    expect(r3.consecutiveCount).toBe(3);
  });

  it('should reset consecutive count on different observations', () => {
    const ld = new LoopDetector();
    const obs1: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'error timeout',
      assessment: { level: 'error', reason: 'timeout', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    const obs2: Observation[] = [{
      toolCall: { name: 'test2', arguments: {} },
      result: 'success',
      assessment: { level: 'success', reason: 'ok', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    ld.detectLoop(obs1, 0);
    ld.detectLoop(obs1, 1);
    const r = ld.detectLoop(obs2, 2);
    expect(r.isLoop).toBe(false);
    expect(r.consecutiveCount).toBe(0);
  });

  it('should return switch_tool on first escalation', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'error',
      assessment: { level: 'error', reason: 'fail', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    for (let i = 0; i < 4; i++) {
      ld.detectLoop(obs, i);
    }
    const loopResult = ld.detectLoop(obs, 4);
    const strategy = ld.getEscalationStrategy(loopResult);
    expect(strategy.action).toBe('switch_tool');
  });

  it('should return replan on second escalation', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'error',
      assessment: { level: 'error', reason: 'fail', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    for (let i = 0; i < 4; i++) {
      ld.detectLoop(obs, i);
    }
    const r1 = ld.detectLoop(obs, 4);
    ld.getEscalationStrategy(r1); // 第一次升级
    const r2 = ld.detectLoop(obs, 5);
    const strategy = ld.getEscalationStrategy(r2);
    expect(strategy.action).toBe('replan');
  });

  it('should return ask_user on third escalation', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'error',
      assessment: { level: 'error', reason: 'fail', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    for (let i = 0; i < 4; i++) {
      ld.detectLoop(obs, i);
    }
    const r1 = ld.detectLoop(obs, 4);
    ld.getEscalationStrategy(r1);
    const r2 = ld.detectLoop(obs, 5);
    ld.getEscalationStrategy(r2);
    const r3 = ld.detectLoop(obs, 6);
    const strategy = ld.getEscalationStrategy(r3);
    expect(strategy.action).toBe('ask_user');
  });

  it('should suggest alternative tool for sql_error', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'db_exec', arguments: {} },
      result: 'SQLITE_ERROR',
      assessment: { level: 'error', reason: 'sql_error', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    for (let i = 0; i < 4; i++) {
      ld.detectLoop(obs, i);
    }
    const result = ld.detectLoop(obs, 4);
    const strategy = ld.getEscalationStrategy(result);
    expect(strategy.alternativeToolName).toBe('db_query');
  });

  it('should suggest alternative tool for network_timeout', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'web_fetch', arguments: {} },
      result: 'timeout ETIMEDOUT',
      assessment: { level: 'error', reason: 'timeout', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    for (let i = 0; i < 4; i++) {
      ld.detectLoop(obs, i);
    }
    const result = ld.detectLoop(obs, 4);
    const strategy = ld.getEscalationStrategy(result);
    expect(strategy.alternativeToolName).toBe('web_search');
  });

  it('should reset state correctly', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'error',
      assessment: { level: 'error', reason: 'fail', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    for (let i = 0; i < 4; i++) {
      ld.detectLoop(obs, i);
    }
    ld.reset();
    expect(ld.getHistory()).toHaveLength(0);
  });

  it('should handle empty observations', () => {
    const ld = new LoopDetector();
    const result = ld.detectLoop([], 0);
    expect(result.isLoop).toBe(false);
    expect(result.errorType).toBe('none');
  });

  it('should cap history size at MAX_HISTORY_SIZE', () => {
    const ld = new LoopDetector();
    const obs: Observation[] = [{
      toolCall: { name: 'test', arguments: {} },
      result: 'ok',
      assessment: { level: 'success', reason: 'ok', shouldRetry: false, shouldAdjustStrategy: false, maxRetries: 0 },
    }];
    for (let i = 0; i < 25; i++) {
      ld.detectLoop(obs, i);
    }
    expect(ld.getHistory().length).toBeLessThanOrEqual(20);
  });
});
