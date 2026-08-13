/**
 * StaffDeck 会话上下文工具（2026-08-13 简化版）。
 *
 * 变更：删除独立「员工认证登录」体系 — 移除登录页、真实 token 登录门、
 * ensureDefaultSession 等确保会话的强制逻辑。
 *
 * 保留：
 * - EnterpriseAuthUser / EnterpriseAuthSession 类型结构：被 StaffLayout
 *   Context、权限判定、employee.ts、client.ts、EmployeeProfileEditor 等下游
 *   直接使用的 currentUser 上下文类型，保持字段兼容。
 * - isEnterpriseAdmin / isEmployeeOwnedBy / isGalleryEmployee / isAdmin：权限判定
 * - getEnterpriseAuthSession / setEnterpriseAuthSession / clearEnterpriseAuthSession /
 *   getToken / setToken / removeToken / getCurrentUser / isAuthenticated：
 *   API 客户端(client.ts) 仍通过 getToken() 读取 Bearer 头；桌面端 token 为空，
 *   后端 staffAuth 中间件会兜底 default-user（admin）。
 *
 * 桌面端无强制登录：session 可存在(本地缓存或 iframe 透传)或不存在，不存在时
 * 所有下游均使用 null/undefined + 后端 default-user 兜底，不再报错或重定向到登录页。
 */

export type EnterpriseAuthUser = {
  id: string;
  tenant_id: string;
  username: string;
  display_name?: string;
  role: 'admin' | 'member';
};

export type EnterpriseAuthSession = {
  token: string;
  user: EnterpriseAuthUser;
};

export const ENTERPRISE_AUTH_STORAGE_KEY = 'ultrarag_auth';

/** 桌面端默认身份（内存常量，不再写入 localStorage 作为登录门） */
export const DEFAULT_DESKTOP_USER: EnterpriseAuthUser = {
  id: 'default-user',
  tenant_id: 'default',
  username: 'default-user',
  display_name: '默认用户',
  role: 'admin',
};

export function getEnterpriseAuthSession(): EnterpriseAuthSession | null {
  return readStoredSession(ENTERPRISE_AUTH_STORAGE_KEY);
}

export function setEnterpriseAuthSession(session: EnterpriseAuthSession): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(ENTERPRISE_AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearEnterpriseAuthSession(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(ENTERPRISE_AUTH_STORAGE_KEY);
}

function readStoredSession(key: string): EnterpriseAuthSession | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EnterpriseAuthSession;
    if (!parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isEnterpriseAdmin(user?: EnterpriseAuthUser | null): boolean {
  // 桌面端未登录时：视为 admin（后端兜底 default-user = admin）
  if (!user) return true;
  return user.role === 'admin';
}

export function isGalleryEmployee(agent?: { metadata?: Record<string, any> } | null): boolean {
  return agent?.metadata?.published_to_gallery === true;
}

export function isEmployeeOwnedBy(
  agent: { metadata?: Record<string, any> },
  user?: EnterpriseAuthUser | null,
): boolean {
  if (!user) {
    // 桌面端默认 admin：视为拥有所有非 gallery 员工
    return !isGalleryEmployee(agent);
  }
  const metadata = agent.metadata || {};
  const ownerUserId = metadata.owner_user_id;
  return ownerUserId === user.id;
}

// --- Token / current-user convenience helpers -------------------------------

export function getToken(): string | null {
  return getEnterpriseAuthSession()?.token || null;
}

export function setToken(token: string): void {
  const existing = getEnterpriseAuthSession();
  if (existing) {
    setEnterpriseAuthSession({ ...existing, token });
  }
}

export function removeToken(): void {
  clearEnterpriseAuthSession();
}

export function getCurrentUser(): EnterpriseAuthUser | null {
  const stored = getEnterpriseAuthSession();
  return stored?.user ?? null;
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}
