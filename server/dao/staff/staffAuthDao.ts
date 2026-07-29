/**
 * StaffAuthDao — sd_users + sd_tenants 表 CRUD（含真实鉴权工具）
 *
 * 设计：
 * - 密码哈希：pbkdf2_hmac(sha256, 12 万次迭代, 随机 salt)（对齐 StaffDeck Python 原版）
 * - 兼容旧 stub_sha256 哈希：verifyPassword 按算法前缀分流，登录后自动升级
 * - token：body.signature 格式，HMAC-SHA256 签名（防伪造）
 * - 桌面应用场景：未带 token 时由中间件决定是否回退默认用户（仅开发模式）
 * - UserRead 不暴露 password_hash
 * - 时间字段使用 INTEGER（Unix 秒）
 */
import crypto from 'crypto';
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { UserRow, UserRead, TenantRow } from '../../types/staff.js';
import { logger } from '../../logger.js';

const now = (): number => Math.floor(Date.now() / 1000);

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 天

// ===================== App Secret（token 签名密钥） =====================

/**
 * Token 签名密钥
 *
 * 优先级：
 * 1. 环境变量 STAFF_AUTH_APP_SECRET
 * 2. 环境变量 OPENCLAW_APP_SECRET
 * 3. 开发期默认值（生产必须覆盖）
 */
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

// 重新导出 DEFAULT_TENANT_ID，供 staffAuth 中间件统一从本模块引用
export { DEFAULT_TENANT_ID };

/**
 * 是否允许 default-user 兜底
 *
 * 桌面应用场景：启动即获得默认身份（admin）
 * 生产场景：必须显式设置 STAFF_AUTH_ALLOW_DEFAULT=1 才启用
 */
export function isDefaultUserAllowed(): boolean {
  return process.env.STAFF_AUTH_ALLOW_DEFAULT === '1' ||
    process.env.NODE_ENV !== 'production';
}

// ===================== 密码哈希（pbkdf2 + 兼容 stub_sha256） =====================

const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const PBKDF2_PREFIX = 'pbkdf2_sha256';
const STUB_PREFIX = 'stub_sha256';
const STUB_SALT = 'staffdeck-stub-salt'; // 旧 stub 的固定 salt，仅用于校验旧哈希

/**
 * 生成 pbkdf2 密码哈希
 * 格式：pbkdf2_sha256$<salt_hex>$<digest_base64url>
 */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.pbkdf2Sync(
    plain,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  return `${PBKDF2_PREFIX}$${salt}$${digest.toString('base64url')}`;
}

/**
 * 校验密码（兼容 pbkdf2_sha256 和旧 stub_sha256）
 *
 * - pbkdf2_sha256：按 salt + 迭代次数计算，hmac.compare_digest 防时序攻击
 * - stub_sha256：旧格式，sha256(password + 固定 salt)，仅用于兼容历史数据
 */
export function verifyPassword(plain: string, storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;

  // 按算法前缀分流
  const parts = storedHash.split('$');
  const algo = parts[0];

  if (algo === PBKDF2_PREFIX) {
    return verifyPbkdf2Password(plain, parts, storedHash);
  }

  if (algo === STUB_PREFIX) {
    return verifyStubPassword(plain, parts, storedHash);
  }

  // 未知算法
  logger.warn(`[staffAuth] 未知密码哈希算法: ${algo}`);
  return false;
}

/** pbkdf2_sha256 密码校验 */
function verifyPbkdf2Password(
  plain: string,
  parts: string[],
  storedHash: string,
): boolean {
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const storedDigest = parts[2];
  if (!salt || !storedDigest) return false;

  const candidate = crypto.pbkdf2Sync(
    plain,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  const candidateStr = `${PBKDF2_PREFIX}$${salt}$${candidate.toString('base64url')}`;

  const candidateBuf = Buffer.from(candidateStr, 'utf8');
  const storedBuf = Buffer.from(storedHash, 'utf8');
  if (candidateBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}

/** stub_sha256 旧密码校验（兼容历史数据） */
function verifyStubPassword(
  plain: string,
  parts: string[],
  storedHash: string,
): boolean {
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const storedDigest = parts[2];
  if (!salt || !storedDigest) return false;

  const candidate = crypto
    .createHash('sha256')
    .update(plain + salt, 'utf8')
    .digest('hex');
  const candidateStr = `${STUB_PREFIX}$${salt}$${candidate}`;

  const candidateBuf = Buffer.from(candidateStr, 'utf8');
  const storedBuf = Buffer.from(storedHash, 'utf8');
  if (candidateBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}

/**
 * 判断密码哈希是否需要升级（stub_sha256 → pbkdf2_sha256）
 */
export function isPasswordHashLegacy(storedHash: string): boolean {
  return typeof storedHash === 'string' && storedHash.startsWith(STUB_PREFIX + '$');
}

// ===================== Token 工具（HMAC-SHA256 签名） =====================

export interface StaffTokenPayload {
  userId: string;
  tenantId: string;
  username: string;
  role: string;
  exp: number;
}

/**
 * 创建 access token：body.signature 格式，HMAC-SHA256 签名
 *
 * body = base64url(JSON.stringify(payload))
 * signature = base64url(HMAC-SHA256(app_secret, body))
 * token = body.signature
 */
export function createAccessToken(
  user: UserRow | DefaultUser,
): string {
  const payload: StaffTokenPayload = {
    userId: user.id,
    tenantId: user.tenant_id,
    username: user.username,
    role: user.role,
    exp: now() + TOKEN_TTL_SECONDS,
  };
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, 'utf8').toString('base64url');
  const signature = signTokenBody(body);
  return `${body}.${signature}`;
}

/** 对 token body 进行 HMAC-SHA256 签名 */
function signTokenBody(body: string): string {
  const secret = getAppSecret();
  const sig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest();
  return sig.toString('base64url');
}

/**
 * 解析 access token（校验签名 + 过期），失败返回 null
 *
 * 1. 按 . 分割为 body / signature
 * 2. 重新计算 body 的 HMAC 签名，与 token 中的签名比较（timingSafeEqual）
 * 3. base64 解码 body 为 payload
 * 4. 检查 exp 过期
 */
export function decodeToken(token: string): StaffTokenPayload | null {
  try {
    const dotIndex = token.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

    const body = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    // 校验签名
    const expectedSignature = signTokenBody(body);
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== providedBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) return null;

    // 解析 payload
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as StaffTokenPayload;
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp < now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ===================== 默认用户（桌面应用兜底） =====================

export interface DefaultUser {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string | null;
  role: string;
}

/**
 * 返回默认用户（桌面应用未鉴权场景下使用，admin 角色）
 *
 * 注意：仅在 isDefaultUserAllowed() 返回 true 时中间件才会调用本函数
 */
export function getDefaultUser(): DefaultUser {
  return {
    id: DEFAULT_USER_ID,
    tenant_id: DEFAULT_TENANT_ID,
    username: DEFAULT_USERNAME,
    display_name: 'Default User',
    role: DEFAULT_ROLE,
  };
}

// ===================== User CRUD =====================

/** row -> read（剥离 password_hash） */
export function toUserRead(row: UserRow): UserRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 按 tenant + username 获取用户 */
export function getUserByUsername(
  tenantId: string,
  username: string,
): UserRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_users WHERE tenant_id = ? AND username = ?')
    .get(tenantId, username) as UserRow | undefined;
}

/** 按 id 获取用户 */
export function getUserById(
  tenantId: string,
  userId: string,
): UserRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_users WHERE tenant_id = ? AND id = ?')
    .get(tenantId, userId) as UserRow | undefined;
}

export interface UserCreateInput {
  tenant_id?: string;
  username: string;
  password: string;
  display_name?: string | null;
  role?: string;
}

/** 创建用户 */
export function createUser(input: UserCreateInput): UserRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.user);
  const ts = now();
  const displayName = (input.display_name ?? input.username).slice(0, 80);
  db.prepare(
    `INSERT INTO sd_users (id, tenant_id, username, display_name, role, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.username,
    displayName,
    input.role ?? 'member',
    hashPassword(input.password),
    ts,
    ts,
  );
  return db.prepare('SELECT * FROM sd_users WHERE id = ?').get(id) as UserRow;
}

export interface UserUpdateInput {
  display_name?: string | null;
  password?: string;
  role?: string;
}

/** 更新用户 */
export function updateUser(
  tenantId: string,
  userId: string,
  patch: UserUpdateInput,
): UserRow | null {
  const db = initDb();
  const existing = getUserById(tenantId, userId);
  if (!existing) return null;

  const next: UserRow = {
    ...existing,
    display_name:
      patch.display_name !== undefined
        ? patch.display_name === null
          ? existing.username
          : patch.display_name.slice(0, 80)
        : existing.display_name,
    role: patch.role ?? existing.role,
    password_hash:
      patch.password !== undefined && patch.password.trim() !== ''
        ? hashPassword(patch.password)
        : existing.password_hash,
    updated_at: now(),
  };

  db.prepare(
    `UPDATE sd_users
     SET display_name = ?, role = ?, password_hash = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.display_name, next.role, next.password_hash, next.updated_at, userId);

  return next;
}

/** 删除用户 */
export function deleteUser(tenantId: string, userId: string): boolean {
  const db = initDb();
  const r = db
    .prepare('DELETE FROM sd_users WHERE tenant_id = ? AND id = ?')
    .run(tenantId, userId);
  return r.changes > 0;
}

/** 列出租户下的全部用户（按 created_at 降序） */
export function listUsers(tenantId: string): UserRow[] {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_users WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(tenantId) as UserRow[];
}

// ===================== Tenant =====================

/** 获取租户 */
export function getTenantById(tenantId: string): TenantRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_tenants WHERE id = ?')
    .get(tenantId) as TenantRow | undefined;
}

/** 判断是否 admin 角色 */
export function isAdminRole(role: string): boolean {
  return role === 'admin';
}
