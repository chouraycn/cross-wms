/**
 * 模型认证标记 — 用于标识特殊的认证状态
 *
 * 这些标记用于区分真实 API Key 和各种特殊认证状态，
 * 避免在日志和调试输出中泄露敏感信息。
 */

export const ENV_API_KEY_MARKERS = {
  ANTHROPIC: 'env:ANTHROPIC_API_KEY',
  OPENAI: 'env:OPENAI_API_KEY',
  GOOGLE: 'env:GOOGLE_API_KEY',
  DEEPSEEK: 'env:DEEPSEEK_API_KEY',
  GROQ: 'env:GROQ_API_KEY',
  MISTRAL: 'env:MISTRAL_API_KEY',
  COHERE: 'env:CO_API_KEY',
  FIREWORKS: 'env:FIREWORKS_API_KEY',
  DEEPINFRA: 'env:DEEPINFRA_API_KEY',
  CEREBRAS: 'env:CEREBRAS_API_KEY',
  NVIDIA: 'env:NGC_API_KEY',
  OLLAMA: 'local:ollama',
  LITELLM: 'env:LITELLM_API_KEY',
} as const;

export const CUSTOM_LOCAL_AUTH_MARKER = 'local-auth';

export const NON_ENV_SECRETREF_MARKER = 'non-env-secretref';

export const GCP_VERTEX_CREDENTIALS_MARKER = 'gcp-vertex-credentials';

export const AWS_SDK_AUTH_MARKER = 'aws-sdk-auth';

export const OAUTH_AUTH_MARKER = 'oauth-auth';

export const KEYCHAIN_AUTH_MARKER_PREFIX = 'keychain:';

export function isKnownEnvApiKeyMarker(value: string): boolean {
  const markers = Object.values(ENV_API_KEY_MARKERS) as string[];
  return markers.includes(value);
}

export function isNonSecretApiKeyMarker(value: string): boolean {
  return (
    value === CUSTOM_LOCAL_AUTH_MARKER ||
    value === NON_ENV_SECRETREF_MARKER ||
    value === GCP_VERTEX_CREDENTIALS_MARKER ||
    value === AWS_SDK_AUTH_MARKER ||
    value === OAUTH_AUTH_MARKER ||
    value.startsWith(KEYCHAIN_AUTH_MARKER_PREFIX) ||
    isKnownEnvApiKeyMarker(value)
  );
}

export function isKeychainAuthMarker(value: string): boolean {
  return value.startsWith(KEYCHAIN_AUTH_MARKER_PREFIX);
}

export function extractKeychainId(value: string): string | null {
  if (!isKeychainAuthMarker(value)) return null;
  return value.slice(KEYCHAIN_AUTH_MARKER_PREFIX.length) || null;
}

export function redactApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (isNonSecretApiKeyMarker(apiKey)) return apiKey;
  if (apiKey.length <= 8) return '***';
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
}

export function isApiKeySensitive(apiKey: string): boolean {
  return !isNonSecretApiKeyMarker(apiKey);
}
