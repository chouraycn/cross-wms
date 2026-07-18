/**
 * error-mapper 测试 — 统一错误码与错误分类。
 */
import { describe, it, expect } from 'vitest';
import {
  LLMError,
  classifyHttpStatus,
  isRetryableCode,
  classifyError,
  toLLMError,
  classifyProviderError,
  extractProviderErrorMessage,
  isContentFilterError,
  isComplianceError,
} from '../error-mapper.js';

describe('classifyHttpStatus', () => {
  it('401/403 → auth', () => {
    expect(classifyHttpStatus(401)).toBe('auth');
    expect(classifyHttpStatus(403)).toBe('auth');
  });

  it('429 → rate_limit', () => {
    expect(classifyHttpStatus(429)).toBe('rate_limit');
  });

  it('400 → invalid_request', () => {
    expect(classifyHttpStatus(400)).toBe('invalid_request');
  });

  it('404 → not_found', () => {
    expect(classifyHttpStatus(404)).toBe('not_found');
  });

  it('5xx → server_error', () => {
    expect(classifyHttpStatus(500)).toBe('server_error');
    expect(classifyHttpStatus(502)).toBe('server_error');
    expect(classifyHttpStatus(503)).toBe('server_error');
  });

  it('408 → timeout', () => {
    expect(classifyHttpStatus(408)).toBe('timeout');
  });

  it('413 → context_length_exceeded', () => {
    expect(classifyHttpStatus(413)).toBe('context_length_exceeded');
  });
});

describe('isRetryableCode', () => {
  it('rate_limit / server_error / timeout / network 可重试', () => {
    expect(isRetryableCode('rate_limit')).toBe(true);
    expect(isRetryableCode('server_error')).toBe(true);
    expect(isRetryableCode('timeout')).toBe(true);
    expect(isRetryableCode('network')).toBe(true);
  });

  it('auth / invalid_request 不可重试', () => {
    expect(isRetryableCode('auth')).toBe(false);
    expect(isRetryableCode('invalid_request')).toBe(false);
    expect(isRetryableCode('not_found')).toBe(false);
  });
});

describe('classifyError', () => {
  it('LLMError 直接返回其分类', () => {
    const err = new LLMError(
      { code: 'rate_limit', retryable: true, message: 'rate limited', retryAfterMs: 1000 },
      429,
    );
    const c = classifyError(err);
    expect(c.code).toBe('rate_limit');
    expect(c.retryable).toBe(true);
    expect(c.retryAfterMs).toBe(1000);
  });

  it('带 statusCode 的错误按 HTTP 分类', () => {
    const err = new Error('fail') as Error & { statusCode: number };
    err.statusCode = 500;
    const c = classifyError(err);
    expect(c.code).toBe('server_error');
    expect(c.retryable).toBe(true);
  });

  it('AbortError 分类为 aborted', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const c = classifyError(err);
    expect(c.code).toBe('aborted');
    expect(c.retryable).toBe(false);
  });

  it('字符串错误按内容识别 timeout', () => {
    const c = classifyError('request timed out');
    expect(c.code).toBe('timeout');
    expect(c.retryable).toBe(true);
  });

  it('字符串错误按内容识别 network', () => {
    const c = classifyError('ECONNRESET');
    expect(c.code).toBe('network');
    expect(c.retryable).toBe(true);
  });

  it('字符串错误按内容识别 context_length_exceeded', () => {
    const c = classifyError('context length too long');
    expect(c.code).toBe('context_length_exceeded');
    expect(c.retryable).toBe(false);
  });

  it('未知错误分类为 unknown', () => {
    const c = classifyError({ weird: true });
    expect(c.code).toBe('unknown');
    expect(c.retryable).toBe(false);
  });

  it('null/undefined 安全处理', () => {
    const c = classifyError(null);
    expect(c.code).toBe('unknown');
  });
});

describe('toLLMError', () => {
  it('将普通错误包装为 LLMError', () => {
    const err = new Error('fail') as Error & { statusCode: number };
    err.statusCode = 429;
    const llmErr = toLLMError(err);
    expect(llmErr).toBeInstanceOf(LLMError);
    expect(llmErr.code).toBe('rate_limit');
    expect(llmErr.statusCode).toBe(429);
    expect(llmErr.retryable).toBe(true);
  });
});

describe('classifyProviderError', () => {
  it('从 Provider 错误响应体提取 message', () => {
    const c = classifyProviderError(
      { error: { message: 'invalid api key', type: 'authentication_error' } },
      401,
    );
    expect(c.code).toBe('auth');
    expect(c.message).toBe('invalid api key');
    expect(c.retryable).toBe(false);
  });

  it('429 响应可重试', () => {
    const c = classifyProviderError({ error: { message: 'slow down' } }, 429);
    expect(c.retryable).toBe(true);
  });

  it('带 retry_after 字段的响应提取 retryAfterMs', () => {
    const c = classifyProviderError({ error: { message: 'rate limit' }, retry_after: 5 }, 429);
    expect(c.retryAfterMs).toBe(5000);
  });
});

describe('extractProviderErrorMessage', () => {
  it('OpenAI 格式 { error: { message } }', () => {
    expect(extractProviderErrorMessage({ error: { message: 'openai err' } })).toBe('openai err');
  });

  it('Anthropic 格式 { error: { type, message } }', () => {
    expect(extractProviderErrorMessage({ error: { type: 'x', message: 'anthropic err' } })).toBe('anthropic err');
  });

  it('顶层 message 字段', () => {
    expect(extractProviderErrorMessage({ message: 'top err' })).toBe('top err');
  });

  it('detail 字段', () => {
    expect(extractProviderErrorMessage({ detail: 'detail err' })).toBe('detail err');
  });

  it('无匹配返回 undefined', () => {
    expect(extractProviderErrorMessage({ random: true })).toBeUndefined();
  });
});

describe('LLMError', () => {
  it('保留所有字段', () => {
    const err = new LLMError(
      { code: 'rate_limit', retryable: true, message: 'msg', retryAfterMs: 2000 },
      429,
    );
    expect(err.name).toBe('LLMError');
    expect(err.code).toBe('rate_limit');
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(2000);
    expect(err.statusCode).toBe(429);
    expect(err.message).toBe('msg');
  });
});

describe('国内内容安全 / 合规错误', () => {
  it('classifyError 识别敏感内容错误（含 sensitive 关键词，不可重试）', () => {
    const c = classifyError('内容包含敏感词');
    expect(c.code).toBe('sensitive_content');
    expect(c.retryable).toBe(false);
  });

  it('classifyError 识别 content_filter triggered 为 sensitive_content', () => {
    expect(classifyError('content_filter triggered').code).toBe('sensitive_content');
  });

  it('classifyError 识别"该内容违规"为 sensitive_content', () => {
    expect(classifyError('该内容违规').code).toBe('sensitive_content');
  });

  it('classifyError 识别"合规检查失败"为 compliance_violation', () => {
    expect(classifyError('合规检查失败').code).toBe('compliance_violation');
  });

  it('classifyError 识别"备案信息缺失"为 compliance_violation', () => {
    expect(classifyError('备案信息缺失').code).toBe('compliance_violation');
  });

  it('isContentFilterError 检测敏感内容返回 true', () => {
    expect(isContentFilterError('敏感内容')).toBe(true);
  });

  it('isContentFilterError 对正常错误返回 false', () => {
    expect(isContentFilterError('正常错误')).toBe(false);
  });

  it('isComplianceError 检测合规错误返回 true', () => {
    expect(isComplianceError('合规失败')).toBe(true);
  });

  it('isComplianceError 对正常错误返回 false', () => {
    expect(isComplianceError('正常错误')).toBe(false);
  });
});
