/**
 * StaffDeck Auth Routes — /api/staffdeck/auth
 *
 * 端点：
 *   POST   /login           登录（用户名+密码校验，返回 stub token）
 *   GET    /me              获取当前用户（从 token 解析）
 *   POST   /users           创建用户（admin 权限）
 *   GET    /users           用户列表（admin 权限）
 *   PUT    /users/:user_id  更新用户（admin 权限）
 *   DELETE /users/:user_id  删除用户（admin 权限）
 *
 * 响应格式统一为 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import {
  getUserByUsername,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  listUsers,
  toUserRead,
  verifyPassword,
  createAccessToken,
  isAdminRole,
  type UserCreateInput,
  type UserUpdateInput,
} from '../../dao/staff/staffAuthDao.js';
import {
  getStaffContext,
  staffAuth,
  requireStaffAdmin,
} from '../../middleware/staffAuth.js';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';

const router = Router();

// ===================== POST /api/staffdeck/auth/login =====================

router.post('/login', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : DEFAULT_TENANT_ID;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    res.status(400).json({ code: 400, data: null, message: 'Username and password are required' });
    return;
  }

  const user = getUserByUsername(tenantId, username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ code: 401, data: null, message: 'Invalid username or password' });
    return;
  }

  const token = createAccessToken(user);
  res.json({
    code: 0,
    data: {
      access_token: token,
      token_type: 'bearer' as const,
      user: toUserRead(user),
    },
    message: 'ok',
  });
});

// ===================== GET /api/staffdeck/auth/me =====================

router.get('/me', staffAuth, (_req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  // 默认用户场景（未带 token）下返回 stub 用户
  const user = getUserById(ctx.tenantId, ctx.userId);
  if (!user) {
    // 兜底：返回基于上下文的 stub 用户
    res.json({
      code: 0,
      data: {
        id: ctx.userId,
        tenant_id: ctx.tenantId,
        username: ctx.username,
        display_name: ctx.username,
        role: ctx.role,
        created_at: null,
        updated_at: null,
      },
      message: 'ok',
    });
    return;
  }
  res.json({ code: 0, data: toUserRead(user), message: 'ok' });
});

// ===================== POST /api/staffdeck/auth/users =====================

router.post('/users', staffAuth, requireStaffAdmin, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const body = req.body ?? {};
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : ctx.tenantId;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (ctx.tenantId !== tenantId) {
    res.status(403).json({ code: 403, data: null, message: 'Cannot create accounts for another tenant' });
    return;
  }
  if (!username || !password) {
    res.status(400).json({ code: 400, data: null, message: 'Username and password are required' });
    return;
  }

  const role = body.role === 'admin' || body.role === 'member' ? body.role : 'member';
  const existing = getUserByUsername(tenantId, username);
  if (existing) {
    res.status(409).json({ code: 409, data: null, message: 'Account already exists' });
    return;
  }

  const input: UserCreateInput = {
    tenant_id: tenantId,
    username,
    password,
    display_name: typeof body.display_name === 'string' ? body.display_name : username,
    role,
  };
  const user = createUser(input);
  res.status(201).json({ code: 0, data: toUserRead(user), message: 'ok' });
});

// ===================== GET /api/staffdeck/auth/users =====================

router.get('/users', staffAuth, requireStaffAdmin, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const tenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id : ctx.tenantId;
  if (ctx.tenantId !== tenantId) {
    res.status(403).json({ code: 403, data: null, message: 'Cannot list accounts for another tenant' });
    return;
  }
  const rows = listUsers(tenantId).map(toUserRead);
  res.json({ code: 0, data: rows, message: 'ok' });
});

// ===================== PUT /api/staffdeck/auth/users/:user_id =====================

router.put('/users/:user_id', staffAuth, requireStaffAdmin, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const userId = req.params.user_id;
  const body = req.body ?? {};
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : ctx.tenantId;
  if (ctx.tenantId !== tenantId) {
    res.status(403).json({ code: 403, data: null, message: 'Cannot update accounts for another tenant' });
    return;
  }

  const existing = getUserById(tenantId, userId);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: 'Account not found' });
    return;
  }

  const patch: UserUpdateInput = {};
  if (typeof body.display_name === 'string') {
    patch.display_name = body.display_name;
  } else if (body.display_name === null) {
    patch.display_name = null;
  }
  if (typeof body.password === 'string') {
    patch.password = body.password;
  }
  if (body.role === 'admin' || body.role === 'member') {
    // 不允许修改自己的角色
    if (body.role !== existing.role && existing.id === ctx.userId) {
      res.status(400).json({ code: 400, data: null, message: 'Cannot change your own account role' });
      return;
    }
    patch.role = body.role;
  }

  const updated = updateUser(tenantId, userId, patch);
  if (!updated) {
    res.status(404).json({ code: 404, data: null, message: 'Account not found' });
    return;
  }
  res.json({ code: 0, data: toUserRead(updated), message: 'ok' });
});

// ===================== DELETE /api/staffdeck/auth/users/:user_id =====================

router.delete('/users/:user_id', staffAuth, requireStaffAdmin, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const userId = req.params.user_id;
  const tenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id : ctx.tenantId;
  if (ctx.tenantId !== tenantId) {
    res.status(403).json({ code: 403, data: null, message: 'Cannot delete accounts for another tenant' });
    return;
  }

  const existing = getUserById(tenantId, userId);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: 'Account not found' });
    return;
  }

  // 不允许删除自己或 admin 账号
  if (existing.id === ctx.userId || isAdminRole(existing.role)) {
    res.status(400).json({ code: 400, data: null, message: 'Administrator account cannot be deleted' });
    return;
  }

  const ok = deleteUser(tenantId, userId);
  if (!ok) {
    res.status(500).json({ code: 500, data: null, message: '删除用户失败' });
    return;
  }
  res.json({ code: 0, data: { ok: true }, message: 'ok' });
});

export default router;
