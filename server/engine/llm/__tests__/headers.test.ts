/**
 * headers 测试 — 认证 / 用户代理 / 追踪。
 */
import { describe, it, expect } from 'vitest';
import {
  buildAuthHeaders,
  buildHeaders,
  mergeHeaders,
  generateRequestId,
  headersToRecord,
  redactSensitiveHeaders,
  buildTracingHeaders,
  DEFAULT_USER_AGENT,
} from '../headers.js';
import type { Model } from '../types.js';

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    api: 'openai-completions',
    contextWindow: 128_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...overrides,
  };
}

describe('buildAuthHeaders', () => {
  it('bearer 方式设置 Authorization', () => {
    expect(buildAuthHeaders('bearer', 'sk-test')).toEqual({ Authorization: 'Bearer sk-test' });
  });

  it('x-api-key 方式设置 x-api-key 头', () => {
    expect(buildAuthHeaders('x-api-key', 'ant-key')).toEqual({ 'x-api-key': 'ant-key' });
  });

  it('api-key 方式设置 api-key 头', () => {
    expect(buildAuthHeaders('api-key', 'azure-key')).toEqual({ 'api-key': 'azure-key' });
  });

  it('query / none 方式不设置认证头', () => {
    expect(buildAuthHeaders('query', 'key')).toEqual({});
    expect(buildAuthHeaders('none', 'key')).toEqual({});
  });

  it('无 apiKey 返回空对象', () => {
    expect(buildAuthHeaders('bearer')).toEqual({});
  });
});

describe('buildHeaders', () => {
  it('包含默认 Content-Type 与 User-Agent', () => {
    const headers = buildHeaders({ apiKey: 'sk-test' });
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toBe(DEFAULT_USER_AGENT);
    expect(headers.Accept).toBe('application/json');
  });

  it('包含认证头', () => {
    const headers = buildHeaders({ authScheme: 'bearer', apiKey: 'sk-test' });
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('requestId 与 sessionId 注入对应头', () => {
    const headers = buildHeaders({ requestId: 'req-123', sessionId: 'sess-456' });
    expect(headers['X-Request-Id']).toBe('req-123');
    expect(headers['X-Session-Id']).toBe('sess-456');
  });

  it('extra 字段合并', () => {
    const headers = buildHeaders({ extra: { 'X-Custom': 'value' } });
    expect(headers['X-Custom']).toBe('value');
  });

  it('自定义 userAgent 覆盖默认', () => {
    const headers = buildHeaders({ userAgent: 'my-app/2.0' });
    expect(headers['User-Agent']).toBe('my-app/2.0');
  });
});

describe('mergeHeaders', () => {
  it('后者覆盖前者', () => {
    const merged = mergeHeaders({ A: '1' }, { A: '2', B: '3' });
    expect(merged).toEqual({ A: '2', B: '3' });
  });

  it('跳过 undefined 源', () => {
    const merged = mergeHeaders({ A: '1' }, undefined, { B: '2' });
    expect(merged).toEqual({ A: '1', B: '2' });
  });
});

describe('generateRequestId', () => {
  it('生成 UUID v4 格式', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('每次生成不同值', () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).not.toBe(b);
  });
});

describe('headersToRecord', () => {
  it('Headers 对象转为记录', () => {
    const h = new Headers({ 'Content-Type': 'application/json', 'X-Test': '1' });
    const record = headersToRecord(h);
    expect(record['content-type']).toBe('application/json');
    expect(record['x-test']).toBe('1');
  });
});

describe('redactSensitiveHeaders', () => {
  it('敏感头替换为 ***REDACTED***', () => {
    const redacted = redactSensitiveHeaders({
      Authorization: 'Bearer secret',
      'x-api-key': 'secret-key',
      'Content-Type': 'application/json',
    });
    expect(redacted.Authorization).toBe('***REDACTED***');
    expect(redacted['x-api-key']).toBe('***REDACTED***');
    expect(redacted['Content-Type']).toBe('application/json');
  });

  it('保留非敏感头', () => {
    const redacted = redactSensitiveHeaders({ 'User-Agent': 'my-app' });
    expect(redacted['User-Agent']).toBe('my-app');
  });
});

describe('buildTracingHeaders', () => {
  it('包含 requestId / sessionId / provider / model', () => {
    const headers = buildTracingHeaders({
      apiKey: 'sk',
      model: makeModel({ provider: 'openai', id: 'gpt-4o' }),
      options: { model: 'openai/gpt-4o', messages: [] },
      requestId: 'r1',
      sessionId: 's1',
    });
    expect(headers['X-Request-Id']).toBe('r1');
    expect(headers['X-Session-Id']).toBe('s1');
    expect(headers['X-Provider']).toBe('openai');
    expect(headers['X-Model']).toBe('gpt-4o');
  });
});
