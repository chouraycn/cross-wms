/**
 * 统一错误处理中间件
 * 确保所有错误响应格式一致
 */

import type { Request, Response, NextFunction } from 'express';

export interface ErrorResponse {
  error: string;
  message: string;
  code: number;
  timestamp: string;
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  const status = err?.status || 500;
  const message = err?.message || 'Internal Server Error';
  
  res.status(status).json({
    error: status >= 500 ? 'server_error' : 'client_error',
    message,
    code: status,
    timestamp: new Date().toISOString(),
  });

  if (status >= 500) {
    console.error(`[Error] ${status} ${req.path}:`, err);
  }
}

export function throwHttpError(status: number, message: string): never {
  const error = new Error(message) as any;
  error.status = status;
  throw error;
}

export function errorResponse(res: Response, status: number, message: string): void {
  res.status(status).json({
    error: status >= 500 ? 'server_error' : 'client_error',
    message,
    code: status,
    timestamp: new Date().toISOString(),
  });
}