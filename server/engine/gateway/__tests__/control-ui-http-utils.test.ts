// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  isReadHttpMethod,
  respondPlainText,
  respondNotFound,
} from '../control-ui-http-utils.js';
import type { ServerResponse } from 'node:http';

function createMockResponse(): ServerResponse {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    ended: false,
    endedBody: undefined as string | undefined,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(body?: unknown) {
      this.ended = true;
      this.endedBody = typeof body === 'string' ? body : undefined;
    },
  };
  return res as unknown as ServerResponse;
}

describe('control-ui-http-utils', () => {
  describe('isReadHttpMethod', () => {
    it('GET 应返回 true', () => {
      expect(isReadHttpMethod('GET')).toBe(true);
    });

    it('HEAD 应返回 true', () => {
      expect(isReadHttpMethod('HEAD')).toBe(true);
    });

    it('POST 应返回 false', () => {
      expect(isReadHttpMethod('POST')).toBe(false);
    });

    it('PUT 应返回 false', () => {
      expect(isReadHttpMethod('PUT')).toBe(false);
    });

    it('DELETE 应返回 false', () => {
      expect(isReadHttpMethod('DELETE')).toBe(false);
    });

    it('undefined 应返回 false', () => {
      expect(isReadHttpMethod(undefined)).toBe(false);
    });

    it('小写 get 应返回 false（大小写敏感）', () => {
      expect(isReadHttpMethod('get')).toBe(false);
    });

    it('空字符串应返回 false', () => {
      expect(isReadHttpMethod('')).toBe(false);
    });
  });

  describe('respondPlainText', () => {
    it('应设置状态码、Content-Type 并结束响应', () => {
      const res = createMockResponse();
      respondPlainText(res, 200, 'hello');
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(res.ended).toBe(true);
    });

    it('应将 body 传给 res.end', () => {
      const res = createMockResponse();
      respondPlainText(res, 400, 'bad request');
      expect(res.endedBody).toBe('bad request');
    });

    it('应支持 500 状态码', () => {
      const res = createMockResponse();
      respondPlainText(res, 500, 'server error');
      expect(res.statusCode).toBe(500);
    });

    it('应支持空 body', () => {
      const res = createMockResponse();
      respondPlainText(res, 204, '');
      expect(res.endedBody).toBe('');
    });
  });

  describe('respondNotFound', () => {
    it('应使用 404 状态码', () => {
      const res = createMockResponse();
      respondNotFound(res);
      expect(res.statusCode).toBe(404);
    });

    it('应使用 "Not Found" body', () => {
      const res = createMockResponse();
      respondNotFound(res);
      expect(res.endedBody).toBe('Not Found');
    });

    it('应设置 Content-Type 为 text/plain', () => {
      const res = createMockResponse();
      respondNotFound(res);
      expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    });

    it('应结束响应', () => {
      const res = createMockResponse();
      respondNotFound(res);
      expect(res.ended).toBe(true);
    });
  });
});
