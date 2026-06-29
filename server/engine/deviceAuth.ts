/**
 * Device Auth Manager
 * 设备认证管理器 - JWT + API Key 双模式认证
 */

export type AuthMethod = "jwt" | "api-key" | "oauth" | "session";
export type TokenStatus = "active" | "expired" | "revoked" | "invalid";
export type PermissionLevel = "readonly" | "standard" | "admin" | "root";

export interface AuthToken {
  id: string;
  type: AuthMethod;
  subject: string;
  issuer: string;
  issuedAt: number;
  expiresAt: number;
  notBefore?: number;
  status: TokenStatus;
  permissions: string[];
  permissionLevel: PermissionLevel;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  permissionLevel: PermissionLevel;
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  usageCount: number;
  status: "active" | "revoked" | "expired";
  createdBy: string;
  description?: string;
  allowedIps?: string[];
  rateLimit?: number;
}

export interface AuthResult {
  authenticated: boolean;
  token?: AuthToken;
  apiKey?: ApiKeyInfo;
  subject?: string;
  permissions: string[];
  permissionLevel: PermissionLevel;
  error?: string;
}

export interface CreateApiKeyOptions {
  name: string;
  permissions?: string[];
  permissionLevel?: PermissionLevel;
  description?: string;
  expiresInDays?: number;
  allowedIps?: string[];
  rateLimit?: number;
}

class DeviceAuthManager {
  private readonly tokens = new Map<string, AuthToken>();
  private readonly apiKeys = new Map<string, ApiKeyInfo>();
  private readonly rateLimits = new Map<string, { count: number; windowStart: number }>();
  private defaultRateLimit = 100;
  private rateLimitWindowMs = 60 * 1000;

  constructor() {
    // 空构造函数
  }

  // ========== JWT Token ==========

  createToken(params: {
    subject: string;
    issuer?: string;
    expiresInMs?: number;
    permissions?: string[];
    permissionLevel?: PermissionLevel;
    deviceId?: string;
    deviceName?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): { token: string; tokenInfo: AuthToken } {
    const now = Date.now();
    const tokenId = `tok_${now}_${Math.random().toString(36).slice(2, 10)}`;
    const expiresInMs = params.expiresInMs ?? 24 * 60 * 60 * 1000;

    const tokenInfo: AuthToken = {
      id: tokenId,
      type: "jwt",
      subject: params.subject,
      issuer: params.issuer ?? "cdfknow",
      issuedAt: now,
      expiresAt: now + expiresInMs,
      status: "active",
      permissions: params.permissions ?? ["*"],
      permissionLevel: params.permissionLevel ?? "standard",
      deviceId: params.deviceId,
      deviceName: params.deviceName,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: params.metadata,
    };

    this.tokens.set(tokenId, tokenInfo);

    // 生成模拟 JWT (实际应该用 proper JWT 库)
    const payload = {
      sub: tokenInfo.subject,
      iss: tokenInfo.issuer,
      iat: Math.floor(tokenInfo.issuedAt / 1000),
      exp: Math.floor(tokenInfo.expiresAt / 1000),
      jti: tokenId,
      perms: tokenInfo.permissions,
      level: tokenInfo.permissionLevel,
    };

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = Math.random().toString(36).slice(2, 34);
    const token = `${header}.${body}.${signature}`;

    return { token, tokenInfo };
  }

  verifyToken(token: string): AuthResult {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return this.authFail("Invalid token format");
      }

      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const tokenId = payload.jti;

      const tokenInfo = this.tokens.get(tokenId);
      if (!tokenInfo) {
        return this.authFail("Token not found");
      }

      if (tokenInfo.status !== "active") {
        return this.authFail(`Token is ${tokenInfo.status}`);
      }

      if (Date.now() > tokenInfo.expiresAt) {
        tokenInfo.status = "expired";
        this.tokens.set(tokenId, tokenInfo);
        return this.authFail("Token expired");
      }

      if (tokenInfo.notBefore && Date.now() < tokenInfo.notBefore) {
        return this.authFail("Token not yet valid");
      }

      return {
        authenticated: true,
        token: tokenInfo,
        subject: tokenInfo.subject,
        permissions: tokenInfo.permissions,
        permissionLevel: tokenInfo.permissionLevel,
      };
    } catch (error) {
      return this.authFail(`Invalid token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  revokeToken(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;

    token.status = "revoked";
    this.tokens.set(tokenId, token);
    return true;
  }

  // ========== API Key ==========

  createApiKey(
    createdBy: string,
    options: CreateApiKeyOptions,
  ): { key: string; info: ApiKeyInfo } {
    const now = Date.now();
    const keyId = `ak_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // 生成 API Key
    const keyBody = Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18);
    const key = `sk-${keyBody}`;
    const keyPrefix = key.slice(0, 8);
    const keyHash = this.simpleHash(key);

    const info: ApiKeyInfo = {
      id: keyId,
      name: options.name,
      keyPrefix,
      keyHash,
      permissions: options.permissions ?? ["*"],
      permissionLevel: options.permissionLevel ?? "standard",
      createdAt: now,
      expiresAt: options.expiresInDays ? now + options.expiresInDays * 24 * 60 * 60 * 1000 : undefined,
      usageCount: 0,
      status: "active",
      createdBy,
      description: options.description,
      allowedIps: options.allowedIps,
      rateLimit: options.rateLimit ?? this.defaultRateLimit,
    };

    this.apiKeys.set(keyId, info);

    return { key, info };
  }

  verifyApiKey(key: string, ipAddress?: string): AuthResult {
    const keyHash = this.simpleHash(key);
    const keyPrefix = key.slice(0, 8);

    // 查找匹配的 API Key
    const apiKey = Array.from(this.apiKeys.values()).find(
      (k) => k.keyPrefix === keyPrefix && k.keyHash === keyHash,
    );

    if (!apiKey) {
      return this.authFail("Invalid API key");
    }

    if (apiKey.status !== "active") {
      return this.authFail(`API key is ${apiKey.status}`);
    }

    if (apiKey.expiresAt && Date.now() > apiKey.expiresAt) {
      apiKey.status = "expired";
      this.apiKeys.set(apiKey.id, apiKey);
      return this.authFail("API key expired");
    }

    // IP 白名单检查
    if (apiKey.allowedIps && apiKey.allowedIps.length > 0 && ipAddress) {
      if (!apiKey.allowedIps.includes(ipAddress)) {
        return this.authFail("IP address not allowed");
      }
    }

    // 速率限制检查
    if (!this.checkRateLimit(apiKey.id, apiKey.rateLimit ?? this.defaultRateLimit)) {
      return this.authFail("Rate limit exceeded");
    }

    // 更新使用计数
    apiKey.usageCount++;
    apiKey.lastUsedAt = Date.now();
    this.apiKeys.set(apiKey.id, apiKey);

    return {
      authenticated: true,
      apiKey,
      subject: `api-key:${apiKey.name}`,
      permissions: apiKey.permissions,
      permissionLevel: apiKey.permissionLevel,
    };
  }

  revokeApiKey(keyId: string): boolean {
    const apiKey = this.apiKeys.get(keyId);
    if (!apiKey) return false;

    apiKey.status = "revoked";
    this.apiKeys.set(keyId, apiKey);
    return true;
  }

  listApiKeys(createdBy?: string): ApiKeyInfo[] {
    let keys = Array.from(this.apiKeys.values());
    if (createdBy) {
      keys = keys.filter((k) => k.createdBy === createdBy);
    }
    return keys.sort((a, b) => b.createdAt - a.createdAt);
  }

  getApiKey(keyId: string): ApiKeyInfo | undefined {
    return this.apiKeys.get(keyId);
  }

  // ========== Permission Checks ==========

  hasPermission(auth: AuthResult, permission: string): boolean {
    if (!auth.authenticated) return false;
    if (auth.permissions.includes("*")) return true;
    return auth.permissions.includes(permission);
  }

  hasPermissionLevel(auth: AuthResult, requiredLevel: PermissionLevel): boolean {
    if (!auth.authenticated) return false;

    const levels: Record<PermissionLevel, number> = {
      readonly: 1,
      standard: 2,
      admin: 3,
      root: 4,
    };

    return levels[auth.permissionLevel] >= levels[requiredLevel];
  }

  // ========== Rate Limiting ==========

  private checkRateLimit(identifier: string, limit: number): boolean {
    const now = Date.now();
    const window = this.rateLimits.get(identifier);

    if (!window || now - window.windowStart > this.rateLimitWindowMs) {
      this.rateLimits.set(identifier, { count: 1, windowStart: now });
      return true;
    }

    if (window.count >= limit) {
      return false;
    }

    window.count++;
    return true;
  }

  // ========== Utilities ==========

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private authFail(error: string): AuthResult {
    return {
      authenticated: false,
      permissions: [],
      permissionLevel: "readonly",
      error,
    };
  }

  // ========== Stats ==========

  getStats(): {
    activeTokens: number;
    totalTokens: number;
    activeApiKeys: number;
    totalApiKeys: number;
    totalApiKeyUsage: number;
  } {
    const tokens = Array.from(this.tokens.values());
    const apiKeys = Array.from(this.apiKeys.values());

    return {
      activeTokens: tokens.filter((t) => t.status === "active").length,
      totalTokens: tokens.length,
      activeApiKeys: apiKeys.filter((k) => k.status === "active").length,
      totalApiKeys: apiKeys.length,
      totalApiKeyUsage: apiKeys.reduce((sum, k) => sum + k.usageCount, 0),
    };
  }

  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, token] of this.tokens) {
      if (token.status === "active" && now > token.expiresAt) {
        token.status = "expired";
        this.tokens.set(id, token);
      }
      // 清理 30 天以上的过期 token
      if (token.status !== "active" && now - token.expiresAt > 30 * 24 * 60 * 60 * 1000) {
        this.tokens.delete(id);
        removed++;
      }
    }

    return removed;
  }

  clear(): void {
    this.tokens.clear();
    this.apiKeys.clear();
    this.rateLimits.clear();
  }
}

const AUTH_INSTANCE = new DeviceAuthManager();

export function getDeviceAuth(): DeviceAuthManager {
  return AUTH_INSTANCE;
}

export function verifyAuth(
  token: string,
  method: AuthMethod = "jwt",
  ipAddress?: string,
): AuthResult {
  if (method === "api-key" || token.startsWith("sk-")) {
    return AUTH_INSTANCE.verifyApiKey(token, ipAddress);
  }
  return AUTH_INSTANCE.verifyToken(token);
}

export function createAuthToken(
  params: Parameters<DeviceAuthManager["createToken"]>[0],
): ReturnType<DeviceAuthManager["createToken"]> {
  return AUTH_INSTANCE.createToken(params);
}

export function createApiKey(
  createdBy: string,
  options: CreateApiKeyOptions,
): ReturnType<DeviceAuthManager["createApiKey"]> {
  return AUTH_INSTANCE.createApiKey(createdBy, options);
}

export function resetDeviceAuthForTests(): void {
  AUTH_INSTANCE.clear();
}

export type { DeviceAuthManager };
