// LoopDetector unit tests cover Jaccard similarity calculation, consecutive
// similarity threshold triggering, error-type weighted similarity, and the
// three-step escalation strategy (switch_tool → replan → ask_user).
import { describe, expect, it } from 'vitest';
import { LoopDetector } from '../loopDetector.js';
import type { Observation } from '../observer.js';

function makeObs(
  toolName: string,
  result: string,
  level: 'success' | 'warning' | 'error' = 'success',
  reason?: string,
): Observation {
  return {
    toolCall: { name: toolName, arguments: {} },
    result,
    assessment: {
      level,
      reason: reason ?? '',
      shouldRetry: false,
      shouldAdjustStrategy: false,
      maxRetries: 0,
    },
  };
}

describe('engine/loopDetector — detectLoop basic behavior', () => {
  it('returns isLoop=false on first observation (no history)', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'result A')], 0);
    expect(r.isLoop).toBe(false);
    expect(r.consecutiveCount).toBe(0);
    expect(r.similarity).toBe(0);
    expect(r.errorType).toBe('none');
  });

  it('returns isLoop=false when consecutive results differ significantly', () => {
    const det = new LoopDetector();
    det.detectLoop([makeObs('tool_a', 'apple banana cherry')], 0);
    const r = det.detectLoop([makeObs('tool_b', 'orange grape kiwi')], 1);
    expect(r.isLoop).toBe(false);
    expect(r.consecutiveCount).toBe(0);
  });
});

describe('engine/loopDetector — consecutive similarity triggers loop', () => {
  it('triggers isLoop after threshold consecutive similar results (default=3)', () => {
    const det = new LoopDetector();
    // Identical results → Jaccard=1.0, well above 0.8 threshold.
    // First call establishes baseline (consecutiveCount=0), each subsequent
    // similar result increments consecutiveCount. isLoop triggers when
    // consecutiveCount >= consecutiveThreshold (default 3), so we need
    // 1 baseline + 3 similar = 4 total calls.
    det.detectLoop([makeObs('tool_a', 'same identical output text')], 0);
    det.detectLoop([makeObs('tool_a', 'same identical output text')], 1);
    det.detectLoop([makeObs('tool_a', 'same identical output text')], 2);
    const r = det.detectLoop([makeObs('tool_a', 'same identical output text')], 3);
    expect(r.isLoop).toBe(true);
    expect(r.consecutiveCount).toBe(3);
    expect(r.similarity).toBeGreaterThan(0.8);
  });

  it('does not trigger when only 2 consecutive similar results (below threshold=3)', () => {
    const det = new LoopDetector();
    det.detectLoop([makeObs('tool_a', 'same identical output text')], 0);
    det.detectLoop([makeObs('tool_a', 'same identical output text')], 1);
    const r = det.detectLoop([makeObs('tool_a', 'same identical output text')], 2);
    expect(r.isLoop).toBe(false);
    expect(r.consecutiveCount).toBe(2);
  });

  it('resets consecutive counter on dissimilar result', () => {
    const det = new LoopDetector();
    det.detectLoop([makeObs('tool_a', 'same identical output text')], 0);
    det.detectLoop([makeObs('tool_a', 'same identical output text')], 1);
    // Different result breaks the streak
    const r = det.detectLoop([makeObs('tool_a', 'completely different content here')], 2);
    expect(r.consecutiveCount).toBe(0);
    expect(r.isLoop).toBe(false);
  });
});

describe('engine/loopDetector — error-type weighting', () => {
  it('detects network_timeout error type', () => {
    const det = new LoopDetector();
    det.detectLoop([makeObs('tool_a', 'Error: timeout ETIMEDOUT', 'error')], 0);
    const r = det.detectLoop([makeObs('tool_a', 'Error: timeout ETIMEDOUT', 'error')], 1);
    expect(r.errorType).toBe('network_timeout');
  });

  it('detects file_not_found error type', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'ENOENT: no such file', 'error')], 0);
    expect(r.errorType).toBe('file_not_found');
  });

  it('detects sql_error error type', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'SQLITE_ERROR: syntax error', 'error')], 0);
    expect(r.errorType).toBe('sql_error');
  });

  it('detects connection_refused error type', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'ECONNREFUSED connection refused', 'error')], 0);
    expect(r.errorType).toBe('connection_refused');
  });

  it('detects permission_denied error type', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'permission denied', 'error')], 0);
    expect(r.errorType).toBe('permission_denied');
  });

  it('returns unknown_error for unmatched error reasons', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'something broke', 'error', 'custom reason')], 0);
    // Should fall back to assessment.reason or 'unknown_error'
    expect(['unknown_error', 'custom reason']).toContain(r.errorType);
  });

  it('returns none for success-level observations', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'ok result', 'success')], 0);
    expect(r.errorType).toBe('none');
  });
});

describe('engine/loopDetector — escalation strategy', () => {
  it('returns switch_tool action when isLoop=false', () => {
    const det = new LoopDetector();
    const r = det.detectLoop([makeObs('tool_a', 'fresh unique content')], 0);
    const strat = det.getEscalationStrategy(r);
    expect(strat.action).toBe('switch_tool');
    expect(strat.reason).toContain('未检测到死循环');
  });

  it('escalates switch_tool → replan → ask_user across three loops', () => {
    const det = new LoopDetector();
    // Each round needs 1 baseline + 3 similar = 4 calls to trigger isLoop
    // (default consecutiveThreshold=3).
    for (let round = 0; round < 3; round++) {
      const base = round * 4;
      det.detectLoop([makeObs('tool_a', 'identical')], base);
      det.detectLoop([makeObs('tool_a', 'identical')], base + 1);
      det.detectLoop([makeObs('tool_a', 'identical')], base + 2);
      const r = det.detectLoop([makeObs('tool_a', 'identical')], base + 3);
      expect(r.isLoop).toBe(true);
      const strat = det.getEscalationStrategy(r);
      if (round === 0) expect(strat.action).toBe('switch_tool');
      if (round === 1) expect(strat.action).toBe('replan');
      if (round === 2) expect(strat.action).toBe('ask_user');
    }
  });

  it('switch_tool escalation suggests alternative tool based on error type', () => {
    const det = new LoopDetector();
    // Trigger loop with sql_error (1 baseline + 3 similar = 4 calls)
    det.detectLoop([makeObs('tool_a', 'SQLITE_ERROR: syntax error', 'error')], 0);
    det.detectLoop([makeObs('tool_a', 'SQLITE_ERROR: syntax error', 'error')], 1);
    det.detectLoop([makeObs('tool_a', 'SQLITE_ERROR: syntax error', 'error')], 2);
    const r = det.detectLoop([makeObs('tool_a', 'SQLITE_ERROR: syntax error', 'error')], 3);
    expect(r.isLoop).toBe(true);
    const strat = det.getEscalationStrategy(r);
    expect(strat.action).toBe('switch_tool');
    expect(strat.alternativeToolName).toBe('db_query');
  });

  it('loops back to switch_tool after 3 escalations (modulo)', () => {
    const det = new LoopDetector();
    // Trigger 4 loops (each requires 4 calls: 1 baseline + 3 similar)
    const results: string[] = [];
    for (let round = 0; round < 4; round++) {
      const base = round * 4;
      det.detectLoop([makeObs('tool_a', 'identical text')], base);
      det.detectLoop([makeObs('tool_a', 'identical text')], base + 1);
      det.detectLoop([makeObs('tool_a', 'identical text')], base + 2);
      const r = det.detectLoop([makeObs('tool_a', 'identical text')], base + 3);
      const strat = det.getEscalationStrategy(r);
      results.push(strat.action);
    }
    // level 0→switch_tool, 1→replan, 2→ask_user, 3 (mod 3 = 0)→switch_tool
    expect(results).toEqual(['switch_tool', 'replan', 'ask_user', 'switch_tool']);
  });
});

describe('engine/loopDetector — reset & history', () => {
  it('reset clears all internal state', () => {
    const det = new LoopDetector();
    det.detectLoop([makeObs('tool_a', 'identical')], 0);
    det.detectLoop([makeObs('tool_a', 'identical')], 1);
    expect(det.getHistory().length).toBe(2);
    det.reset();
    expect(det.getHistory().length).toBe(0);
    // After reset, first detection should not loop
    const r = det.detectLoop([makeObs('tool_a', 'identical')], 0);
    expect(r.isLoop).toBe(false);
    expect(r.consecutiveCount).toBe(0);
  });

  it('getHistory returns a defensive copy', () => {
    const det = new LoopDetector();
    det.detectLoop([makeObs('tool_a', 'text')], 0);
    const h1 = det.getHistory();
    det.detectLoop([makeObs('tool_a', 'text2')], 1);
    const h2 = det.getHistory();
    expect(h1.length).toBe(1);
    expect(h2.length).toBe(2);
  });

  it('caps history at MAX_HISTORY_SIZE (20)', () => {
    const det = new LoopDetector();
    for (let i = 0; i < 25; i++) {
      det.detectLoop([makeObs('tool_a', `unique content ${i}`)], i);
    }
    expect(det.getHistory().length).toBe(20);
  });
});

describe('engine/loopDetector — custom thresholds', () => {
  it('supports custom similarity threshold', () => {
    const det = new LoopDetector(0.5); // lower threshold
    // Partially similar results
    det.detectLoop([makeObs('tool_a', 'alpha beta gamma delta')], 0);
    const r = det.detectLoop([makeObs('tool_a', 'alpha beta gamma epsilon')], 1);
    // Jaccard = 3/5 = 0.6 > 0.5, should count
    expect(r.similarity).toBeGreaterThan(0.5);
  });

  it('supports custom consecutive threshold', () => {
    const det = new LoopDetector(0.8, 2); // only 2 consecutive needed
    // 1 baseline + 2 similar = 3 calls to trigger isLoop with threshold=2
    det.detectLoop([makeObs('tool_a', 'identical text')], 0);
    det.detectLoop([makeObs('tool_a', 'identical text')], 1);
    const r = det.detectLoop([makeObs('tool_a', 'identical text')], 2);
    expect(r.isLoop).toBe(true);
    expect(r.consecutiveCount).toBe(2);
  });
});
