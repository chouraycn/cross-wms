/**
 * 移植自 openclaw/src/agents/model-auth-env.ts
 *
 * 降级实现：提供环境变量 API key 查找，不再抛出 stub 错误。
 */

export type EnvApiKeyResult = {
  apiKey: string;
  envKey: string;
} | null;

export type EnvApiKeyLookupOptions = {
  provider: string;
  prefix?: string;
};

export function resolveEnvApiKey(_options: EnvApiKeyLookupOptions | string): EnvApiKeyResult {
  return null;
}
