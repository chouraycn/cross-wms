/**
 * StaffDeck Memories Routes — 挂载 /api/staffdeck/memories
 *
 * 端点：
 *   GET    /     — 当前用户的所有记忆
 *   DELETE /me   — 清空当前用户记忆
 *
 * 注意：StaffDeck 鉴权未接入，当前用 query 参数 user_id 标识用户。
 *      接入 StaffDeck auth 后应从 res.locals 获取当前用户。
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { MemoryRecordRow, MemoryRecordRead } from '../../types/staff.js';
import * as memoryDao from '../../dao/staff/staffMemoryDao.js';

const router = Router();

// ===================== 当前用户上下文 =====================
// StaffDeck auth 中间件注入 res.locals.staffContext = { tenantId, userId, username, role }
const STUB_USER_ID = 'user_default';

function getCurrentUserId(req: Request): string {
  const ctx = req.res?.locals?.staffContext as { userId?: string } | undefined;
  if (ctx?.userId) return ctx.userId;
  return (req.query.user_id as string) || STUB_USER_ID;
}

function getCurrentUsername(req: Request): string | null {
  const ctx = req.res?.locals?.staffContext as { username?: string } | undefined;
  if (ctx?.username) return ctx.username;
  return (req.query.username as string) || null;
}

// ===================== Row → Read 转换 =====================

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function memoryRead(row: MemoryRecordRow): MemoryRecordRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    username: row.username,
    session_id: row.session_id,
    kind: row.kind,
    content: row.content,
    importance: row.importance,
    metadata: parseJson(row.metadata_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ===================== GET / — 当前用户的所有记忆 =====================

router.get('/', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const userId = getCurrentUserId(req);
  const username = getCurrentUsername(req);
  const q = req.query.q as string | undefined;
  const kind = req.query.kind as string | undefined;
  const limit = parseInt(req.query.limit as string, 10) || 100;

  // 与 StaffDeck 行为一致：默认排除 conversation 类型
  const rows = memoryDao.listMemories(tenantId, {
    user_id: userId,
    username: username ?? undefined,
    kind: kind ?? undefined,
    exclude_kind: kind ? undefined : 'conversation',
    q: q ?? undefined,
    limit,
  });
  res.json({ code: 0, data: rows.map(memoryRead), message: 'ok' });
});

// ===================== DELETE /me — 清空当前用户记忆 =====================

router.delete('/me', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const userId = getCurrentUserId(req);
  const deleted = memoryDao.clearMemoriesByUser(tenantId, userId);
  res.json({ code: 0, data: { deleted }, message: 'ok' });
});

export default router;
