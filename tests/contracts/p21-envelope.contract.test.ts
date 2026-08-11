/**
 * H3: P2-1 API 契约 smoke 测试
 *
 * 不依赖数据库与 supertest：直接构造 ErrorHandler 与 respond 辅助在内存中
 * 调用，校验 envelope 结构一致性。这是契约测试的最小化骨架，后续对真实路由
 * 做契约测试时在 tests/contracts 下新增 <route>.contract.test.ts，复用
 * ./apiContractSchema.ts 的 expectOk/expectErr。
 */

import { describe, it, expect } from 'vitest';
import { BizCode, ok, fail, notFound, created, serverError } from '../../server/routes/_shared/respond.js';
import {
  errorHandler,
  throwHttpError,
  errorResponse,
  asyncWrap,
} from '../../server/middleware/errorHandler.js';
import {
  expectOk,
  expectErr,
  assertOkResponse,
  assertErrResponse,
} from './apiContractSchema.js';

describe('P2-1 API Contract — respond helpers', () => {
  function fakeRes() {
    let statusCode = 0;
    let jsonBody: unknown = null;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (body: unknown) => {
        jsonBody = body;
        return res;
      },
      readStatus: () => statusCode,
      readBody: () => jsonBody,
      headersSent: false,
    } as any;
    return res;
  }
  function toAssertable(r: any) {
    return { status: r.readStatus(), body: r.readBody() };
  }

  it('ok() → envelope {code:0, data, message}', () => {
    const res = fakeRes();
    ok(res, { a: 1 }, 'ok');
    // ok() 默认不写 HTTP 200（默认 200），其他 helper 会写；这里只校验 envelope，
    // 避免把默认 0 vs 默认 200 的 HTTP 差异当成契约问题。
    expectOk(res.readBody());
    const env = res.readBody() as any;
    expect(env.code).toBe(0);
    expect(env.data).toEqual({ a: 1 });
    expect(env.message).toBe('ok');
  });

  it('created() → 201 + envelope', () => {
    const res = fakeRes();
    created(res, { id: 99 });
    expect(res.readStatus()).toBe(201);
    const env = assertOkResponse(toAssertable(res), 201);
    expect(env.code).toBe(0);
    expect((env.data as any).id).toBe(99);
  });

  it('fail(40001,...) → 400 + ERR envelope', () => {
    const res = fakeRes();
    fail(res, BizCode.BAD_REQUEST, '参数错误', 400);
    const env = assertErrResponse(toAssertable(res), 400, BizCode.BAD_REQUEST);
    expect(env.message).toBe('参数错误');
    expect(env.data).toBeNull();
  });

  it('notFound() → 404 + envelope (历史兼容 code=404)', () => {
    const res = fakeRes();
    notFound(res, '不存在');
    // 404 是历史值（非 40401），也属于合法 BizCode
    expect(res.readStatus()).toBe(404);
    expectErr(res.readBody() as any);
    const env = res.readBody() as any;
    expect(env.code).toBe(404);
    expect(env.message).toBe('不存在');
    expect(env.data).toBeNull();
  });

  it('serverError() → 500 + BizCode.INTERNAL', () => {
    const res = fakeRes();
    serverError(res, '崩了');
    const env = assertErrResponse(toAssertable(res), 500, BizCode.INTERNAL);
    expect(env.message).toBe('崩了');
  });
});

describe('P2-1 API Contract — errorHandler middleware', () => {
  function fakeReq(path = '/x') {
    return { method: 'GET', path } as any;
  }
  function fakeRes() {
    let statusCode = 200;
    let jsonBody: unknown = null;
    const sent = { value: false };
    // express Response 是链式函数，getter 不能用于链式；这里显式保持 `status/json` 作为
    // 一等函数属性；内部用闭包变量维持状态，避免测试与 `get status()` getter 冲突。
    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (body: unknown) => {
        jsonBody = body;
        return res;
      },
      readStatus: () => statusCode,
      readBody: () => jsonBody,
      req: fakeReq(),
      get headersSent() {
        return sent.value;
      },
      setSent(v: boolean) {
        sent.value = v;
      },
    } as any;
    return res;
  }
  function toAssertable(r: any) {
    return { status: r.readStatus(), body: r.readBody() };
  }
  const noopNext = () => {};

  it('throwHttpError + errorHandler → aligned envelope', () => {
    const res = fakeRes();
    try {
      throwHttpError(400, 'name 缺失', BizCode.BAD_REQUEST);
    } catch (e) {
      errorHandler(e, fakeReq('/foo'), res, noopNext as any);
    }
    const env = assertErrResponse(toAssertable(res), 400, BizCode.BAD_REQUEST);
    expect(env.message).toBe('name 缺失');
    expect(env.timestamp).toBeTruthy();
  });

  it('HTTP 500 auto → BizCode.INTERNAL', () => {
    const res = fakeRes();
    const err = new Error('boom') as any;
    err.status = 500;
    errorHandler(err, fakeReq('/boom'), res, noopNext as any);
    const env = assertErrResponse(toAssertable(res), 500, BizCode.INTERNAL);
    expect(env.message).toBe('boom');
  });

  it('HTTP 404 auto → BizCode.NOT_FOUND', () => {
    const res = fakeRes();
    const err = new Error('No') as any;
    err.status = 404;
    errorHandler(err, fakeReq('/nope'), res, noopNext as any);
    const env = assertErrResponse(toAssertable(res), 404, BizCode.NOT_FOUND);
    expect(env.message).toBe('No');
  });

  it('headersSent → skip envelope writing', () => {
    const res = fakeRes();
    res.setSent(true);
    const err = new Error('oops') as any;
    err.status = 500;
    errorHandler(err, fakeReq('/stream'), res, noopNext as any);
    expect(res.readStatus()).toBe(200);
    expect(res.readBody()).toBeNull();
  });

  it('errorResponse() helper → envelope match', () => {
    const res = fakeRes();
    errorResponse(res, 403, '无权限', BizCode.FORBIDDEN);
    const env = assertErrResponse(toAssertable(res), 403, BizCode.FORBIDDEN);
    expect(env.message).toBe('无权限');
  });

  it('asyncWrap → 捕获 promise reject 并 next(e)', async () => {
    const err = new Error('async boom') as any;
    err.status = 422;
    err.bizCode = BizCode.VALIDATION;
    const handler = asyncWrap(async () => {
      throw err;
    });
    let received: unknown = null;
    handler(fakeReq('/x'), fakeRes() as any, (e: unknown) => {
      received = e;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect((received as any).bizCode).toBe(BizCode.VALIDATION);
    expect((received as any).message).toBe('async boom');
  });
});

describe('P2-1 API Contract — BizCode ranges smoke', () => {
  it('BizCode 常量落在合法区间', () => {
    expect(BizCode.OK).toBe(0);
    expect(BizCode.BAD_REQUEST).toBeGreaterThanOrEqual(40000);
    expect(BizCode.BAD_REQUEST).toBeLessThan(50000);
    expect(BizCode.INTERNAL).toBeGreaterThanOrEqual(50000);
    expect(BizCode.INTERNAL).toBeLessThan(60000);
  });
});
