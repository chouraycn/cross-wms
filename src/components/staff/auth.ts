/**
 * StaffDeck auth session utilities. Stores the enterprise auth session in
 * `localStorage` and exposes helpers for the API client to attach the
 * bearer token.
 */

export type EnterpriseAuthUser = {
  id: string
  tenant_id: string
  username: string
  display_name?: string
  role: 'admin' | 'member'
}

export type EnterpriseAuthSession = {
  token: string
  user: EnterpriseAuthUser
}

export const ENTERPRISE_AUTH_STORAGE_KEY = 'ultrarag_auth'

export function getEnterpriseAuthSession(): EnterpriseAuthSession | null {
  return readStoredSession(ENTERPRISE_AUTH_STORAGE_KEY)
}

export function setEnterpriseAuthSession(session: EnterpriseAuthSession): void {
  window.localStorage.setItem(ENTERPRISE_AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearEnterpriseAuthSession(): void {
  window.localStorage.removeItem(ENTERPRISE_AUTH_STORAGE_KEY)
}

/**
 * 确保存在有效 session：无登录态时自动注入默认桌面身份。
 * 用于 CDF Know Claw 桌面应用 — 主应用本身无登录体系，
 * 数字员工模块作为其子模块，随应用启动即获得默认身份（default-user / admin），
 * 不需要用户手动 admin/admin 登录。
 *
 * 后端 staffAuth 中间件已对无 token 请求兜底 default-user，因此此处即使
 * 不写 token 也能正常访问 API；写入默认 session 仅为保持前端上下文一致性。
 */
export function ensureDefaultSession(): EnterpriseAuthSession {
  const existing = getEnterpriseAuthSession()
  if (existing?.token && existing?.user?.id) return existing

  const defaultSession: EnterpriseAuthSession = {
    token: '',
    user: {
      id: 'default-user',
      tenant_id: 'default',
      username: 'default-user',
      display_name: '默认用户',
      role: 'admin',
    },
  }
  setEnterpriseAuthSession(defaultSession)
  return defaultSession
}

function readStoredSession(key: string): EnterpriseAuthSession | null {
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as EnterpriseAuthSession
    // 允许 token='' 的 desktop 默认会话（后端对无 token 请求兜底 default-user）。
    // 原先 !parsed.token 把空字符串视为无效，导致 iframe 内 getEnterpriseAuthSession()
    // 一直返回 null，反复向父窗口请求 AUTH，父窗口发送 token='' 又被忽略 → 闪动循环。
    if (!parsed.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

export function isEnterpriseAdmin(user?: EnterpriseAuthUser | null): boolean {
  return user?.role === 'admin'
}

export function isGalleryEmployee(agent?: { metadata?: Record<string, unknown> } | null): boolean {
  return agent?.metadata?.published_to_gallery === true
}

export function isEmployeeOwnedBy(
  agent: { metadata?: Record<string, unknown> },
  user?: EnterpriseAuthUser | null,
): boolean {
  if (!user) return false
  const metadata = agent.metadata || {}
  const ownerUserId = metadata.owner_user_id
  return ownerUserId === user.id
}

// --- Token / current-user convenience helpers -------------------------------

export function getToken(): string | null {
  return getEnterpriseAuthSession()?.token || null
}

export function setToken(token: string): void {
  const existing = getEnterpriseAuthSession()
  if (existing) {
    setEnterpriseAuthSession({ ...existing, token })
  }
}

export function removeToken(): void {
  clearEnterpriseAuthSession()
}

export function getCurrentUser(): EnterpriseAuthUser | null {
  return getEnterpriseAuthSession()?.user || null
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}
