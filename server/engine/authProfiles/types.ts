/**
 * Auth Profile 核心类型定义。
 *
 * 描述凭据载体、运行时使用统计与失败原因，供 store / usage / provider 层共享。
 * 适配自 openclaw 的 auth-profiles 设计，简化为 cross-wms 的 SQLite 单库模型。
 */

/** 凭据类型标识。 */
export type CredentialType = 'api_key' | 'token' | 'oauth';

/** API Key 凭据：provider 颁发的静态密钥。 */
export interface ApiKeyCredential {
  type: 'api_key';
  provider: string;
  key?: string;
  email?: string;
  displayName?: string;
}

/** 静态 Token 凭据：不可由 cross-wms 主动刷新（区别于 oauth）。 */
export interface TokenCredential {
  type: 'token';
  provider: string;
  token?: string;
  /** 可选过期时间戳（毫秒，自 epoch 起）。 */
  expires?: number;
  email?: string;
  displayName?: string;
}

/** 可刷新的 OAuth 凭据，包含 access / refresh token 与过期时间。 */
export interface OAuthCredential {
  type: 'oauth';
  provider: string;
  access: string;
  refresh: string;
  /** 过期时间戳（毫秒，自 epoch 起）。 */
  expires: number;
  email?: string;
  displayName?: string;
}

/** 凭据联合类型，覆盖所有支持的认证方式。 */
export type AuthProfileCredential = ApiKeyCredential | TokenCredential | OAuthCredential;

/** 触发冷却 / 禁用 / 失败计数的封闭原因集合。 */
export type AuthProfileFailureReason =
  | 'auth'
  | 'auth_permanent'
  | 'rate_limit'
  | 'billing'
  | 'timeout'
  | 'model_not_found'
  | 'empty_response'
  | 'unclassified'
  | 'unknown';

/** 单个 profile 的使用统计与 failover 状态。 */
export interface ProfileUsageStats {
  /** 最近一次成功使用时间戳。 */
  lastUsed?: number;
  /** 被外部（如 provider 用量探测）标记为不可用直到此时间。 */
  blockedUntil?: number;
  /** 阶梯式冷却到期时间戳。 */
  cooldownUntil?: number;
  /** 当前冷却窗口内累计失败次数。 */
  errorCount?: number;
  /** 最近一次失败时间戳。 */
  lastFailureAt?: number;
  /** 当前冷却的原因。 */
  cooldownReason?: AuthProfileFailureReason;
}

/** 单个 auth profile：凭据 + 使用统计 + 时间戳。 */
export interface AuthProfile {
  id: string;
  provider: string;
  credential: AuthProfileCredential;
  usageStats: ProfileUsageStats;
  createdAt: number;
  updatedAt: number;
}

/** 完整的内存态 auth profile store，包含凭据、轮转顺序与 lastGood 标记。 */
export interface AuthProfileStore {
  /** profileId → AuthProfile。 */
  profiles: Record<string, AuthProfile>;
  /** provider → 有序 profileId 列表（用于轮转）。 */
  order: Record<string, string[]>;
  /** provider → 最近一次成功的 profileId。 */
  lastGood: Record<string, string>;
}
