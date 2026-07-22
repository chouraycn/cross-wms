/**
 * 统一错误处理中间件
 * 确保所有错误响应格式一致
 */

import type { Context, Next } from 'koa';

export interface ErrorResponse {
  error: string;
  message: string;
  code: number;
  timestamp: string;
}

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err) {
    const status = ctx.status || (err as any)?.status || 500;
    const message = (err as any)?.message || 'Internal Server Error';
    
    ctx.status = status;
    ctx.body = {
      error: status >= 500 ? 'server_error' : 'client_error',
      message,
      code: status,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      console.error(`[Error] ${status} ${ctx.path}:`, err);
    }
  }
}

export function throwHttpError(status: number, message: string): never {
  const error = new Error(message) as any;
  error.status = status;
  throw error;
}

export function errorResponse(ctx: Context, status: number, message: string): void {
  ctx.status = status;
  ctx.body = {
    error: status >= 500 ? 'server_error' : 'client_error',
    message,
    code: status,
    timestamp: new Date().toISOString(),
  };
}
