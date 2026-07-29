/**
 * StaffDeck 鉴权中间件 — HMAC-SHA256 签名 token 校验
 *
 * 设计：
 * - 从 `Authorization: Bearer <token>` 头解析 HMAC-SHA256 签名 token
 * - 验证通过注入 res.locals.staffContext = { tenantId, userId, username, role }
 * - 桌面应用场景：未携带 token 时，若 isDefaultUserAllowed() 为 true，回退默认用户 default-user（admin 角色）
 * - 生产场景：未携带 token 时返回 401，必须显式设置 STAFF_AUTH_ALLOW_DEFAULT=1 才启用兜底
 * - requireStaffAuth 强制校验 token，不兜底默认用户
 *
 * 配合 dao/staff/staffAuthDao.ts 的 createAccessToken / decodeToken / getDefaultUser / isDefaultUserAllowed 使用
 */
import type { Request, Response, NextFunction } from 'express';
import {
  decodeToken,
  getDefaultUser,
  isDefaultUserAllowed,
  DEFAULT_TENANT_ID,
  DEFAULT_USER_ID,
  DEFAULT_USERNAME,
  DEFAULT_ROLE,
} from '../dao/staff/staffAuthDao.js';
import type { StaffRequestContext } from '../types/staff.js';

/** 从 Authorization 头解析 Bearer token */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** 把 StaffRequestContext 注入 res.locals.staffContext */
function injectContext(res: Response, ctx: StaffRequestContext): void {
  res.locals.staffContext = ctx;
}

/**
 * 宽松鉴权中间件（默认场景使用）：
 * - 有 token 且签名有效 → 注入 token 中的用户上下文
 * - 无 token 或 token 无效 → 若允许默认用户兜底则注入 default-user（admin），否则 401
 *
 * 桌面应用开发模式（NODE_ENV !== 'production' 或 STAFF_AUTH_ALLOW_DEFAULT=1）下所有 API 可访问
 */
export function staffAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token) {
    const payload = decodeToken(token);
    if (payload) {
      injectContext(res, {
        tenantId: payload.tenantId,
        userId: payload.userId,
        username: payload.username,
        role: (payload.role === 'admin' ? 'admin' : 'member'),
      });
      next();
      return;
    }
  }
  // 无 token 或 token 无效：根据策略决定是否兜底默认用户
  if (isDefaultUserAllowed()) {
    const defaultUser = getDefaultUser();
    injectContext(res, {
      tenantId: defaultUser.tenant_id,
      userId: defaultUser.id,
      username: defaultUser.username,
      role: defaultUser.role === 'admin' ? 'admin' : 'member',
    });
    next();
    return;
  }
  // 生产环境且未启用默认用户兜底：拒绝访问
  res.status(401).json({ code: 401, data: null, message: 'Not authenticated' });
}

/**
 * 严格鉴权中间件（生产期使用）：
 * - 必须携带有效签名 token，否则返回 401
 * - 不进行 default-user 兜底
 */
export function requireStaffAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ code: 401, data: null, message: 'Not authenticated' });
    return;
  }
  const payload = decodeToken(token);
  if (!payload) {
    res.status(401).json({ code: 401, data: null, message: 'Invalid or expired token' });
    return;
  }
  injectContext(res, {
    tenantId: payload.tenantId,
    userId: payload.userId,
    username: payload.username,
    role: payload.role === 'admin' ? 'admin' : 'member',
  });
  next();
}

/**
 * 要求 admin 角色中间件（必须先经过 staffAuth）：
 * - 非 admin 角色返回 403
 */
export function requireStaffAdmin(req: Request, res: Response, next: NextFunction): void {
  const ctx = res.locals.staffContext as StaffRequestContext | undefined;
  if (!ctx) {
    res.status(401).json({ code: 401, data: null, message: 'Not authenticated' });
    return;
  }
  if (ctx.role !== 'admin') {
    res.status(403).json({ code: 403, data: null, message: 'Admin role required' });
    return;
  }
  next();
}

/** 从 res.locals 读取当前请求上下文（若未注入则返回默认上下文） */
export function getStaffContext(res: Response): StaffRequestContext {
  const ctx = res.locals.staffContext as StaffRequestContext | undefined;
  if (ctx) return ctx;
  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: DEFAULT_USER_ID,
    username: DEFAULT_USERNAME,
    role: DEFAULT_ROLE === 'admin' ? 'admin' : 'member',
  };
}
