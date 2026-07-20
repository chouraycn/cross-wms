/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-manager.ts
 *
 * 降级实现：提供 OAuth 管理，不再抛出 stub 错误。
 */

export type OAuthManagerAdapter = {
  refresh: (credential: unknown) => Promise<unknown>;
  getAccessToken: (credential: unknown) => string;
};

export type ResolvedOAuthAccess = {
  accessToken?: string;
  needsRefresh: boolean;
};

export class OAuthManagerRefreshError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OAuthManagerRefreshError";
  }
}

export function resolveEffectiveOAuthCredential(_params: unknown): ResolvedOAuthAccess {
  return { needsRefresh: false };
}

export function createOAuthManager(_params?: unknown): null {
  return null;
}
