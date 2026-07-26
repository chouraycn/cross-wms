/**
 * StaffAuthDao — sd_users + sd_tenants 表 CRUD（含 stub 鉴权工具）
 *
 * 设计：
 * - 密码哈希使用 stub：sha256(password + salt)，salt 固定（开发期）
 * - token 使用 stub JWT-like 格式：base64(JSON.stringify({ userId, tenantId, role, exp }))
 * - 默认租户场景：未带 token 时使用默认用户 default-user（admin 角色）
 * - UserRead 不暴露 password_hash
 * - 时间字段使用 INTEGER（Unix 秒）
 */
import crypto from 'crypto';
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { UserRow, UserRead, TenantRow } from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 天
const STUB_SALT = 'staffdeck-stub-salt';

// ===================== 默认用户（开发期兜底） =====================

export const DEFAULT_USER_ID = 'default-user';
export const DEFAULT_USERNAME = 'default-user';
export const DEFAULT_ROLE = 'admin';

// 重新导出 DEFAULT_TENANT_ID，供 staffAuth 中间件统一从本模块引用
export { DEFAULT_TENANT_ID };

// ===================== 密码哈希（stub） =====================

/** stub 密码哈希：sha256(password + salt) */
export function hashPassword(plain: string): string {
  return `stub_sha256$${STUB_SALT}$${crypto
    .createHash('sha256')
    .update(plain + STUB_SALT, 'utf8')
    .digest('hex')}`;
}

/** 校验密码 */
export function verifyPassword(plain: string, storedHash: string): boolean {
  const expected = hashPassword(plain);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const storedBuf = Buffer.from(storedHash, 'utf8');
  if (expectedBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, storedBuf);
}

// ===================== Token 工具（stub JWT-like） =====================

export interface StaffTokenPayload {
  userId: string;
  tenantId: string;
  username: string;
  role: string;
  exp: number;
}

/** 创建 stub access token：base64(JSON.stringify(payload)) */
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
  return Buffer.from(json, 'utf8').toString('base64url');
}

/** 解析 stub access token，失败返回 null（不抛异常） */
export function decodeToken(token: string): StaffTokenPayload | null {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as StaffTokenPayload;
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp < now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ===================== 默认用户（开发期） =====================

export interface DefaultUser {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string | null;
  role: string;
}

/** 返回默认用户（未鉴权场景下使用，admin 角色） */
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
