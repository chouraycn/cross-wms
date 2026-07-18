/**
 * 设备共享模块 stub — 为移植自 openclaw 的 device-* 模块提供 ../shared/* 依赖的本地实现。
 *
 * 降级原因：openclaw 的 ../shared/device-auth.js、../shared/device-auth-store.js、
 * ../shared/device-bootstrap-profile.js、../shared/operator-scope-compat.js 未移植到 cross-wms。
 *
 * 设计原则：
 *  - 这些共享模块都是纯函数/类型，无外部运行时依赖，因此提供完整实现而非降级占位
 *  - 保持与 openclaw 源码一致的语义，确保 device-* 模块行为正确
 *
 * 参考 openclaw/src/shared/{device-auth,device-auth-store,device-bootstrap-profile,operator-scope-compat}.ts
 */

// ============================================================================
// ../shared/device-auth.js —— 设备认证类型与规范化
// ============================================================================

/** 一个已授权设备角色的存储 bearer token 元数据 */
export type DeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

/** gateway 设备身份的版本化磁盘 device-auth 缓存 */
export type DeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceAuthEntry>;
};

/** 规范化 device-auth 角色 ID，不改变大小写或命名空间 */
export function normalizeDeviceAuthRole(role: string): string {
  return role.trim();
}

/** 规范化 device-auth scopes：去重、排序，并包含隐含的 operator scopes */
export function normalizeDeviceAuthScopes(scopes: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  const out = new Set<string>();
  for (const scope of scopes) {
    if (typeof scope !== "string") {
      continue;
    }
    const trimmed = scope.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  // operator scope 隐含关系保持旧版审批检查与更宽泛授权的兼容性
  if (out.has("operator.admin")) {
    out.add("operator.read");
    out.add("operator.write");
  } else if (out.has("operator.write")) {
    out.add("operator.read");
  }
  return [...out].toSorted();
}

// ============================================================================
// ../shared/device-auth-store.js —— 设备认证存储辅助
// ============================================================================

/** 共享 device-auth 辅助函数和文件系统 infra 包装器使用的存储接缝 */
export type DeviceAuthStoreAdapter = {
  readStore: () => DeviceAuthStore | null;
  writeStore: (store: DeviceAuthStore) => void;
};

function coerceDeviceAuthEntry(role: string, value: unknown): DeviceAuthEntry | null {
  if (!isRecord(value) || typeof value.token !== "string") {
    return null;
  }
  const updatedAtMs =
    typeof value.updatedAtMs === "number" && Number.isFinite(value.updatedAtMs)
      ? value.updatedAtMs
      : 0;
  return {
    token: value.token,
    role,
    scopes: normalizeDeviceAuthScopes(Array.isArray(value.scopes) ? value.scopes : undefined),
    updatedAtMs,
  };
}

function copyCanonicalDeviceAuthTokens(
  tokens: Record<string, unknown>,
): Record<string, DeviceAuthEntry> {
  const out: Record<string, DeviceAuthEntry> = {};
  for (const [rawRole, value] of Object.entries(tokens)) {
    const role = normalizeDeviceAuthRole(rawRole);
    if (!role) {
      continue;
    }
    const entry = coerceDeviceAuthEntry(role, value);
    if (entry) {
      out[role] = entry;
    }
  }
  return out;
}

/** 将原始持久化的 device-auth JSON 强制转换为当前规范存储形状 */
export function coerceDeviceAuthStore(value: unknown): DeviceAuthStore | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.deviceId !== "string") {
    return null;
  }
  if (!isRecord(value.tokens)) {
    return null;
  }
  return {
    version: 1,
    deviceId: value.deviceId,
    tokens: copyCanonicalDeviceAuthTokens(value.tokens),
  };
}

/** 加载一个规范化的角色 token，忽略绑定到不同 gateway 设备 ID 的存储 */
export function loadDeviceAuthTokenFromStore(params: {
  adapter: DeviceAuthStoreAdapter;
  deviceId: string;
  role: string;
}): DeviceAuthEntry | null {
  const store = params.adapter.readStore();
  if (!store || store.deviceId !== params.deviceId) {
    return null;
  }
  const role = normalizeDeviceAuthRole(params.role);
  return coerceDeviceAuthEntry(role, store.tokens[role]);
}

/** 存储一个角色 token，同时保留同一 gateway 设备 ID 的规范 tokens */
export function storeDeviceAuthTokenInStore(params: {
  adapter: DeviceAuthStoreAdapter;
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): DeviceAuthEntry {
  const role = normalizeDeviceAuthRole(params.role);
  const existing = params.adapter.readStore();
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens:
      // device-auth 存储作用域限于一个 gateway 设备 ID；绝不合并从其他 gateway 身份复制的过期 tokens
      existing && existing.deviceId === params.deviceId && existing.tokens
        ? copyCanonicalDeviceAuthTokens(existing.tokens)
        : {},
  };
  const entry: DeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeDeviceAuthScopes(params.scopes),
    updatedAtMs: Date.now(),
  };
  next.tokens[role] = entry;
  params.adapter.writeStore(next);
  return entry;
}

/** 清除一个规范化角色 token，不重写缺失或错误设备的存储 */
export function clearDeviceAuthTokenFromStore(params: {
  adapter: DeviceAuthStoreAdapter;
  deviceId: string;
  role: string;
}): void {
  const store = params.adapter.readStore();
  if (!store || store.deviceId !== params.deviceId) {
    return;
  }
  const role = normalizeDeviceAuthRole(params.role);
  if (!store.tokens[role]) {
    return;
  }
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: store.deviceId,
    tokens: copyCanonicalDeviceAuthTokens(store.tokens),
  };
  delete next.tokens[role];
  params.adapter.writeStore(next);
}

// ============================================================================
// ../shared/device-bootstrap-profile.js —— 设备 bootstrap profile 辅助
// ============================================================================

/** bootstrap token 在设备交接期间携带的规范化 roles/scopes */
export type DeviceBootstrapProfile = {
  roles: string[];
  scopes: string[];
};

/** 调用方提供的 bootstrap profile（在 role/scope 规范化和限定之前） */
export type DeviceBootstrapProfileInput = {
  roles?: readonly string[];
  scopes?: readonly string[];
};

/** 允许跨越短期 bootstrap 交接边界的 operator scopes */
export const BOOTSTRAP_HANDOFF_OPERATOR_SCOPES = [
  "operator.approvals",
  "operator.read",
  "operator.talk.secrets",
  "operator.write",
] as const;

const BOOTSTRAP_HANDOFF_OPERATOR_SCOPE_SET = new Set<string>(BOOTSTRAP_HANDOFF_OPERATOR_SCOPES);

/** 原生 onboarding 交接的默认 setup-code/QR bootstrap profile */
export const PAIRING_SETUP_BOOTSTRAP_PROFILE: DeviceBootstrapProfile = {
  // QR/setup-code bootstrap 必须交接两个 token 用于原生 onboarding：
  // iOS/Android 在 bootstrap auth 激活时抑制 operator 循环，
  // 仅在持久化此有界 operator token 后启动它。
  roles: ["node", "operator"],
  scopes: [...BOOTSTRAP_HANDOFF_OPERATOR_SCOPES],
};

/** 返回输入是否完全匹配当前 setup-code bootstrap profile */
export function isPairingSetupBootstrapProfile(
  input: DeviceBootstrapProfileInput | undefined,
): boolean {
  const profile = normalizeDeviceBootstrapProfile(input);
  if (profile.roles.length !== PAIRING_SETUP_BOOTSTRAP_PROFILE.roles.length) {
    return false;
  }
  if (profile.scopes.length !== PAIRING_SETUP_BOOTSTRAP_PROFILE.scopes.length) {
    return false;
  }
  return (
    profile.roles.every((role, index) => role === PAIRING_SETUP_BOOTSTRAP_PROFILE.roles[index]) &&
    profile.scopes.every((scope, index) => scope === PAIRING_SETUP_BOOTSTRAP_PROFILE.scopes[index])
  );
}

/** 解析 bootstrap profile 可为某个角色携带的请求 scopes 子集 */
export function resolveBootstrapProfileScopesForRole(
  role: string,
  scopes: readonly string[],
): string[] {
  const normalizedRole = normalizeDeviceAuthRole(role);
  const normalizedScopes = normalizeDeviceAuthScopes(Array.from(scopes));
  if (normalizedRole === "operator") {
    return normalizedScopes.filter((scope) => BOOTSTRAP_HANDOFF_OPERATOR_SCOPE_SET.has(scope));
  }
  return [];
}

/** 解析跨角色集的有界 bootstrap 交接 scopes */
export function resolveBootstrapProfileScopesForRoles(
  roles: readonly string[],
  scopes: readonly string[],
): string[] {
  return normalizeDeviceAuthScopes(
    roles.flatMap((role) => resolveBootstrapProfileScopesForRole(role, scopes)),
  );
}

/** 规范化请求的 bootstrap profile 并剥离交接允许列表之外的 scopes */
export function normalizeDeviceBootstrapHandoffProfile(
  input: DeviceBootstrapProfileInput | undefined,
): DeviceBootstrapProfile {
  const profile = normalizeDeviceBootstrapProfile(input);
  // bootstrap 交接 profile 只能携带文档化的交接允许列表
  return {
    roles: profile.roles,
    scopes: resolveBootstrapProfileScopesForRoles(profile.roles, profile.scopes),
  };
}

function normalizeBootstrapRoles(roles: readonly string[] | undefined): string[] {
  if (!Array.isArray(roles)) {
    return [];
  }
  const out = new Set<string>();
  for (const role of roles) {
    const normalized = normalizeDeviceAuthRole(role);
    if (normalized) {
      out.add(normalized);
    }
  }
  return [...out].toSorted();
}

/** 规范化调用方提供的 bootstrap roles/scopes，不应用交接边界 */
export function normalizeDeviceBootstrapProfile(
  input: DeviceBootstrapProfileInput | undefined,
): DeviceBootstrapProfile {
  return {
    roles: normalizeBootstrapRoles(input?.roles),
    scopes: normalizeDeviceAuthScopes(input?.scopes ? [...input.scopes] : []),
  };
}

// ============================================================================
// ../shared/operator-scope-compat.js —— operator scope 兼容性辅助
// ============================================================================

const OPERATOR_ROLE = "operator";
const OPERATOR_ADMIN_SCOPE = "operator.admin";
const OPERATOR_READ_SCOPE = "operator.read";
const OPERATOR_WRITE_SCOPE = "operator.write";
const OPERATOR_SCOPE_PREFIX = "operator.";

function normalizeScopeList(scopes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return [...out];
}

function operatorScopeSatisfied(requestedScope: string, granted: Set<string>): boolean {
  if (!requestedScope.startsWith(OPERATOR_SCOPE_PREFIX)) {
    return false;
  }
  if (granted.has(OPERATOR_ADMIN_SCOPE)) {
    return true;
  }
  if (requestedScope === OPERATOR_READ_SCOPE) {
    return granted.has(OPERATOR_READ_SCOPE) || granted.has(OPERATOR_WRITE_SCOPE);
  }
  if (requestedScope === OPERATOR_WRITE_SCOPE) {
    return granted.has(OPERATOR_WRITE_SCOPE);
  }
  return granted.has(requestedScope);
}

/** 当角色授权满足请求的 scopes（包括 operator 隐含关系）时返回 true */
export function roleScopesAllow(params: {
  role: string;
  requestedScopes: readonly string[];
  allowedScopes: readonly string[];
}): boolean {
  const requested = normalizeScopeList(params.requestedScopes);
  if (requested.length === 0) {
    return true;
  }
  const allowed = normalizeScopeList(params.allowedScopes);
  if (allowed.length === 0) {
    return false;
  }
  const allowedSet = new Set(allowed);
  if (params.role.trim() !== OPERATOR_ROLE) {
    const prefix = `${params.role.trim()}.`;
    return requested.every((scope) => scope.startsWith(prefix) && allowedSet.has(scope));
  }
  return requested.every((scope) => operatorScopeSatisfied(scope, allowedSet));
}

/** 返回角色允许 scopes 未覆盖的第一个请求 scope */
export function resolveMissingRequestedScope(params: {
  role: string;
  requestedScopes: readonly string[];
  allowedScopes: readonly string[];
}): string | null {
  for (const scope of params.requestedScopes) {
    if (
      !roleScopesAllow({
        role: params.role,
        requestedScopes: [scope],
        allowedScopes: params.allowedScopes,
      })
    ) {
      return scope;
    }
  }
  return null;
}

/** 返回不属于任何请求角色的第一个请求 scope */
export function resolveScopeOutsideRequestedRoles(params: {
  requestedRoles: readonly string[];
  requestedScopes: readonly string[];
}): string | null {
  for (const scope of params.requestedScopes) {
    const matchesRequestedRole = params.requestedRoles.some((role) =>
      roleScopesAllow({
        role,
        requestedScopes: [scope],
        allowedScopes: [scope],
      }),
    );
    if (!matchesRequestedRole) {
      return scope;
    }
  }
  return null;
}

// ============================================================================
// @openclaw/normalization-core/record-coerce —— 记录判断降级
// ============================================================================

/** 判断值是否为普通记录对象 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
