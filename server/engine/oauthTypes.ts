/**
 * OAuth 认证类型定义 — 对齐 OpenClaw plugin-sdk/provider-oauth-runtime.ts
 */

/** OAuth 凭证 */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  idToken?: string;
  scope?: string;
}

/** OAuth 认证信息 */
export interface OAuthAuthInfo {
  credentials: OAuthCredentials;
  providerId: string;
}

/** OAuth 提供商信息 */
export interface OAuthProviderInfo {
  id: string;
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
}

/** OAuth 提供商接口 */
export interface OAuthProviderInterface {
  providerId: string;
  name: string;
  getAuthorizationUrl: (state?: string) => string;
  exchangeCode: (code: string) => Promise<OAuthCredentials>;
  refreshToken: (refreshToken: string) => Promise<OAuthCredentials>;
  validateToken: (accessToken: string) => Promise<boolean>;
}

/** OAuth 登录回调 */
export interface OAuthLoginCallbacks {
  onSuccess?: (info: OAuthAuthInfo) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

/** OAuth 选择选项 */
export interface OAuthSelectOption {
  providerId: string;
  name: string;
  description?: string;
}

/** OAuth 选择提示 */
export interface OAuthSelectPrompt {
  title: string;
  message: string;
  options: OAuthSelectOption[];
}