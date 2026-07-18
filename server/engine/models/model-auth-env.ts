/**
 * 环境变量认证 — 从环境变量解析模型提供商的 API Key
 *
 * 支持多种环境变量命名约定，包括提供商别名映射。
 */

import { logger } from '../../logger.js';
import { ENV_API_KEY_MARKERS, isKnownEnvApiKeyMarker } from './model-auth-markers.js';

export interface EnvApiKeyResult {
  apiKey: string;
  source: string;
  envVar?: string;
}

export interface EnvApiKeyLookupOptions {
  aliasMap?: Readonly<Record<string, string>>;
  candidateMap?: Readonly<Record<string, readonly string[]>>;
  skipSetupProviderFallback?: boolean;
}

const DEFAULT_PROVIDER_ENV_ALIASES: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
  'azure-openai': 'AZURE_OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  gemini: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'CO_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  'fireworks-ai': 'FIREWORKS_API_KEY',
  deepinfra: 'DEEPINFRA_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  nvidia: 'NGC_API_KEY',
  'nvidia-nim': 'NGC_API_KEY',
  ollama: '',
  litellm: 'LITELLM_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  'tongyi-qianwen': 'DASHSCOPE_API_KEY',
  zhipu: 'ZHIPUAI_API_KEY',
  bigmodel: 'ZHIPUAI_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  tencent: 'TENCENT_HUNYUAN_API_KEY',
  'hunyuan': 'TENCENT_HUNYUAN_API_KEY',
  volcengine: 'ARK_API_KEY',
  doubao: 'ARK_API_KEY',
  xai: 'XAI_API_KEY',
  perplexity: 'PPLX_API_KEY',
  together: 'TOGETHER_API_KEY',
  novita: 'NOVITA_API_KEY',
  siliconflow: 'SILICONFLOW_API_KEY',
};

const DEFAULT_PROVIDER_ENV_CANDIDATES: Record<string, readonly string[]> = {
  openai: ['OPENAI_API_KEY', 'OPENAI_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'DEEPSEEK_KEY'],
  groq: ['GROQ_API_KEY', 'GROQ_KEY'],
  mistral: ['MISTRAL_API_KEY', 'MISTRAL_KEY'],
  cohere: ['CO_API_KEY', 'COHERE_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY', 'FIREWORKS_AI_API_KEY'],
  deepinfra: ['DEEPINFRA_API_KEY', 'DEEP_INFRA_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  nvidia: ['NGC_API_KEY', 'NVIDIA_API_KEY', 'NVAPI_KEY'],
  ollama: ['OLLAMA_HOST'],
  litellm: ['LITELLM_API_KEY', 'LITELLM_MASTER_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  qwen: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'ALIBABA_API_KEY'],
  zhipu: ['ZHIPUAI_API_KEY', 'ZHIPU_API_KEY', 'BIGMODEL_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  tencent: ['TENCENT_HUNYUAN_API_KEY', 'HUNYUAN_API_KEY'],
  volcengine: ['ARK_API_KEY', 'VOLCENGINE_API_KEY', 'DOUBAO_API_KEY'],
  xai: ['XAI_API_KEY'],
  perplexity: ['PPLX_API_KEY', 'PERPLEXITY_API_KEY'],
};

function normalizeProviderIdForAuth(provider: string): string {
  return provider.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
}

export function getDefaultEnvVarForProvider(provider: string): string {
  const normalized = normalizeProviderIdForAuth(provider);
  return DEFAULT_PROVIDER_ENV_ALIASES[normalized] || `${normalized.toUpperCase()}_API_KEY`;
}

export function getEnvCandidatesForProvider(
  provider: string,
  options: EnvApiKeyLookupOptions = {},
): readonly string[] {
  const normalized = normalizeProviderIdForAuth(provider);

  if (options.candidateMap?.[normalized]) {
    return options.candidateMap[normalized];
  }

  if (DEFAULT_PROVIDER_ENV_CANDIDATES[normalized]) {
    return DEFAULT_PROVIDER_ENV_CANDIDATES[normalized];
  }

  const defaultVar = getDefaultEnvVarForProvider(provider);
  return [defaultVar];
}

export function resolveEnvApiKey(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
  options: EnvApiKeyLookupOptions = {},
): EnvApiKeyResult | null {
  const normalized = normalizeProviderIdForAuth(provider);

  if (options.aliasMap?.[normalized]) {
    const alias = options.aliasMap[normalized];
    const markerKey = Object.keys(ENV_API_KEY_MARKERS).find(
      k => (ENV_API_KEY_MARKERS as Record<string, string>)[k] === alias,
    );
    if (markerKey && env[alias]) {
      logger.debug(`[ModelAuthEnv] 通过别名找到环境变量: ${provider} → ${alias}`);
      return {
        apiKey: env[alias]!,
        source: `env:${alias}`,
        envVar: alias,
      };
    }
  }

  const candidates = getEnvCandidatesForProvider(provider, options);

  for (const envVar of candidates) {
    const value = env[envVar];
    if (value && value.trim().length > 0) {
      if (isKnownEnvApiKeyMarker(value)) {
        continue;
      }
      logger.debug(`[ModelAuthEnv] 从环境变量获取认证: ${provider} (${envVar})`);
      return {
        apiKey: value.trim(),
        source: `env:${envVar}`,
        envVar,
      };
    }
  }

  logger.debug(`[ModelAuthEnv] 未找到 ${provider} 的环境变量认证`);
  return null;
}

export function hasEnvApiKey(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
  options: EnvApiKeyLookupOptions = {},
): boolean {
  return resolveEnvApiKey(provider, env, options) !== null;
}

export function listConfiguredEnvProviders(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured: string[] = [];

  for (const [provider, envVars] of Object.entries(DEFAULT_PROVIDER_ENV_CANDIDATES)) {
    for (const envVar of envVars) {
      if (env[envVar] && env[envVar]!.trim().length > 0) {
        configured.push(provider);
        break;
      }
    }
  }

  return configured;
}
