import type { Response } from 'express';

/**
 * 统一 API 响应 helper（P2-1 契约对齐基础设施）
 * 所有主程序路由应改用本文件，使响应形如 { code, data, message }，
 * 与 staff 侧（21/23 已 enveloped）及前端 client（兼容 envelope 与裸数据）保持一致。
 *
 * code 采用「业务码」方案（拍板结论 2026-08-08）：4xxxx = 客户端错，5xxxx = 服务端错。
 * HTTP 状态码仍用于传输层；二者解耦。notFound 沿用 code=404（与既有 inventory 测试一致）。
 */

/** 业务码表：4xxxx 客户端错 / 5xxxx 服务端错 */
export const BizCode = {
  OK: 0,
  BAD_REQUEST: 40001,
  UNAUTHORIZED: 40101,
  FORBIDDEN: 40301,
  NOT_FOUND: 40401,
  CONFLICT: 40901,
  VALIDATION: 42201,
  RATE_LIMITED: 42901,
  INTERNAL: 50001,
  SERVICE_UNAVAILABLE: 50301,
} as const;

export type BizCodeValue = (typeof BizCode)[keyof typeof BizCode];

/** 成功：{ code: 0, data, message } */
export function ok(res: Response, data: any, message = 'ok') {
  return res.json({ code: 0, data, message });
}

/** 创建成功（201）：{ code: 0, data, message }，HTTP 201 */
export function created(res: Response, data: any, message = 'ok') {
  return res.status(201).json({ code: 0, data, message });
}

/** 错误：{ code, data: null, message }，httpStatus 默认 400 */
export function fail(
  res: Response,
  code: number,
  message: string,
  httpStatus = 400,
) {
  return res.status(httpStatus).json({ code, data: null, message });
}

/** not-found 便捷：404 + { code: 404, data: null, message }（code 沿用 404 与既有测试一致） */
export function notFound(res: Response, message = 'Not found') {
  return res.status(404).json({ code: 404, data: null, message });
}

/** 服务端异常便捷：500 + { code: 50001, data: null, message } */
export function serverError(
  res: Response,
  message = 'Internal server error',
  code: BizCodeValue = BizCode.INTERNAL,
) {
  return fail(res, code, message, 500);
}
