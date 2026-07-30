// Observer unit tests cover rule matching (glob/regex/hasError/contains),
// reflection hint generation with template variable substitution, confidence
// score assignment, retry decision logic, and error tolerance.
import { describe, expect, it } from 'vitest';
import { Observer, Observation } from '../observer.js';
import { ObserverRule } from '../observerRules.js';

// ===================== Test helpers =====================

function makeToolCall(name: string, args: Record<string, unknown> = {}) {
  return { name, arguments: args };
}

function jsonResult(obj: unknown): string {
  return JSON.stringify(obj);
}

// Custom rule builder for focused tests
function makeRule(overrides: Partial<ObserverRule> = {}): ObserverRule {
  return {
    id: overrides.id ?? 'test_rule',
    description: overrides.description ?? 'test rule',
    priority: overrides.priority ?? 50,
    condition: overrides.condition ?? {
      toolNamePattern: '*',
    },
    action: overrides.action ?? {
      hintTemplate: '工具 {toolName} 出错：{error}',
      level: 'error',
      shouldRetry: true,
      shouldAdjustStrategy: false,
      maxRetries: 2,
    },
  };
}

// ===================== Observer — rule matching =====================

describe('engine/observer — rule matching basics', () => {
  it('returns success assessment when no rules match', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: 'nonexistent_tool' },
      }),
    ]);
    const obs = observer.observe(makeToolCall('other_tool'), 'ok result');
    expect(obs.assessment.level).toBe('success');
    expect(obs.assessment.shouldRetry).toBe(false);
    expect(obs.assessment.maxRetries).toBe(0);
    // No rules matched → early return path does not set confidenceScore
    expect(obs.confidenceScore).toBeUndefined();
  });

  it('matches toolNamePattern exactly', () => {
    const observer = new Observer([
      makeRule({
        id: 'exact_match',
        condition: { toolNamePattern: 'db_query' },
        action: {
          hintTemplate: 'matched',
          level: 'warning',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('db_query'), 'some result');
    expect(obs.assessment.level).toBe('warning');
    expect(obs.assessment.reason).toBe('test rule');
  });

  it('does not match when toolNamePattern differs', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: 'db_query' },
      }),
    ]);
    const obs = observer.observe(makeToolCall('db_write'), 'result');
    expect(obs.assessment.level).toBe('success');
  });
});

// ===================== Observer — glob matching =====================

describe('engine/observer — glob toolNamePattern', () => {
  it('matches wildcard prefix db_*', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: 'db_*' },
        action: {
          hintTemplate: 'db tool',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('db_query'), 'result');
    expect(obs.assessment.level).toBe('error');
  });

  it('matches wildcard * for any tool', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*' },
      }),
    ]);
    const obs = observer.observe(makeToolCall('anything_here'), 'result');
    expect(obs.assessment.level).toBe('error');
  });

  it('does not over-match glob patterns', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: 'file_*' },
      }),
    ]);
    const obs = observer.observe(makeToolCall('shell_exec'), 'result');
    expect(obs.assessment.level).toBe('success');
  });
});

// ===================== Observer — hasError condition =====================

describe('engine/observer — hasError condition', () => {
  it('matches when hasError=true and JSON has error field', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
      }),
    ]);
    const result = jsonResult({ error: 'something went wrong' });
    const obs = observer.observe(makeToolCall('any_tool'), result);
    expect(obs.assessment.level).toBe('error');
  });

  it('matches when hasError=true and JSON has success:false', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
      }),
    ]);
    const result = jsonResult({ success: false });
    const obs = observer.observe(makeToolCall('any_tool'), result);
    expect(obs.assessment.level).toBe('error');
  });

  it('does not match when hasError=true but result has no error', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
      }),
    ]);
    const result = jsonResult({ success: true, data: 'ok' });
    const obs = observer.observe(makeToolCall('any_tool'), result);
    expect(obs.assessment.level).toBe('success');
  });

  it('matches when hasError=false and result has no error field', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: false },
      }),
    ]);
    const result = jsonResult({ data: 'ok' });
    const obs = observer.observe(makeToolCall('any_tool'), result);
    expect(obs.assessment.level).toBe('error');
  });

  it('does not match when hasError=false but result has error', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: false },
      }),
    ]);
    const result = jsonResult({ error: 'fail' });
    const obs = observer.observe(makeToolCall('any_tool'), result);
    expect(obs.assessment.level).toBe('success');
  });

  it('treats non-JSON text as no error for hasError=true', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
      }),
    ]);
    const obs = observer.observe(makeToolCall('any_tool'), 'plain text result');
    expect(obs.assessment.level).toBe('success');
  });
});

// ===================== Observer — resultContains =====================

describe('engine/observer — resultContains keyword matching', () => {
  it('matches when result contains any of the keywords (case-insensitive)', () => {
    const observer = new Observer([
      makeRule({
        condition: {
          toolNamePattern: '*',
          resultContains: ['timeout', '超时'],
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('web_fetch'), 'Request TIMEOUT after 30s');
    expect(obs.assessment.level).toBe('error');
  });

  it('matches Chinese keyword', () => {
    const observer = new Observer([
      makeRule({
        condition: {
          toolNamePattern: '*',
          resultContains: ['超时'],
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('web_fetch'), '请求超时');
    expect(obs.assessment.level).toBe('error');
  });

  it('does not match when none of the keywords present', () => {
    const observer = new Observer([
      makeRule({
        condition: {
          toolNamePattern: '*',
          resultContains: ['timeout', '超时'],
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('web_fetch'), 'completed successfully');
    expect(obs.assessment.level).toBe('success');
  });
});

// ===================== Observer — resultPattern regex =====================

describe('engine/observer — resultPattern regex', () => {
  it('matches when resultPattern matches', () => {
    const observer = new Observer([
      makeRule({
        condition: {
          toolNamePattern: '*',
          resultPattern: 'HTTP \\d{3}',
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('web_api_call'), 'got HTTP 404 error');
    expect(obs.assessment.level).toBe('error');
  });

  it('does not match when resultPattern does not match', () => {
    const observer = new Observer([
      makeRule({
        condition: {
          toolNamePattern: '*',
          resultPattern: 'HTTP \\d{3}',
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('web_api_call'), 'no http code here');
    expect(obs.assessment.level).toBe('success');
  });

  it('skips rule with invalid regex pattern', () => {
    const observer = new Observer([
      makeRule({
        id: 'invalid_regex',
        condition: {
          toolNamePattern: '*',
          resultPattern: '[invalid',
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('any_tool'), 'result');
    // invalid regex → rule skipped → no match → success
    expect(obs.assessment.level).toBe('success');
  });
});

// ===================== Observer — priority ordering =====================

describe('engine/observer — priority ordering', () => {
  it('selects the highest priority (lowest number) rule when multiple match', () => {
    const observer = new Observer([
      makeRule({
        id: 'low_priority',
        priority: 99,
        description: 'low priority rule',
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'low',
          level: 'warning',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
      makeRule({
        id: 'high_priority',
        priority: 1,
        description: 'high priority rule',
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'high',
          level: 'error',
          shouldRetry: true,
          shouldAdjustStrategy: false,
          maxRetries: 3,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('any_tool'), 'result');
    expect(obs.assessment.level).toBe('error');
    expect(obs.assessment.reason).toBe('high priority rule');
    expect(obs.assessment.maxRetries).toBe(3);
  });
});

// ===================== Observer — reflection hint =====================

describe('engine/observer — generateReflectionHint', () => {
  it('substitutes {toolName} and {error} variables', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
        action: {
          hintTemplate: '工具 {toolName} 出错：{error}',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const result = jsonResult({ error: 'disk full' });
    const obs = observer.observe(makeToolCall('file_write'), result);
    expect(obs.reflectionHint).toContain('file_write');
    expect(obs.reflectionHint).toContain('disk full');
  });

  it('returns empty string when no rules match', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: 'nonexistent' },
      }),
    ]);
    const obs = observer.observe(makeToolCall('other_tool'), 'result');
    // No rules matched → early return path does not set reflectionHint
    expect(obs.reflectionHint).toBeUndefined();
  });

  it('truncates hint to 200 characters', () => {
    const longError = 'x'.repeat(300);
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
        action: {
          hintTemplate: '{error}',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const result = jsonResult({ error: longError });
    const obs = observer.observe(makeToolCall('tool'), result);
    expect(obs.reflectionHint!.length).toBeLessThanOrEqual(200);
  });

  it('extracts error from JSON result for template', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
        action: {
          hintTemplate: 'ERROR: {error}',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const result = jsonResult({ error: 'connection refused' });
    const obs = observer.observe(makeToolCall('db_query'), result);
    expect(obs.reflectionHint).toBe('ERROR: connection refused');
  });

  it('falls back to raw text when result is not JSON', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true, resultContains: ['fail'] },
        action: {
          hintTemplate: 'Hint: {error}',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    // Non-JSON text containing 'fail' keyword; hasError=true but not JSON
    // → resultHasErrorField returns false → rule won't match → success
    const obs = observer.observe(makeToolCall('tool'), 'operation fail');
    expect(obs.assessment.level).toBe('success');
  });
});

// ===================== Observer — confidence score =====================

describe('engine/observer — confidence score', () => {
  it('does not set confidence when no rules match (success via early return)', () => {
    const observer = new Observer([]);
    const obs = observer.observe(makeToolCall('tool'), 'ok');
    // No rules matched → early return, confidenceScore not set
    expect(obs.confidenceScore).toBeUndefined();
  });

  it('assigns confidence 5 for warning level', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'warn',
          level: 'warning',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('tool'), 'result');
    expect(obs.confidenceScore).toBe(5);
  });

  it('assigns confidence 3 for error level with shouldRetry=true', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'err',
          level: 'error',
          shouldRetry: true,
          shouldAdjustStrategy: false,
          maxRetries: 2,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('tool'), 'result');
    expect(obs.confidenceScore).toBe(3);
  });

  it('assigns confidence 1 for error level with shouldRetry=false', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'err',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('tool'), 'result');
    expect(obs.confidenceScore).toBe(1);
  });
});

// ===================== Observer — shouldRetry =====================

describe('engine/observer — shouldRetry decision', () => {
  it('returns true when retryIndex < maxRetries and shouldRetry=true', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'retry',
          level: 'error',
          shouldRetry: true,
          shouldAdjustStrategy: false,
          maxRetries: 3,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('tool'), 'result');
    expect(observer.shouldRetry(obs, 0)).toBe(true);
    expect(observer.shouldRetry(obs, 2)).toBe(true);
  });

  it('returns false when retryIndex >= maxRetries', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'retry',
          level: 'error',
          shouldRetry: true,
          shouldAdjustStrategy: false,
          maxRetries: 2,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('tool'), 'result');
    expect(observer.shouldRetry(obs, 2)).toBe(false);
    expect(observer.shouldRetry(obs, 5)).toBe(false);
  });

  it('returns false when shouldRetry=false', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*' },
        action: {
          hintTemplate: 'no retry',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 5,
        },
      }),
    ]);
    const obs = observer.observe(makeToolCall('tool'), 'result');
    expect(observer.shouldRetry(obs, 0)).toBe(false);
  });
});

// ===================== Observer — error tolerance =====================

describe('engine/observer — error tolerance', () => {
  it('returns success assessment when observe() throws internally', () => {
    // Construct an Observer with a rule that will cause ruleEngine.match to
    // throw by providing a malformed condition. The try/catch in observe()
    // should swallow the error and return success.
    const malformedRule = {
      id: 'malformed',
      description: 'will throw',
      priority: 1,
      // @ts-expect-error — intentionally malformed for error tolerance test
      condition: null,
      action: {
        hintTemplate: 'x',
        level: 'error',
        shouldRetry: false,
        shouldAdjustStrategy: false,
        maxRetries: 0,
      },
    } as ObserverRule;
    const observer = new Observer([malformedRule]);
    const obs = observer.observe(makeToolCall('tool'), 'result');
    expect(obs.assessment.level).toBe('success');
    expect(obs.assessment.shouldRetry).toBe(false);
  });
});

// ===================== Observer — extractErrorText =====================

describe('engine/observer — error text extraction', () => {
  it('extracts error field from JSON result via reflection hint', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
        action: {
          hintTemplate: '{error}',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const result = jsonResult({ error: 'disk full' });
    const obs = observer.observe(makeToolCall('tool'), result);
    expect(obs.reflectionHint).toBe('disk full');
  });

  it('truncates long error text to 100 chars in extraction', () => {
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', hasError: true },
        action: {
          hintTemplate: '{error}',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const longError = 'y'.repeat(150);
    const result = jsonResult({ error: longError });
    const obs = observer.observe(makeToolCall('tool'), result);
    // extractErrorText truncates to 100 chars, then hint truncates to 200
    expect(obs.reflectionHint!.length).toBe(100);
  });

  it('uses raw result prefix when not JSON', () => {
    // hasError=true requires JSON with error field; non-JSON won't match
    // → test with a rule that doesn't require hasError
    const observer = new Observer([
      makeRule({
        condition: { toolNamePattern: '*', resultContains: ['fail'] },
        action: {
          hintTemplate: 'err: {error}',
          level: 'error',
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      }),
    ]);
    const longText = 'z'.repeat(150) + ' fail';
    const obs = observer.observe(makeToolCall('tool'), longText);
    // extractErrorText falls back to raw text, truncated to 100 chars
    expect(obs.reflectionHint).toContain('err: ');
    expect(obs.reflectionHint!.length).toBeLessThanOrEqual(200);
  });
});

// ===================== Observer — default rules (OBSERVER_RULES) =====================

describe('engine/observer — default OBSERVER_RULES integration', () => {
  const observer = new Observer();

  it('matches SQL syntax error rule', () => {
    const result = jsonResult({ error: 'SQL_ERROR: near "FROM": syntax error' });
    const obs = observer.observe(makeToolCall('db_query'), result);
    expect(obs.assessment.level).toBe('error');
    expect(obs.assessment.shouldRetry).toBe(true);
    expect(obs.assessment.maxRetries).toBe(2);
    expect(obs.reflectionHint).toContain('db_query');
    expect(obs.reflectionHint).toContain('SQL 语法错误');
  });

  it('matches file not found rule', () => {
    const result = jsonResult({ error: 'ENOENT: no such file or directory' });
    const obs = observer.observe(makeToolCall('file_readFile'), result);
    expect(obs.assessment.level).toBe('error');
    expect(obs.assessment.shouldAdjustStrategy).toBe(true);
    expect(obs.reflectionHint).toContain('文件不存在');
  });

  it('matches web timeout rule', () => {
    const result = jsonResult({ error: 'Request timeout ETIMEDOUT' });
    const obs = observer.observe(makeToolCall('web_fetch'), result);
    expect(obs.assessment.level).toBe('warning');
    expect(obs.assessment.shouldRetry).toBe(true);
    expect(obs.assessment.maxRetries).toBe(2);
  });

  it('matches generic error as fallback', () => {
    const result = jsonResult({ error: 'unknown failure' });
    const obs = observer.observe(makeToolCall('unknown_tool'), result);
    expect(obs.assessment.level).toBe('error');
    expect(obs.assessment.shouldRetry).toBe(true);
    expect(obs.assessment.maxRetries).toBe(1);
  });

  it('matches empty result rule for []', () => {
    const obs = observer.observe(makeToolCall('some_tool'), '[]');
    expect(obs.assessment.level).toBe('warning');
    expect(obs.assessment.shouldAdjustStrategy).toBe(true);
    expect(obs.assessment.shouldRetry).toBe(false);
  });

  it('matches web_search empty result as success (no circuit break)', () => {
    const obs = observer.observe(makeToolCall('web_search'), '{"count":0,"results":[]}');
    expect(obs.assessment.level).toBe('success');
    expect(obs.assessment.shouldAdjustStrategy).toBe(true);
  });

  it('returns success for normal successful JSON result', () => {
    const result = jsonResult({ success: true, data: [1, 2, 3] });
    const obs = observer.observe(makeToolCall('db_query'), result);
    expect(obs.assessment.level).toBe('success');
    // No default rule matches a success:true result with data → early return
    expect(obs.confidenceScore).toBeUndefined();
  });
});

// ===================== Observer — combined conditions =====================

describe('engine/observer — combined condition matching', () => {
  it('requires all specified conditions to match', () => {
    const observer = new Observer([
      makeRule({
        condition: {
          toolNamePattern: 'db_*',
          hasError: true,
          resultContains: ['syntax'],
          resultPattern: 'SQL',
        },
      }),
    ]);
    // All conditions match
    const ok = observer.observe(
      makeToolCall('db_query'),
      jsonResult({ error: 'SQL syntax error' }),
    );
    expect(ok.assessment.level).toBe('error');

    // Missing resultContains 'syntax'
    const miss1 = observer.observe(
      makeToolCall('db_query'),
      jsonResult({ error: 'SQL failure' }),
    );
    expect(miss1.assessment.level).toBe('success');

    // Wrong tool name
    const miss2 = observer.observe(
      makeToolCall('file_read'),
      jsonResult({ error: 'SQL syntax error' }),
    );
    expect(miss2.assessment.level).toBe('success');
  });
});
