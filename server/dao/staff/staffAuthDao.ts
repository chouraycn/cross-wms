/**
 * StaffAuthDao（精简版，2026-08-13）
 *
 * 变更：删除独立「员工认证登录」体系（密码哈希、token 签发、User/Tenant CRUD）。
 *
 * 保留：
 * - default-user 常量与默认用户描述（被 staffAuth 中间件、feedback、权限校验使用）
 * - decodeToken()：若上游仍携带 token（旧 token 或外部签发）时仍可校验签名
 * - getUserById()：feedback 路由按 tenant+id 反查用户信息显示
 *
 * 登录体系与相关路由已移除，桌面端始终默认身份（admin / default-user）。
 */
import crypto from 'crypto';
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { UserRow } from '../../types/staff.js';
import { logger } from '../../logger.js';

const now = (): number => Math.floor(Date.now() / 1000);
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 天

// ===================== App Secret（token 签名密钥） =====================

function getAppSecret(): string {
  const secret =
    process.env.STAFF_AUTH_APP_SECRET ||
    process.env.OPENCLAW_APP_SECRET ||
    'staffdeck-dev-secret-change-in-production';
  return secret;
}

// ===================== 默认用户（桌面应用兜底） =====================

export const DEFAULT_USER_ID = 'default-user';
export const DEFAULT_USERNAME = 'default-user';
export const DEFAULT_ROLE = 'admin';

export { DEFAULT_TENANT_ID };

export function isDefaultUserAllowed(): boolean {
  return process.env.STAFF_AUTH_ALLOW_DEFAULT === '1' ||
    process.env.NODE_ENV !== 'production';
}

// ===================== Token 工具（HMAC-SHA256 签名，仅保留解码） =====================

export interface StaffTokenPayload {
  userId: string;
  tenantId: string;
  username: string;
  role: string;
  exp: number;
}

function signTokenBody(body: string): string {
  const secret = getAppSecret();
  const sig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest();
  return sig.toString('base64url');
}

export function decodeToken(token: string): StaffTokenPayload | null {
  try {
    const dotIndex = token.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

    const body = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    const expectedSignature = signTokenBody(body);
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== providedBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) return null;

    const json = Buffer.from(body, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as StaffTokenPayload;
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp < now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ===================== DefaultUser 描述 =====================

export interface DefaultUser {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string | null;
  role: string;
}

export function getDefaultUser(): DefaultUser {
  return {
    id: DEFAULT_USER_ID,
    tenant_id: DEFAULT_TENANT_ID,
    username: DEFAULT_USERNAME,
    display_name: 'Default User',
    role: DEFAULT_ROLE,
  };
}

// ===================== User 查询（保留，供 feedback 等反查） =====================

/** 按 id 获取用户 */
export function getUserById(
  tenantId: string,
  userId: string,
): UserRow | undefined {
  const db = initDb();
  try {
    return db
      .prepare('SELECT * FROM sd_users WHERE tenant_id = ? AND id = ?')
      .get(tenantId, userId) as UserRow | undefined;
  } catch (err) {
    // sd_users 表未初始化或字段缺失时不报错
    logger.debug(`[staffAuthDao] getUserById 失败，回退 undefined: ${(err as Error).message}`);
    return undefined;
  }
}
