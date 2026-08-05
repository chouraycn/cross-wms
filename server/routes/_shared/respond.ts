import type { Response } from 'express';

/**
 * 统一 API 响应 helper（P2-1 契约对齐基础设施）
 * 所有主程序路由应改用本文件，使响应形如 { code, data, message }，
 * 与 staff 侧（21/23 已 enveloped）及前端 client（兼容 envelope 与裸数据）保持一致。
 */

/** 成功：{ code: 0, data, message } */
export function ok(res: Response, data: unknown, message = 'ok') {
  return res.json({ code: 0, data, message });
}

/** 错误：{ code, data: null, message }，httpStatus 默认 400 */
export function fail(res: Response, code: number, message: string, httpStatus = 400) {
  return res.status(httpStatus).json({ code, data: null, message });
}

/** not-found 便捷：404 + { code: 404, data: null, message } */
export function notFound(res: Response, message = 'Not found') {
  return res.status(404).json({ code: 404, data: null, message });
}
