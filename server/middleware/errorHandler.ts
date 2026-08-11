/**
 * H3: 统一错误处理中间件（与 P2-1 respond.ts envelope 对齐：{ code, data:null, message, timestamp }）
 *
 * - BizCode 规则与 respond.ts 一致：4xxxx=客户端错 / 5xxxx=服务端错
 * - headersSent 检测避免双写（SSE 流中已发头时写 envelope 会崩 express）
 * - err.bizCode / err.code 优先，回退 HTTP 映射（400→40001 / 401→40101 / 403→40301 /
 *   404→40401 / 409→40901 / 422→42201 / 429→42901 / 503→50301 / 其余 → 50001）
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { BizCode } from '../routes/_shared/respond.js';

export interface ErrorResponse {
  /** 业务码：0=ok，4xxxx=客户端错，5xxxx=服务端错 */
  code: number;
  data: null;
  message: string;
  timestamp: string;
  /** 仅在 NODE_ENV=development 时返回，便于排查 */
  stack?: string;
  /** 仅在 NODE_ENV=development 时返回，请求标识 */
  path?: string;
  /** 仅在 NODE_ENV=development 时返回，路由绑定的 bizCode（若有） */
  rawCode?: number;
}

function httpToBizCode(status: number): number {
  switch (status) {
    case 400:
      return BizCode.BAD_REQUEST;
    case 401:
      return BizCode.UNAUTHORIZED;
    case 403:
      return BizCode.FORBIDDEN;
    case 404:
      return BizCode.NOT_FOUND;
    case 409:
      return BizCode.CONFLICT;
    case 422:
      return BizCode.VALIDATION;
    case 429:
      return BizCode.RATE_LIMITED;
    case 503:
      return BizCode.SERVICE_UNAVAILABLE;
    default:
      if (status >= 400 && status < 500) return BizCode.BAD_REQUEST;
      return BizCode.INTERNAL;
  }
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  // SSE / 流式响应中：headers 已发 → 放弃写 envelope，仅记日志
  if (res.headersSent) {
    logger.error(`[ErrorHandler] headers already sent, skip envelope writing path=${req.path}:`, err);
    return;
  }

  const httpStatus = Number(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  // 优先：err.bizCode → err.code（≥40000 视为业务码）→ HTTP 映射
  let bizCode: number;
  if (typeof err?.bizCode === 'number') {
    bizCode = err.bizCode;
  } else if (typeof err?.code === 'number' && err.code >= 40000) {
    bizCode = err.code;
  } else {
    bizCode = httpToBizCode(httpStatus);
  }

  const message: string =
    typeof err?.message === 'string' && err.message.length > 0
      ? err.message
      : httpStatus >= 500
        ? 'Internal Server Error'
        : 'Request Failed';

  const isDev = process.env.NODE_ENV !== 'production';
  const body: ErrorResponse = {
    code: bizCode,
    data: null,
    message,
    timestamp: new Date().toISOString(),
  };
  if (isDev) {
    if (typeof err?.stack === 'string') body.stack = err.stack;
    body.path = req.path;
    if (typeof err?.code === 'number') body.rawCode = err.code;
  }

  res.status(httpStatus).json(body);

  if (httpStatus >= 500) {
    logger.error(`[ErrorHandler] ${httpStatus} code=${bizCode} ${req.method} ${req.path}:`, err);
  } else if (httpStatus >= 400) {
    logger.warn(`[ErrorHandler] ${httpStatus} code=${bizCode} ${req.method} ${req.path}: ${message}`);
  }
}

export function throwHttpError(
  httpStatus: number,
  message: string,
  bizCode?: number,
): never {
  const error = new Error(message) as any;
  error.status = httpStatus;
  if (typeof bizCode === 'number') error.bizCode = bizCode;
  throw error;
}

/**
 * 便捷：在 route handler 里返回错误响应，保持 envelope 一致，
 * 无需依赖 async 包装才能进 errorHandler。
 */
export function errorResponse(
  res: Response,
  httpStatus: number,
  message: string,
  bizCode?: number,
): void {
  if (res.headersSent) return;
  const code = typeof bizCode === 'number' ? bizCode : httpToBizCode(httpStatus);
  const isDev = process.env.NODE_ENV !== 'production';
  const body: ErrorResponse = {
    code,
    data: null,
    message,
    timestamp: new Date().toISOString(),
  };
  if (isDev) body.path = res.req?.path;
  res.status(httpStatus).json(body);
}

/**
 * 异步路由包装器：把 route handler 里抛出的任何异常（含 Promise reject）
 * 传给 Express 原生 errorHandler，确保 envelope 统一。
 *
 * Usage:
 *   router.get('/foo', asyncWrap(async (req, res) => {
 *     throw throwHttpError(400, 'bad'); // → {code:40001,data:null,message:'bad'}
 *   }));
 */
export function asyncWrap(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<any> | any,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch((e: unknown) => next(e));
      }
    } catch (e) {
      next(e);
    }
  };
}