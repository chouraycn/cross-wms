import { logger } from '../../logger.js';

export type OAuthFlowResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
};

export type OAuthProvider = {
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
};

export type OAuthCredentials = {
  type: "oauth";
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  scopes?: string[];
  email?: string;
};

const tokenStore = new Map<string, OAuthFlowResult>();

export function isOAuthTokenExpired(token: OAuthFlowResult, marginMs = 60_000): boolean {
  return Date.now() + marginMs >= token.expiresAt;
}

export async function startOAuthFlow(
  provider: OAuthProvider,
  code: string,
): Promise<OAuthFlowResult> {
  logger.info(`[LLM:OAuth] Starting OAuth flow for ${provider.name}`);

  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret ?? '',
      redirect_uri: provider.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  const result: OAuthFlowResult = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
  };

  tokenStore.set(provider.name, result);
  return result;
}

export async function refreshOAuthToken(
  provider: OAuthProvider,
  refreshToken: string,
): Promise<OAuthFlowResult> {
  logger.info(`[LLM:OAuth] Refreshing token for ${provider.name}`);

  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: provider.clientId,
      client_secret: provider.clientSecret ?? '',
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token refresh failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  const result: OAuthFlowResult = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
  };

  tokenStore.set(provider.name, result);
  return result;
}

export function getStoredOAuthToken(providerName: string): OAuthFlowResult | undefined {
  return tokenStore.get(providerName);
}

export function clearStoredOAuthToken(providerName: string): void {
  tokenStore.delete(providerName);
}
