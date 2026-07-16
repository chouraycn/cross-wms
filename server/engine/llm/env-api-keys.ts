import { logger } from '../../logger.js';

const ENV_KEY_MAP: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  azure: ['AZURE_OPENAI_API_KEY'],
  cloudflare: ['CLOUDFLARE_AI_API_KEY'],
  zai: ['ZAI_API_KEY', 'Z_AI_API_KEY'],
};

export function getEnvApiKey(provider: string): string | undefined {
  const envKeys = ENV_KEY_MAP[provider.toLowerCase()];
  if (!envKeys) return undefined;
  for (const key of envKeys) {
    const value = process.env[key];
    if (value && value.trim()) {
      logger.debug(`[LLM] Found API key for ${provider} from ${key}`);
      return value.trim();
    }
  }
  return undefined;
}

export function hasEnvApiKey(provider: string): boolean {
  return getEnvApiKey(provider) !== undefined;
}

export function listProvidersWithEnvKeys(): string[] {
  return Object.keys(ENV_KEY_MAP).filter(p => getEnvApiKey(p) !== undefined);
}
