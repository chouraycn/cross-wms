import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFetchMock } from '../fetch-mock';

describe('Fetch Mock 测试', () => {
  let mock: ReturnType<typeof createFetchMock>;

  beforeEach(() => {
    mock = createFetchMock();
    mock.enable();
  });

  afterEach(() => {
    mock.disable();
    mock.clear();
  });

  it('应该模拟 GET 请求', async () => {
    mock.get('/test', () => Response.json({ data: 'test' }, { status: 200 }));
    const response = await fetch('/test');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: 'test' });
  });

  it('应该模拟 POST 请求', async () => {
    mock.post('/test', () => Response.json({ success: true }, { status: 201 }));
    const response = await fetch('/test', { method: 'POST' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true });
  });

  it('应该使用 json 快捷方法', async () => {
    mock.json('/api/users', [{ id: 1, name: 'test' }]);
    const response = await fetch('/api/users');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1, name: 'test' }]);
  });

  it('应该使用 postJson 快捷方法', async () => {
    mock.postJson('/api/users', { id: 1, name: 'test' }, 201);
    const response = await fetch('/api/users', { method: 'POST' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 1, name: 'test' });
  });

  it('应该支持正则表达式路径', async () => {
    mock.get(/\/api\/users\/\d+/, () => Response.json({ id: 1 }));
    const response = await fetch('/api/users/123');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 1 });
  });

  it('应该调用原始 fetch 当没有匹配的 mock', async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return Response.json({});
    };

    const response = await fetch('/unknown');
    expect(called).toBe(true);
    globalThis.fetch = originalFetch;
  });

  it('应该支持自定义 handler', async () => {
    let capturedUrl: string | undefined;
    let capturedOptions: RequestInit | undefined;

    mock.post('/api/echo', (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return Response.json({ url, method: options.method });
    });

    await fetch('/api/echo', { method: 'POST', body: JSON.stringify({ test: 'data' }) });
    expect(capturedUrl).toBe('/api/echo');
    expect(capturedOptions?.method).toBe('POST');
  });

  it('应该清理所有 mock', () => {
    mock.get('/test', () => Response.json({}));
    mock.clear();
    expect(mock['mocks'].length).toBe(0);
  });
});