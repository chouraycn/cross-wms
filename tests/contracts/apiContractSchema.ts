/**
 * H3: P2-1 API 契约统一 envelope 校验工具
 *
 * 所有 `npm run test:contracts` 的用例都应使用这里的 helper 做断言，
 * 保证 OK / Fail envelope 与 server/routes/_shared/respond.ts +
 * server/middleware/errorHandler.ts 完全一致。
 */

import type { Assertion } from 'vitest';
import { BizCode } from '../../server/routes/_shared/respond.js';

export interface EnvelopeOk<T = unknown> {
  code: 0 | number;
  data: T;
  message: string;
}

export interface EnvelopeErr {
  code: number;
  data: null;
  message: string;
  timestamp?: string;
  stack?: string;
  path?: string;
  rawCode?: number;
}

type JSONVal =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JSONVal }
  | JSONVal[];

/** code 值允许范围：0=成功；40000~49999=客户端错；50000~59999=服务端错；历史 404=not found 兼容 */
function isValidBizCode(code: number): boolean {
  if (code === 0) return true;
  if (code === 404) return true; // 历史兼容：respond.notFound 使用 code=404
  if (code >= 40000 && code <= 49999) return true;
  if (code >= 50000 && code <= 59999) return true;
  return false;
}

/**
 * 断言 body 是标准成功 envelope：{ code:0, data, message }
 */
export function expectOk<T = JSONVal>(body: JSONVal): asserts body is EnvelopeOk<T> {
  const ok = body as EnvelopeOk<T>;
  if (ok === null || typeof ok !== 'object' || Array.isArray(ok)) {
    throw new Error(`OK envelope 必须是非空对象：${JSON.stringify(body)}`);
  }
  if (typeof ok.code !== 'number' || !isValidBizCode(ok.code)) {
    throw new Error(`OK envelope.code 必须为合法 BizCode，实际 ${String(ok.code)}`);
  }
  if (ok.code !== 0) {
    throw new Error(`OK envelope.code 必须为 0，实际 ${ok.code} (message=${String(ok.message ?? '')})`);
  }
  if (!('data' in ok)) {
    throw new Error('OK envelope 必须含 data 字段');
  }
  if (typeof ok.message !== 'string') {
    throw new Error('OK envelope.message 必须为 string');
  }
}

/**
 * 断言 body 是标准错误 envelope：{ code (4xxxx/5xxxx), data:null, message, timestamp }
 *
 * @param expectedCode 可选：校验精确 BizCode，例如 BizCode.BAD_REQUEST
 */
export function expectErr(
  body: JSONVal,
  expectedCode?: number,
): asserts body is EnvelopeErr {
  const err = body as EnvelopeErr;
  if (err === null || typeof err !== 'object' || Array.isArray(err)) {
    throw new Error(`ERR envelope 必须是非空对象：${JSON.stringify(body)}`);
  }
  if (typeof err.code !== 'number' || !isValidBizCode(err.code) || err.code === 0) {
    throw new Error(`ERR envelope.code 必须为非 0 BizCode，实际 ${String(err.code)}`);
  }
  if (expectedCode !== undefined && err.code !== expectedCode) {
    throw new Error(
      `ERR envelope.code 期望 ${expectedCode}，实际 ${err.code} (message=${String(err.message ?? '')})`,
    );
  }
  if (err.data !== null) {
    throw new Error(`ERR envelope.data 必须为 null，实际 ${JSON.stringify(err.data)}`);
  }
  if (typeof err.message !== 'string' || err.message.length === 0) {
    throw new Error('ERR envelope.message 必须为非空 string');
  }
  if (typeof err.timestamp === 'string' && err.timestamp.length > 0) {
    // 若存在 timestamp，要求是 ISO（仅做粗校验，避免测试过脆）
    if (Number.isNaN(Date.parse(err.timestamp))) {
      throw new Error(`ERR envelope.timestamp 非法: ${err.timestamp}`);
    }
  }
}

/**
 * Express supertest Response 辅助：断言 HTTP 状态码 + OK envelope
 */
export function assertOkResponse(
  res: { status: number; body: JSONVal },
  expectedHttp = 200,
): EnvelopeOk {
  if (res.status !== expectedHttp) {
    throw new Error(`HTTP 状态码期望 ${expectedHttp}，实际 ${res.status}, body=${JSON.stringify(res.body)}`);
  }
  expectOk(res.body);
  return res.body as EnvelopeOk;
}

/**
 * Express supertest Response 辅助：断言 HTTP 状态码 + ERR envelope + 可选 BizCode
 */
export function assertErrResponse(
  res: { status: number; body: JSONVal },
  expectedHttp: number,
  expectedCode?: number,
): EnvelopeErr {
  if (res.status !== expectedHttp) {
    throw new Error(`HTTP 状态码期望 ${expectedHttp}，实际 ${res.status}, body=${JSON.stringify(res.body)}`);
  }
  expectErr(res.body, expectedCode);
  return res.body as EnvelopeErr;
}

export { BizCode };
